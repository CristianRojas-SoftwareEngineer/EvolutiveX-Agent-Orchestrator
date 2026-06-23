## Context

El gateway `smart-code-proxy` reproduce audio al cierre de cada turno de Claude Code para confirmar al usuario, vía voz, que la solicitud fue recibida (`UserPromptSubmit`) y resumir lo ejecutado (`Stop`, `SubagentStop`, `StopFailure`). Hoy la síntesis se delega a la API Gemini (`gemini-2.5-flash-preview-tts` y `gemini-3.1-flash-tts-preview`), ambas con un free tier limitado a 10 RPD en el dashboard del usuario. La cuota se agota en ≈5 turnos útiles: tras el agotamiento, `gemini-tts.service.ts:105-108` retorna en silencio y el gateway registra `[Gemini TTS] HTTP 429; síntesis omitida` (verificado en commit `9721e8b` y memoria `tts-gemini-429-silent.md`). El usuario deja de escuchar la voz sin un canal de notificación alternativo.

El reemplazo completo por un motor local elimina la dependencia de cuota y de red, pero introduce una decisión de diseño que el proyecto no ha tomado antes: **dónde vive el motor TTS**. Tres rutas exploradas en este turno:

1. **Wrapper nativo per-OS** (`child_process.spawn` + PowerShell `SoundPlayer` / `afplay` / `aplay`): validada como viable en un spike anterior; rechaza por costo de mantenimiento crónico (5 fuentes de fricción documentadas: tres APIs de error distintas, cleanup de WAVs, control de volumen, concurrencia, CI headless).
2. **Runtime en Rust con IPC JSON** (propuesta `docs/proposal/new-tts-implementation.md`): justifica su complejidad solo cuando entremos a streaming PCM (V4) o full-duplex (V5); para V1 es over-engineering.
3. **Sidecar en Rust que embebe Piper + CPAL** (esta propuesta): un único binario vendible por plataforma. El gateway solo sabe hablar STDIN/STDOUT con ese binario; el conocimiento del SO y del motor TTS queda encapsulado en el sidecar. **Esta es la ruta elegida** porque minimiza la superficie de código TS de audio (≈50 líneas, una sola ruta de error) y deja el camino abierto a CPAL streaming sin reescritura del binario.

## Goals / Non-Goals

**Goals:**

- Eliminar la dependencia de Gemini para síntesis de voz. El gateway deja de llamar a `gemini-2.5-flash-preview-tts` o cualquier modelo Gemini TTS.
- Mantener el comportamiento observable: voz en español al recibir/cerrar turnos, log estructurado cuando falla, hook HTTP retornando 2xx aunque la voz no suene.
- Proveer una única ruta de error tipificada (`reason`) para todos los modos de fallo del sidecar, sin reintroducir SAPI/OpenRouter/Gemini como fallback.
- Distribuir el binario `tts-sidecar` y su modelo de voz de forma reproducible y verificable (SHA256) por plataforma, sin contaminar el repo con artefactos binarios grandes.
- Mantener la latencia del hook predecible: el handler espera al sidecar (con timeout) y retorna solo cuando termina o expira.

**Non-Goals:**

- Reemplazar el generador de texto (intención/resumen). Este delta **no** toca cómo se compone el texto a decir; solo cambia **cómo se sintetiza**. Si más adelante hace falta cambiar el generador de texto (p. ej. por agotamiento de cuota de Gemini para *texto*), será un delta separado.
- Streaming PCM (V4 de la propuesta original) ni full-duplex (V5). El contrato del sidecar en V1 es `speak` bloqueante; futuros deltas pueden extender el contrato sin romper V1.
- Reemplazar la feature de dictado por micrófono (`scripting/install/features/voice.ts`). Es entrada de voz, no salida; no forma parte de este delta.
- Versionado semántico del binario más allá de una URL fija versionada (`/v1/`) y un manifiesto SHA256 por plataforma. No se introduce un canal de updates automático.

## Decisions

### D1 — Sidecar en Rust que embebe Piper + CPAL

**Elección:** binario único `tts-sidecar` por plataforma, compilado con `cargo build --release --target <triple>` para `x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`.

**Por qué Rust y no Go:** la elección del usuario en `resolve-open-decisions` prioriza la cercanía con CPAL para V4 (streaming PCM) y V5 (full-duplex). Go tiene latencia de compilación mucho menor pero sus bindings de audio (malgo, portaudio) son menos maduros que CPAL para control fino de buffers. Cross-compile más caro (~3-5 min/plataforma vs segundos en Go), aceptable porque la compilación ocurre en el pipeline de release, no en el workstation del usuario.

