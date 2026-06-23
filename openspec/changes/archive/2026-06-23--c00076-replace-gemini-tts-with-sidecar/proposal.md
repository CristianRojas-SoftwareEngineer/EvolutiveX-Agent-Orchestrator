## Why

El TTS del gateway está acoplado a la API Gemini (modelos `gemini-2.5-flash-preview-tts` y `gemini-3.1-flash-tts-preview`), cuyo free tier se agota en pocos turnos (10 RPD ≈ 5 turnos útiles). Tras el agotamiento, el gateway deja de reproducir audio en los hooks `UserPromptSubmit` y `Stop`, dejando al usuario sin voz y sin un canal audible de continuidad. El reemplazo completo por un sidecar local multiplataforma (binario Rust que embebe Piper + CPAL) elimina la dependencia de la cuota de Gemini, mantiene la latencia del hook predecible y reduce la superficie de fallo a un único binario vendorizado por SO.

## What Changes

- **BREAKING**: Se elimina toda dependencia de Gemini y OpenRouter para TTS. Los servicios `gemini-tts.service.ts`, `sapi-tts.service.ts`, `openrouter-tts.service.ts` y `fallback-speech.constants.ts` se retiran del código fuente. El composition root deja de inyectar `GEMINI_API_KEY` ni de resolver la ruta `routing/providers/gemini/secrets.json` para fines de TTS.
- **BREAKING**: El handler `AuditHookEventHandler` sustituye sus llamadas a Gemini/SAPI/OpenRouter por una única llamada al nuevo `PiperSidecarService`, que invoca el binario `tts-sidecar` por STDIN/STDOUT con un contrato JSON mínimo.
- Se introduce un nuevo servicio de aplicación `PiperSidecarService` en `src/2-services/tts/piper-sidecar.service.ts` que spawn-ea el binario `tts-sidecar` por plataforma, le envía `{"cmd":"speak","text":...,"voice":"es_MX-<voice>"}` por stdin y espera `{"status":"ok"}` o `{"status":"error",...}` por stdout.
- Se introduce un script `scripts/postinstall-tts.ts` (invocado en `npm install` y de forma manual vía `npm run tts:setup`) que descarga el binario `tts-sidecar` correspondiente a la plataforma actual desde una URL versionada, valida su `SHA256` contra un manifiesto versionado en el repo, y descarga el modelo de voz `es_MX` (ONNX + JSON) hacia `vendor/tts-sidecar/voices/es_MX/`.
- Se añade un script npm `tts:setup` y un `postinstall` hook al `package.json`. El path al binario y al modelo se resuelve con un helper `resolveSidecarAssets()` que no requiere red y solo lee del filesystem local.
- Voz inicial: `es_MX` (México, español latino neutro). El campo `voice` se deja como parámetro del contrato, lo que permite añadir más voces (es_AR, es_CO) en deltas futuros sin cambios estructurales.
- **Sin fallbacks por retrocompatibilidad**: si el sidecar no está disponible, falla o se interrumpe, el handler emite `[TTS-SIDE]` con `reason` identificando la causa y omite el audio. **El texto del evento sigue apareciendo en stdout** (comportamiento previo independiente de la síntesis). No se reintroducen SAPI, OpenRouter, ni llamadas Gemini como "fallback secundario" — eso es exactamente la deuda que este delta retira.
- Se actualizan los specs canónicos en `openspec/specs/tts-hooks/spec.md` para reflejar el nuevo contrato. Se actualizan los docs de instalación y arquitectura en `docs/`.

## Capabilities

### New Capabilities

- `tts-sidecar-installer`: ciclo de vida del binario `tts-sidecar` y su modelo de voz en el sistema de archivos (descarga, verificación SHA256, resolución de path, fallo limpio). Cubre el contrato entre el postinstall y el `PiperSidecarService` respecto a dónde vive el artefacto.

### Modified Capabilities

- `tts-hooks`: el requirement "Provider dedicado de inferencia TTS (OpenRouter → Gemini)" se reformula para describir el sidecar local como única vía de síntesis. El requirement "Robustez en la Inferencia y Reproducción de Audio" se ajusta para que los motivos de fallback (`reason`) reflejen el nuevo dominio (sidecar no instalado, timeout, error de proceso) y para que la ausencia de `[TTS-SPEECH]` posterior a un fallo de sidecar sea detectable sin afectar el flujo principal. El requirement "Logging estructurado de fallback y mensaje dinámico" introduce el tag `[TTS-SIDE]` para los casos de sidecar no disponible y conserva `[TTS-SPEECH]` para las síntesis exitosas. Los requirements de "Extracción de Memoria Contextual", "Respuesta de Asistente de Voz", "Resumen conversacional", "Selección de mensajes curada", "System prompt", "Puerto de dominio" y "Solo bloques text son válidos" se conservan textualmente porque son agnósticos al motor TTS. La referencia a `routing/providers/gemini/secrets.json` y al campo `GEMINI_API_KEY` se retira del spec (la spec deja de mencionar el provider Gemini como dependencia del TTS).

> Los artefactos puramente operativos del installer (script `scripts/postinstall-tts.ts`, vendorización de binarios/modelos en `vendor/tts-sidecar/`, scripts npm `tts:setup` y hook `postinstall`) son tooling de soporte del capability `tts-sidecar-installer`. No se declaran como Non-canonical change para no violar la regla "EITHER behavioral OR non-canonical, never both"; su comportamiento canónico ya está capturado en `tts-sidecar-installer/spec.md` y su materialización concreta va listada en `## Impact`.

## Impact

- `src/2-services/tts/`: eliminar `gemini-tts.service.ts`, `sapi-tts.service.ts`, `openrouter-tts.service.ts`, `fallback-speech.constants.ts`. Crear `piper-sidecar.service.ts` y `piper-sidecar.types.ts`.
- `src/3-operations/audit-hook-event.handler.ts`: cambiar `speakAsync` y `announceStop` para delegar al `PiperSidecarService`; el resto del flujo se mantiene.
- `src/3-operations/persist-billable-step-metrics.util.ts`: si la métrica de TTS se persiste como `billable`, se retira (la inferencia Gemini ya no se factura como paso del flujo TTS).
- `src/4-api/composition-root.ts`: cablear el nuevo `PiperSidecarService`; retirar la resolución de `GEMINI_API_KEY` y de los clientes Gemini TTS.
- `routing/providers/gemini/secrets.json`: ya no se lee para TTS (puede seguir usándose para otros fines, pero el gateway no falla si se elimina la clave Gemini).
- `tests/2-services/tts/`: actualizar mocks. Eliminar tests de los servicios retirados. Añadir tests de `PiperSidecarService` con un binario mock que responda JSON por stdout.
- `tests/3-operations/audit-hook-event.handler.test.ts`: actualizar para que el handler invoque el sidecar mock y verificar los tags `[TTS-SIDE]` / `[TTS-SPEECH]`.
- `openspec/specs/tts-hooks/spec.md`: MODIFIED según Capabilities.
- `openspec/specs/tts-sidecar-installer/spec.md`: NEW.
- `docs/`: actualizar la sección de instalación para documentar el postinstall y el script `tts:setup`, y la sección de arquitectura para reflejar el sidecar como única vía de TTS. Eliminar menciones a Gemini como dependencia de audio.
- `package.json`: añadir `scripts.tts:setup` y `scripts.postinstall`.
- `.gitignore`: añadir `vendor/tts-sidecar/` (binarios y modelos descargados).