**Piper embebido:** Piper se linkea como librería dentro del binario Rust, vía crate que envuelva `piper-phonemize` o equivalente. La sub-decisión de **qué crate** se resuelve en `apply` mirando el ecosistema (candidatos: `piper-rs`, integración manual vía `bindgen` con la librería C++ de Piper). **El gateway nunca invoca un binario `piper` externo** — solo conoce el binario `tts-sidecar`.

**CPAL para reproducción:** CPAL es la única dependencia que el binario necesita para audio output cross-platform. Encapsula WASAPI (Windows), CoreAudio (macOS) y ALSA/PulseAudio/PipeWire (Linux). Toda la complejidad per-OS queda dentro del sidecar.

**Por qué no wrapper nativo per-OS:** mantener PowerShell `SoundPlayer` + `afplay` + `aplay` en TS crónicamente es la fricción que el usuario explícitamente rechazó ("feature marginal que no debería tener que mantener para 3 SOs"). Piper embebido en Rust ya paga ese costo una vez, en un lenguaje que ya no es TS.

**Por qué no el runtime-en-Rust-con-IPC de la propuesta original:** ese diseño justifica su costo cuando hay comandos `play/stop/pause/resume/set_volume` con estado mutable compartido. En V1 el único comando es `speak` bloqueante; el estado es trivial. El runtime completo se introduce en V2 o V3 cuando los comandos lo exijan, no antes.

### D2 — Voz inicial `es_MX` (México, español latino neutro)

**Elección:** vendorización del modelo ONNX `es_MX-*` desde `huggingface.co/rhasspy/piper-voices` (URL exacta a confirmar en `apply`; candidato: `es_MX-claude-voice-medium.onnx` + `.onnx.json`) hacia `vendor/tts-sidecar/voices/es_MX/`.

**Por qué México y no Argentina:** México es el mercado más amplio de español; el acento es razonablemente neutro para Centroamérica, Colombia, Perú, Chile. Argentina/rioplatense suena ajeno para usuarios fuera del Cono Sur (voseo, sheísmo). El usuario lo eligió explícitamente en `resolve-open-decisions`.

**Parametrización del campo `voice`:** el contrato JSON incluye `voice: "es_MX"` como campo explícito, no hardcoded. Esto permite añadir `es_AR`, `es_CO`, etc. en deltas futuros cambiando solo el modelo vendorizado, sin tocar el gateway.

### D3 — Distribución postinstall con verificación SHA256

**Elección:** `scripts/postinstall-tts.ts` descarga el binario y el modelo desde una URL base fija versionada (candidato: `https://tts-sidecar.example.com/v1/`), valida cada archivo contra `tts-sidecar.sha256` (manifiesto versionado en el repo), y los coloca en `vendor/tts-sidecar/<platform>-<arch>/` y `vendor/tts-sidecar/voices/es_MX/` respectivamente.

**Por qué postinstall y no vendorización directa:** binarios de 50-100 MB inflarían el repo; LFS añade fricción operacional (lfs install/pull) que no compensa para una descarga única al setup. La verificación SHA256 da integridad criptográfica equivalente a vendorizar (mismo artefacto verificado en cada máquina) sin el costo de storage.

**Postinstall degradado, no bloqueante:** si la descarga falla (sin red, plataforma no soportada, SHA256 inválido), el script sale con código no-cero pero **no** aborta `npm install`. El gateway arranca sin voz (log claro `[TTS-SIDE] reason: sidecar-missing`), y `npm run tts:setup` reintenta la instalación manualmente.

**Por qué ignorar `vendor/tts-sidecar/` en git:** los binarios son outputs del setup, no fuentes. Versionar outputs satura el historial de Git con archivos binarios no-code-reviewable.

### D4 — Contrato sidecar ↔ gateway sobre STDIN/STDOUT

**Elección:** JSON por línea, un comando por turno. Request: `{"cmd":"speak","text":"...","voice":"es_MX"}\n`. Response: `{"status":"ok"}\n` o `{"status":"error","message":"..."}\n`.

**Por qué STDIN/STDOUT y no TCP/HTTP/gRPC:** la propuesta original lo justifica bien (sin puertos, fácil despliegue, fácil depuración con `cat | tts-sidecar`). En V1, que es un solo comando bloqueante, no se necesita nada más sofisticado.

**Por qué bloqueante:** el handler ya espera a que la síntesis termine antes de retornar el hook (ver requirement canónico "Síntesis de audio completa antes de retornar" en `openspec/specs/tts-hooks/spec.md:117`). El contrato debe respetar esa propiedad: el sidecar cierra stdout solo cuando termina la reproducción (o falla).

**Por qué timeout configurable:** la latencia puede variar entre máquinas. Default 30s; configurable vía `TTS_SIDECAR_TIMEOUT_MS` en env. Si expira, el gateway mata el proceso y reporta `reason: "timeout"`.

**stderr:** ignorado para control de flujo; el sidecar puede escribir logs de debug ahí, y el gateway los loggea como debug-level (no como `[TTS-SIDE]`).

### D5 — Servicio TS nuevo: `PiperSidecarService`

**Elección:** `src/2-services/tts/piper-sidecar.service.ts` implementa `speak(text: string): Promise<void>`. Resuelve path con `resolveSidecarAssets()` (lectura de filesystem, sin red). Errores tipificados:

- `SidecarNotInstalledError` → traducido a `[TTS-SIDE]` con `reason: "sidecar-missing"`.
- `SidecarExecutionError` con `reason` específico (`spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`).

**Por qué un único método:** la superficie del cambio es mínima. El handler ya tiene `speakAsync(event, mode)` que compone texto + invoca TTS; internamente pasa a delegar en `PiperSidecarService.speak(text)`.

**Por qué errores tipificados, no excepciones genéricas:** los `reason` del log `[TTS-SIDE]` son la API observable para diagnosticar fallos en producción. Mapear cada modo de fallo a un string estable es más útil que un stack trace genérico.

### D6 — Composición del texto NO se toca

**Elección:** el sidecar SOLO hace TTS. La generación del texto (intención/resumen) sigue usando el provider activo de la sesión o Gemini para esa tarea específica. **Este delta no cambia la generación del texto**, solo la ruta de síntesis.

**Por qué no tocar la generación del texto:** la memoria `tts-gemini-429-silent.md` muestra que el problema de cuota Gemini es para **TTS** específicamente (`gemini-2.5-flash-preview-tts`, 10 RPD). El texto de intención/resumen usa `gemini-2.5-flash` o `gemini-3.1-flash-lite`, con cuotas distintas (500 RPD para Lite). Si el texto Gemini se agotara, sería un delta separado, no este.

**Texto dinámico por turno:** el requirement canónico "Mensaje dinámico emite log TTS-SPEECH" (línea 175) preserva el comportamiento de texto variable por turno. No se reintroduce el error de caché que se cometió en exploración previa.

### D7 — Migración: eliminar, no deprecar

**Elección:** los servicios y constantes retirados se ELIMINAN del código fuente. No quedan como legacy, no se exponen con flag, no se documentan como "deprecated". Esta es la regla explícita del usuario: "sólo mantener fallbacks legítimos, no fallbacks por retrocompatibilidad".

Archivos a eliminar:

- `src/2-services/tts/gemini-tts.service.ts`
- `src/2-services/tts/sapi-tts.service.ts`
- `src/2-services/tts/openrouter-tts.service.ts`
- `src/2-services/tts/fallback-speech.constants.ts`

Modificaciones (sin eliminación de archivos):

- `src/3-operations/audit-hook-event.handler.ts:75,101,130,147` — reemplazar `speakAsync` / `announceStop` por delegación a `PiperSidecarService`.
- `src/4-api/composition-root.ts` — cablear `PiperSidecarService` en lugar de los servicios retirados.
- `src/3-operations/persist-billable-step-metrics.util.ts` — si la métrica `billable` se asignaba por inferencia Gemini TTS, retirar esa asignación. TTS local no genera step billable.
- `tests/2-services/tts/` — eliminar tests de servicios retirados.
- `tests/3-operations/audit-hook-event.handler.test.ts` — actualizar mocks para usar `PiperSidecarService`.

**Por qué eliminar en lugar de deprecar:** el usuario lo pidió explícitamente. Mantener SAPI/OpenRouter como "fallback secundario" reintroduce exactamente la deuda que este delta retira (complejidad de mantenimiento per-OS, dos rutas de error, intermitencia). Si algún día se necesita un motor alternativo, será un delta nuevo que lo introduzca canónicamente.

### D8 — Comportamiento observable preservado, log diferenciado

**Elección:** el handler sigue retornando HTTP 2xx aunque el sidecar falle. El texto del evento sigue apareciendo en stdout del gateway. La diferencia visible al usuario es:

- **Voz:** Piper `es_MX` en lugar de Gemini. Acento mexicano, sin intermitencia por cuota.
- **Log:** `[TTS-SIDE]` con `reason` del nuevo dominio (sidecar ausente, timeout, etc.) en lugar de `[TTS-FALLBACK]` con `reason` de Gemini (`http-429`, `no-gemini-key`).
- **Texto en stdout:** idéntico al actual.

## Risks / Trade-offs

**[R1] Plataforma no soportada deja al usuario sin voz** → el binario no existe para `linux-musl` (Alpine), FreeBSD, etc. Mitigación: el script de postinstall falla con mensaje accionable ("ejecuta `npm run tts:setup` con conexión") y el handler degrada a `[TTS-SIDE] reason: sidecar-missing`. **Riesgo aceptable** porque el set de targets cubre el 99% de workstations de desarrolladores.

**[R2] Latencia del hook aumenta si el sidecar es lento** → Piper carga el modelo ONNX en memoria al primer uso (~200-500ms); síntesis pura ~5s para textos largos. El handler espera bloqueante, así que la respuesta del hook se retrasa. Mitigación: el usuario es consciente de la espera por voz (es lo que pidió). Si la latencia resulta inaceptable en producción, V2 puede pasar a spawn no-bloqueante + cola, pero V1 acepta la espera.

**[R3] El binario Rust requiere toolchain para compilar** → quien compile nuevos releases del sidecar necesita `cargo` + cross-compile setup. Mitigación: el toolchain NO es requisito para el usuario final (solo descarga el binario pre-compilado). El pipeline de release produce los 5 targets. Documentado en `docs/installation.md`.

**[R4] Piper embebido ocupa ~50 MB en disco** → el binario pesa más que un script TS. Mitigación: se instala una vez, queda cacheado. `vendor/tts-sidecar/` es gitignored, no se transfiere en clones. Si el espacio es problema, un delta futuro puede introducir descarga lazy (binario bajo demanda).

**[R5] Cambio de comportamiento observable en los logs** → scripts o dashboards que parseen `[TTS-FALLBACK]` quedan rotos. Mitigación: el cambio es breaking y se anuncia en el commit del freeze; los logs viejos son legibles pero el tag activo es ahora `[TTS-SIDE]`. Documentado en el changelog.

**[R6] Si la URL del sidecar versionado deja de existir** → futuras instalaciones no pueden descargar. Mitigación: la URL base es fija y versionada (`/v1/`); si se deprecia, se publica `/v2/` y se actualiza la constante en `scripts/postinstall-tts.ts`. No es un riesgo de runtime.

**[R7] Regresión del bug "texto no cacheable"** → durante la implementación podría tentarse cachear mensajes de fallback. Mitigación: `fallback-speech.constants.ts` se elimina entero; cuando el sidecar falla, no hay texto a sintetizar y se omite audio. El texto del evento en stdout sigue siendo dinámico por turno.

## Migration Plan

1. **Code cut:** eliminar `gemini-tts.service.ts`, `sapi-tts.service.ts`, `openrouter-tts.service.ts`, `fallback-speech.constants.ts`. Modificar `audit-hook-event.handler.ts` para delegar en `PiperSidecarService`. Modificar `composition-root.ts` para cablear el nuevo servicio. Eliminar tests de los servicios retirados; actualizar mocks del handler.
2. **Wire `PiperSidecarService`:** implementar `resolveSidecarAssets()` + `speak()` con errores tipificados y timeout. Mockeado en tests con un script Node que lee stdin y escribe JSON a stdout (no se requiere binario real en CI).
3. **Add installer:** crear `scripts/postinstall-tts.ts` (descarga + SHA256), añadir script `tts:setup` y hook `postinstall` en `package.json`, añadir `vendor/tts-sidecar/` a `.gitignore`. `npm run tts:setup` se prueba manualmente con un binario dummy para validar el flujo end-to-end sin necesitar el binario real.
4. **Docs:** actualizar `README.md` y `docs/installation.md` para reflejar el postinstall como vía de instalación de TTS; eliminar menciones a Gemini como dependencia de audio. Sincronizar spec canónica `openspec/specs/tts-hooks/spec.md` con la delta-spec.
5. **Rollback:** si el delta falla en `verify` (suite en rojo) o el usuario reporta regresión grave, `git revert` del commit del freeze restaura el estado pre-cambio. El commit del freeze contendrá los archivos eliminados como tal, así que el revert los restaura.

## Open Questions

1. **URL base del sidecar versionado:** se usará un placeholder (`https://tts-sidecar.example.com/v1/`) hasta confirmar dónde se publica. Esta decisión se resuelve en `apply` o se registra como follow-up.
2. **Crate exacto para embed Piper:** `piper-rs` es el candidato más probable; se confirma durante implementación.
3. **Nombre del modelo `es_MX` específico:** Piper tiene múltiples voces `es_MX-*`; se elige la de mejor calidad durante implementación (default: medium).
