# Plan de refactorización para separar la narración de la experiencia de usuario del orchestrator

## Objetivo

Este repositorio ya no debe implementar ni ejecutar el motor de voz local. La síntesis de audio y la narración de los eventos del workflow se externalizaron al proyecto TTS-sidecar, en el directorio Voices, donde ahora vive el motor local y el plugin de integración para Claude Code.

La separación arquitectónica requerida es la siguiente:
- este repositorio conserva la experiencia de usuario y la gestión de eventos del flujo de trabajo;
- la narración de los eventos, así como cualquier ejecución técnica relacionada con el motor de síntesis de voz, debe quedar fuera de este repositorio y ser responsabilidad del proyecto externalizado.
- **Nota sobre la entrega de hooks:** este repositorio sigue recibiendo los eventos de Claude Code a través de su propio endpoint HTTP `POST /hooks` (`src/app.ts` → `src/5-user-interfaces/http/hooks.controller.ts` → `AuditHookEventHandler`). Ese endpoint y el `HooksController` **deben conservarse**, porque además de la narración realizan la gestión de workflow, la auditoría y las notificaciones de escritorio (UX). Lo que se elimina es únicamente la responsabilidad de narración **dentro** del handler, no la suscripción a los hooks. El proyecto TTS externo (plugin) se suscribe a los mismos hooks de forma independiente; ambos pueden coexistir.

## Principio de responsabilidad

Lo que sí puede permanecer en este repositorio:

- la experiencia de usuario y las notificaciones de escritorio,
- la gestión de hooks y eventos del flujo de trabajo,
- la integración con Claude Code y la auditoría de eventos,
- la coordinación entre componentes sin implementar narración ni audio.

Lo que ya no debe existir aquí como implementación propia:

- cualquier implementación concreta de narración o reproducción de voz,
- cualquier dependencia del motor de síntesis de voz externalizado,
- la lógica que spawnea un binario local de voz,
- la resolución de rutas de modelo o assets del motor,
- la instalación o descarga del motor,
- la selección de voz o configuración específica del sidecar,
- las pruebas que validen una implementación concreta del motor local.

## Piezas de código fuente que deberían eliminarse o reemplazarse

### 1. Adaptador concreto del motor local

- [src/2-services/tts/piper-sidecar.service.ts](src/2-services/tts/piper-sidecar.service.ts)
  - Es el punto de integración más evidente con el motor local antiguo.
  - Debe eliminarse por completo, porque ya no corresponde a la responsabilidad de este repositorio.

### 2. Resolución de assets del sidecar

- [src/2-services/tts/sidecar-resolver.ts](src/2-services/tts/sidecar-resolver.ts)
  - Resuelve rutas del binario, del modelo y del directorio de datos del motor local.
  - Es un detalle de implementación del motor, no una concern del orchestrator.
  - Debe eliminarse.

### 3. Contratos heredados del sidecar

- [src/1-domain/ports/ITtsSidecarService.ts](src/1-domain/ports/ITtsSidecarService.ts)
  - Define un puerto de dominio orientado a un sidecar local concreto.
  - Si ya no existe una implementación local en este repo, debe eliminarse por completo.

- [src/1-domain/ports/ITtsSidecarAssets.ts](src/1-domain/ports/ITtsSidecarAssets.ts)
  - Modela recursos del sidecar local, como binario, modelo y datos de espeak.
  - Debe eliminarse por completo, porque modela una implementación concreta del motor externo que ya no pertenece a este repositorio.

### 4. Wiring del sistema con una implementación concreta

- [src/4-api/composition-root.ts](src/4-api/composition-root.ts)
  - Actualmente inyecta la implementación concreta del sidecar local.
  - Debe eliminarse por completo, porque este repositorio ya no debe conocer ni instanciar esa implementación.
  - **Verificación previa obligatoria:** antes de borrar su registro, comprobar que ningún otro adapter del container dependa transitivamente de los puertos que se eliminan (`ITtsSidecarService`, `ITtsSidecarAssets`, `ITTSService`, `ITtsTextProvider`). Si algún adapter de UX/eventos aún los importa, debe dejar de hacerlo (sin introducir ningún puerto de narración/audio) o eliminarse, para no dejar imports rotos ni un build roto en pasos intermedios. (Nótese: `IContextExtractor` **no** es un puerto TTS y se conserva para UX no-voz; ver 5c.)
  - **Cableado de claves TTS (no mencionado antes):** `composition-root.ts` también resuelve las claves de narración en `resolveTtsApiKey()` (lee `GEMINI_API_KEY` de `routing/providers/gemini/secrets.json`) y `resolveOpenRouterApiKey()` (lee `ANTHROPIC_AUTH_TOKEN` de `routing/providers/openrouter/secrets.json`), y las inyecta en el handler junto con `ttsService`, `contextExtractor` y `ttsTextProvider`. Al quitar la narración del handler, **deben eliminarse** `resolveTtsApiKey`/`resolveOpenRouterApiKey` y los parámetros `ttsService`/`ttsTextProvider` (líns. ~129-141). `contextExtractor` **se conserva** (ahora para UX no-voz, ver §5c) pero se desacopla de `ttsEnabled` (instanciarlo siempre). **No** se deben borrar los archivos `routing/providers/{gemini,openrouter}/secrets.json`: esos secrets los comparte el módulo de routing (AgentRouter, catálogo OpenRouter/Hy3/Laguna) y no son exclusivos de TTS.

### 5. Lógica de eventos que aún mezcla experiencia y narración

- [src/3-operations/audit-hook-event.handler.ts](src/3-operations/audit-hook-event.handler.ts)
  - Contiene lógica que hoy mezcla la gestión de eventos con la preparación de narración.
  - No debe eliminarse por completo si sigue siendo útil para orquestar eventos, pero sí debe dejar de depender de la generación de audio o de la vieja integración de TTS.
  - La parte que corresponde a la experiencia de usuario y a la gestión de eventos de workflow debe mantenerse aquí; la parte de narración debe eliminarse de este repositorio y delegarse al proyecto de TTS externo.
  - **Sin puente de narración (resuelve la sección 5b):** al eliminar `ITTSService` e `ITtsTextProvider` (ver 5b), el handler **no necesita ninguna abstracción nueva** que reemplace la narración, porque el orchestrator no debe emitir ni referenciar señal de audio alguna. La narración la ejecuta el proyecto TTS externo consumiendo directamente los mismos hooks / workflow events de Claude Code (es un plugin de integración, ver Objetivo), de forma independiente a este repositorio. Por tanto, si el handler se conserva, lo hace únicamente para la gestión de eventos y la auditoría del workflow, sin voz, runtime ni binario de síntesis. Si tras quitar la narración no aporta gestión de eventos/auditoría propia, debe eliminarse también. Cualquier notificación de escritorio que pudiera quedar es una preocupación pura de UX, separada de la narración y sin filtrar detalle de motor.

  - **Acoplamiento del toast de `Stop` (trampa, resuelta en §5c):** el método `announceStop` (evento `Stop`) genera `text` vía `generateSpeechText` (texto de narración/fallback) y lo reutiliza como contenido del toast: `Promise.allSettled([this.tts?.speak(text), this.emitToast('Stop', text)])`. A diferencia de los demás toasts (`UserPromptSubmit`, `SubagentStop`, `StopFailure`, etc., que usan `format*Message` y son UX pura), **este toast depende del texto de narración**. La solución (§5c) es que `announceStop` lea el último mensaje del asistente desde el transcript con `contextExtractor.extractLastNMessages(...)` y lo use como toast contextual **sin voz**, conservando la capacidad de lectura de transcript (`IContextExtractor`) que antes solo alimentaba la narración. Los toasts de los otros eventos no requieren cambios.

### 5b. Piezas adicionales de la cadena de narración detectadas en el código fuente

- [src/1-domain/ports/ITTSService.ts](src/1-domain/ports/ITTSService.ts)
  - Define el contrato genérico de salida de voz usado por el handler.
  - Si la narración ya no se ejecuta aquí, este contrato debe eliminarse por completo o reemplazarse por una abstracción puramente de notificaciones o eventos.

- [src/1-domain/ports/ITtsTextProvider.ts](src/1-domain/ports/ITtsTextProvider.ts)
  - Define el puerto para generar texto destinado a la narración.
  - Es parte de la vieja pipeline de TTS y debe retirarse por completo si el proyecto externo asume esa responsabilidad.

- [src/2-services/tts/gemini-tts-text-provider.ts](src/2-services/tts/gemini-tts-text-provider.ts)
- [src/2-services/tts/openrouter-tts-text-provider.ts](src/2-services/tts/openrouter-tts-text-provider.ts)
- [src/2-services/tts/tts-text-provider-chain.ts](src/2-services/tts/tts-text-provider-chain.ts)
  - Implementan la generación de texto para la voz a partir del contexto del evento.
  - Son parte de la pipeline de narración y deben quedar fuera de este repositorio si la narración se delega por completo.

- [src/1-domain/services/tts/normalize-speech-text.ts](src/1-domain/services/tts/normalize-speech-text.ts)
  - Aplica sanitización y limpieza de texto para que suene bien al ser leído en voz.
  - Es lógica de síntesis de voz y no debería permanecer aquí una vez externalizada la narración.
  - **Código ya muerto:** actualmente no es importado por ningún módulo (solo se auto-referencia), por lo que puede eliminarse en cualquier orden sin necesidad de desenganche previo.

- [src/2-services/tts/transcript-extractor.service.ts](src/2-services/tts/transcript-extractor.service.ts)
  - Extrae contexto del transcript para alimentar la narración.
  - **`IContextExtractor` NO es un puerto TTS (decisión del equipo: CONSERVAR):** `transcript-extractor.service.ts` implementa `IContextExtractor` (`src/1-domain/ports/IContextExtractor.ts`), un **puerto de dominio genérico** que lee el transcript JSONL de la sesión (`extractLastNMessages`, `extractUserPromptSubmitContext`) sin acoplarse al formato. Por diseño es agnóstico a la voz; el handler lo usa **solo en la ruta de narración** (`speakAsync`/`announceStop`), y hoy está instanciado únicamente cuando `ttsEnabled` (`composition-root.ts:109`). Ningún otro servicio de workflow/auditoría/kanban lo consume.
  - **Decisión:** el equipo **conserva** esta capacidad para features no-voz (toasts contextuales, auditoría, resúmenes). Por tanto **no se elimina** ni el puerto ni la implementación; se **desacoplan de TTS** y se reusan para UX. La propuesta detallada de desacople y refactor está en **§5c**. En resumen: se instancia siempre (sin gate `ttsEnabled`), el handler conserva el parámetro `contextExtractor` y lo usa en toasts/auditoría no-voz, y se borra toda la lógica de narración (`speakAsync`, `generateSpeechText`, `tts`, `ttsTextProvider`, y `extractUserPromptSubmitContext` si ninguna feature no-voz lo requiere).

- [src/1-domain/types/config.types.ts](src/1-domain/types/config.types.ts)
- [src/4-api/config/env.config.ts](src/4-api/config/env.config.ts)
  - Exponen configuración del proxy/servidor y, en concreto, **dos** variables con nombre TTS hoy: `TTS_ENABLED` (`env.config.ts:48`) y `TTS_CONTEXT_N` (`env.config.ts:49`). Ninguna de las dos contiene API keys.
  - **Renombrado/eliminación (decisión: conservar la lectura de transcript):**
    - `TTS_ENABLED` → **eliminada**: era el flag de voz y gateaba la instanciación de `contextExtractor` (composition-root:109). Sin voz, el extractor se instancia siempre; el flag desaparece.
    - `TTS_CONTEXT_N` → **renombrada a `TRANSCRIPT_CONTEXT_N`** (conservada, ya no es de voz): es el `n` de `extractLastNMessages` para toasts contextuales/auditoría. Mantener valor por defecto (3).
  - **Corrección sobre las API keys (imprecisión común):** las API keys de LLM **NO** viven en `config.types.ts` ni en `env.config.ts`. Se resuelven en `composition-root.ts` (`resolveTtsApiKey`/`resolveOpenRouterApiKey`) leyendo `GEMINI_API_KEY` de `routing/providers/gemini/secrets.json` y `ANTHROPIC_AUTH_TOKEN` de `routing/providers/openrouter/secrets.json`. Esos archivos de secrets los **comparte el módulo de routing** (AgentRouter, catálogo OpenRouter/Hy3/Laguna) y **no son exclusivos de TTS**, por lo que **no deben eliminarse** al quitar la narración. La narración solo "parasitaba" esas claves.
  - **Qué se elimina vs. qué se conserva:** se elimina `TTS_ENABLED` y el cableado de claves TTS en `composition-root.ts`; se renombra `TTS_CONTEXT_N`→`TRANSCRIPT_CONTEXT_N`. Deben **conservarse** las variables de experiencia de usuario/proxy que no dependen de voz: `PORT`, `UPSTREAM_ORIGIN`, `MAX_REQUEST_BODY`, `FILTERED_TOOLS`, nivel de log, notificaciones de escritorio, `TRANSCRIPT_CONTEXT_N`, y los `secrets.json` de routing. El resultado es un `config.types.ts` reducido a la configuración de UX/eventos, con la capacidad de lectura de transcript como variable propia no-voz.

### 5c. Propuesta de desacople y refactor de `IContextExtractor` (lectura de transcript no-voz)

El objetivo es convertir la lectura de los últimos N mensajes del transcript (user/assistant/system) en una **capacidad de dominio reutilizable y agnóstica a la voz**, eliminando todo lo que la ata a TTS. El modelo ya existe: el puerto `IContextExtractor` expone `extractLastNMessages(transcriptPath, n)` que devuelve `SessionMessage[]` (rol + texto); eso es exactamente lo que necesitan los toasts contextuales, sin generar audio. La narración delegada al plugin externo consumía este mismo puerto; tras quitar la voz, el puerto se queda y se reorienta a UX.

**Requisito del equipo que justifica conservarlo:** los cuerpos de los toasts son hoy **mayoritariamente estáticos** (`Tarea creada`, `Sesión iniciada`, `Subagente terminado`, etc.) y se quiere que **varien en función del evento** enriqueciéndose con contexto real. Esa capacidad de enriquecimiento es el consumidor no-voz concreto de `contextExtractor`: combina los `format*Message` del payload con contenido del transcript (p. ej. el último mensaje del asistente) cuando el payload no basta. Por tanto `IContextExtractor` se mantiene y se desacopla de `ttsEnabled` (ver punto 1).

**1. Desacoplar la instanciación de `ttsEnabled` (`composition-root.ts:109`)**
- Hoy: `const contextExtractor = ttsEnabled ? new TranscriptContextExtractor() : undefined;`
- Quedar: `const contextExtractor = new TranscriptContextExtractor();` (siempre instanciado; la lectura de transcript ya no depende de si hay voz).
- Eliminar `TTS_ENABLED` como gate de este puerto. El flag de voz desaparece del repo (ver §5b config).

**2. Refactor del handler (`audit-hook-event.handler.ts`) — quitar TTS, conservar `contextExtractor` para enriquecer toasts**
- Eliminar del constructor los parámetros `tts?: ITTSService` y `ttsTextProvider?: ITtsTextProvider`, y todo método de narración: `speakAsync`, `generateSpeechText`, `composeFallbackText`, `logTtsFallback`, `logTtsDynamic`, y la versión de `extractContext`/`extractUserPromptSubmitContext` usada solo para voz.
- **Conservar** el parámetro `contextExtractor?: IContextExtractor`. Se usa para enriquecer los cuerpos de los toasts combinando el `format*Message` del payload con contexto del transcript cuando el payload no basta.
- **`announceStop` (evento `Stop`) — caso ejemplo de enriquecimiento con transcript:** en lugar de `generateSpeechText`, leer el último mensaje del asistente con `contextExtractor.extractLastNMessages(event.transcriptPath, this.contextN)` y usarlo como contenido del toast. Corrige el bug de reusar el texto TTS y produce un toast contextual sin voz:
    ```typescript
    private async announceStop(event: ClaudeHookEvent): Promise<void> {
      try {
        const messages = this.contextExtractor
          ? await this.contextExtractor.extractLastNMessages(event.transcriptPath, this.contextN)
          : [];
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        const text = lastAssistant?.text ?? 'El asistente terminó su turno.';
        await this.emitToast('Stop', text);
      } catch (err) {
        this.logger?.error({ err }, '[Toast] fallo en announceStop');
      }
    }
    ```
- **Tabla de enriquecimiento de toasts (requisito: variar según el evento; hoy mayoritariamente estáticos):**

  | Evento | Cuerpo hoy | Cuerpo enriquecido (post-TTS) | Fuente del contexto |
  |---|---|---|---|
  | `TaskCreated` | `Tarea creada` | `Tarea creada: <subject>` | payload `tool_input.subject` |
  | `TaskCompleted` | `Tarea completada` | `Tarea completada: <subject>` | payload `tool_input.subject` |
  | `SubagentStart` | `Subagente iniciado` | `Subagente iniciado (<agentId>)` | payload `agentId` |
  | `SubagentStop` | `Subagente terminado` | `Subagente terminado: <último assistant del transcript>` | `contextExtractor.extractLastNMessages` |
  | `Stop` | (TTS) → `formatStopMessage` | `último assistant` del transcript (fallback payload/estático) | `contextExtractor` / payload `last_assistant_message` |
  | `SessionStart` | `Sesión iniciada` | `Sesión iniciada (<sessionId>)` | payload `sessionId` |
  | `SessionEnd` | `Sesión finalizada` | `Sesión finalizada: <recap último assistant>` | `contextExtractor` |
  | `UserPromptSubmit` | prompt (payload) | igual (ya dinámico) | payload |
  | `StopFailure` | error + `last_assistant` (payload) | igual (ya dinámico); + transcript si el payload viene vacío | payload / `contextExtractor` |
  | `PermissionRequest` | tool + preview | igual (ya dinámico) | payload |
  | `PreToolUse` | N preguntas | igual (ya dinámico) | payload |

  - Los toasts ya dinámicos (`UserPromptSubmit`, `StopFailure`, `PermissionRequest`, `PreToolUse`) se conservan vía sus `format*Message`; el enriquecimiento vía transcript se suma donde aporte.
  - `TTS_CONTEXT_N` (renombrado a `TRANSCRIPT_CONTEXT_N`, ver punto 4) es el `n` que controla cuántos mensajes lee `contextExtractor` para estos enriquecimientos.

**3. Métodos del puerto a conservar**
- `extractLastNMessages` — **se conserva** (núcleo de la capacidad no-voz).
- `extractUserPromptSubmitContext` (tríada) — era solo para voz; **eliminarlo del puerto** si ninguna feature no-voz lo requiere (simplifica la interfaz a un único método genérico). Si se conserva, documentar que es genérico, no de TTS.

**4. Renombrado de configuración (§5b config / §7 `.env.example`)**
- `TTS_CONTEXT_N` → **`TRANSCRIPT_CONTEXT_N`** (el `n` de `extractLastNMessages`; ya no es de voz). Conservar el valor por defecto (3).
- `TTS_ENABLED` → **eliminado** (no hay flag de voz; el extractor siempre instanciado).
- Reflejar `TRANSCRIPT_CONTEXT_N` en el bloque de config del proxy de `.env.example` (no en el bloque `TTS_SIDECAR_*` que se borra).

**5. Criterios de verificación**
- Tras el refactor, el handler compila sin `ITTSService`/`ITtsTextProvider`/`tts`, conservando `IContextExtractor` y su uso en toasts/auditoría.
- `grep` de `ttsEnabled` debe dar 0 coincidencias en `src/`.
- Los tests del handler (si los hay) deben validar el toast de `Stop` con el texto del último `assistant` del transcript, no con texto de narración.

## Piezas de soporte y configuración que también deben retirarse

### 6. Instalación y distribución del motor

- [scripts/postinstall-tts.ts](scripts/postinstall-tts.ts)
  - Descarga y prepara el binario local del sidecar.
  - Es un mecanismo de instalación del motor, y por tanto no corresponde a este repositorio tras la externalización.
  - Debe eliminarse.

### 7. Configuración de entorno ligada al motor

- [configs/.env.example](configs/.env.example)
  - Documenta mayoritariamente configuración del **proxy** (`PORT`, `UPSTREAM_ORIGIN`, `MAX_REQUEST_BODY`, `FILTERED_TOOLS`, `LOG_LEVEL`, etc.) que **no es TTS y debe conservarse**.
  - Solo el bloque `TTS Sidecar (distribución binaria)` (líns. ~41-51: `TTS_SIDECAR_BASE_URL`, `TTS_SIDECAR_VOICE`) corresponde al motor local y debe eliminarse. **No borrar el archivo completo**, sino únicamente ese bloque, para no perder la documentación de variables del proxy.
  - Al recortar, **añadir** al bloque de proxy la variable `TRANSCRIPT_CONTEXT_N` (renombrada desde `TTS_CONTEXT_N`; número de últimos mensajes del transcript que leen los toasts contextuales/auditoría). Ver §5c y §5b config.

### 8. Artefactos de empaquetado del motor

- [package.json](package.json)
  - Incluye referencias a artefactos relacionados con el sidecar local.
  - Debe quitarse cualquier entrada de instalación, descarga o manifest asociado al motor ya externalizado.
  - **Advertencia de dependencias colgantes:** al eliminar el `postinstall` (ver 6) y los scripts/manifiestos del motor, verificar que no quede ningún `script` (p. ej. `prepare`, `build`, `test`) ni `devDependency`/`dependency` que invoque o espere el binario del sidecar. Eliminar también cualquier referencia en `files`, `bin` o `optionalDependencies` al artefacto externalizado, para no dejar un `package.json` que falle al instalar en una máquina limpia.

- [tts-sidecar.sha256](tts-sidecar.sha256)
  - Es un manifiesto de integridad para el binario del motor local.
  - Ya no pertenece a este repositorio como responsabilidad propia.

### 9. Pipeline de CI dedicado al sidecar (RAMIFICACIÓN `circleci-project-setup`)

- [.circleci/config.yml](.circleci/config.yml)
  - Implementa un pipeline específico (`build-all`) para descargar el modelo de voz, compilar el binario del sidecar y empaquetar artefactos para Linux/Windows/macOS.
  - **A qué fase del motor corresponde (análisis de origen):** el config compila `sidecar/Cargo.toml` (Rust → binario `tts-sidecar`), descarga el modelo **sherpa-onnx** (`vits-piper-es_MX-claude-high`) y empaqueta `espeak-ng`. Es decir, corresponde a la fase **ONNX + Rust** del motor. No contiene ninguna traza de la primera implementación (Nuikta/empacado multiplataforma) ni de la implementación final (**Chatterbox V3 / Python / PyInstaller**): no invoca PyInstaller ni construye un wheel, sino `cargo build` de un crate Rust.
  - **Es basura muerta (prueba):** el commit `216c347 "Limpieza de configuración legacy de sidecar tts escrito en Rust."` **ya eliminó `sidecar/`** de este repo (verificado: `sidecar/` no existe). El config hoy referencia `sidecar/Cargo.toml` y `sidecar/target/...` — rutas inexistentes —, así que el pipeline no construiría nada. `vendor/tts-sidecar/` solo guarda artefactos binarios legacy ya compilados (`tts-sidecar.exe`, `windows-amd64.zip`, `libespeak-ng.dll`), no fuente.
  - **Conclusión:** el origen de la rama `circleci-project-setup` y su CI se justifica **únicamente** en la implementación legacy del motor TTS (fase ONNX+Rust; la fase Nuikta ni siquiera quedó representada en este config). Las tres fases del motor (Nuikta, ONNX+Rust y la final Chatterbox/Python/PyInstaller) son **externas a este repositorio**; la final vive en su propio proyecto Python/PyInstaller y jamás sería construida por este config Rust. Por tanto el pipeline es **100% eliminable de este repo, sin migración que deba quedarse aquí**.
  - **Acción:** borrar `.circleci/config.yml` y la carpeta `.circleci/`. Limpiar también los artefactos binarios legacy de `vendor/tts-sidecar/` (`tts-sidecar.exe`, `windows-amd64.zip`, `libespeak-ng.dll`) que son sobras de esa fase y no se reconstruyen aquí. Si el proyecto quiere conservar otra validación (build/test del orquestador) que no sea la distribución del sidecar, debe definirse en una CI distinta y ajena a este config; de lo contrario, la eliminación del pipeline es total.

## Pruebas que deben eliminarse o reubicar

- [tests/2-services/tts/piper-sidecar.service.test.ts](tests/2-services/tts/piper-sidecar.service.test.ts)
- [tests/2-services/tts/sidecar-resolver.test.ts](tests/2-services/tts/sidecar-resolver.test.ts)
- [tests/1-domain/services/tts/normalize-speech-text.test.ts](tests/1-domain/services/tts/normalize-speech-text.test.ts)
- [tests/2-services/tts/transcript-extractor.service.test.ts](tests/2-services/tts/transcript-extractor.service.test.ts)
- [scripting/headless/gateway-test.ts](scripting/headless/gateway-test.ts) — contiene el escenario `testFallbackScenario` (líns. ~358-404) que arranca el proxy con `GEMINI_SECRETS_PATH` inexistente para verificar el fallback de TTS; debe eliminarse o recortarse esa parte.
- [.claude/skills/headless-cli-testing/references/tts-testing.md](.claude/skills/headless-cli-testing/references/tts-testing.md) — guía de pruebas de TTS (referencias a `OPENROUTER_SECRETS_PATH`, fallback de voz).
- [openspec/specs/tts-hooks/spec.md](openspec/specs/tts-hooks/spec.md) — spec **activa** de hooks TTS; debe archivarse/eliminarse junto con su referencia en `openspec` (no confundir con los cambios ya archivados en `openspec/changes/archive/`).
- Referencias de documentación en [README.md](README.md), [CHANGELOG.md](CHANGELOG.md) y [AGENTS.md](AGENTS.md) que describen la narración TTS local; deben limpiarse para no dejar referencia legacy (cumple el objetivo "sin dejar ninguna referencia legacy").

Estas pruebas y referencias validan una implementación concreta del motor local o una pipeline de narración que ya no corresponde a este repo. Si la narración se delega por completo al proyecto externo, deben eliminarse o reubicarse al proyecto que mantenga la lógica de voz.

## Resultado esperado

Tras esta limpieza, este repositorio debería:

- mantener la experiencia de usuario y las notificaciones de escritorio,
- seguir gestionando los hooks y eventos de workflow para Claude Code,
- **conservar la capacidad de lectura de transcript (`IContextExtractor`) para toasts contextuales y auditoría no-voz, desacoplada de TTS**,
- no spawnear ni resolver binarios de voz local,
- no instalar ni descargar motores de voz,
- no depender de un sidecar local concreto,
- y delegar la narración de los eventos de workflow al proyecto de TTS externo, sin dejar ninguna referencia legacy a su implementación en este repositorio (salvo la capacidad de lectura de transcript, que se reusa para UX).

## Orden de ejecución recomendado

Para no romper el compilado ni dejar imports colgantes en pasos intermedios, ejecutar en este orden:

1. **Verificar dependientes (4).** Comprobar que ningún adapter registrado en `composition-root.ts` ni otro módulo importa los puertos TTS (`ITtsSidecarService`, `ITtsSidecarAssets`, `ITTSService`, `ITtsTextProvider`) fuera del handler. Resolver esos dependientes antes de seguir. (Nótese: `IContextExtractor` no es un puerto TTS y se conserva para UX no-voz; ver 5c.)
2. **Refactorizar el handler (5, 5c).** Quitar de `audit-hook-event.handler.ts` toda la preparación de narración y sus dependencias de `ITTSService`/`ITtsTextProvider` (`speakAsync`, `generateSpeechText`, `composeFallbackText`, `logTtsFallback`, `logTtsDynamic`, y los parámetros `tts`/`ttsTextProvider`). **Conservar** el parámetro `contextExtractor` y reusarlo para UX no-voz: **refactorizar `announceStop`** para que lea el último mensaje del asistente desde el transcript con `contextExtractor.extractLastNMessages(transcriptPath, n)` y lo emita como toast contextual (sin voz) — corrige el bug de reusar el texto TTS (ver §5c). Los demás toasts (`UserPromptSubmit`, `SubagentStop`, `StopFailure`, etc.) ya usan `format*Message` y son UX pura, así que no requieren cambios. Si se conserva, el handler queda para gestión de eventos, auditoría y toasts contextuales del workflow; no añadir ningún puerto de audio ni de narración. Si tras quitar la narración no aporta gestión de eventos/auditoría/toasts propios, eliminarlo. Verificar que los tests pasan.
3. **Desregistrar en composition-root (4, 5c).** Eliminar la inyección de la implementación concreta del sidecar local **y** los parámetros TTS del handler (`ttsService`, `ttsTextProvider`), más `resolveTtsApiKey()` y `resolveOpenRouterApiKey()`. **Conservar** la instanciación e inyección de `contextExtractor` pero **desacoplada de `ttsEnabled`**: instanciar `new TranscriptContextExtractor()` siempre (no bajo el gate `ttsEnabled`), y renombrar el parámetro de config `TTS_CONTEXT_N`→`TRANSCRIPT_CONTEXT_N`. Dejar de leer `routing/providers/{gemini,openrouter}/secrets.json` para TTS (esos secrets se conservan para routing). El endpoint `POST /hooks`, el `HooksController` y la suscripción a hooks del orquestador **se conservan** para workflow/auditoría/toasts contextuales.
4. **Eliminar adapters/providers TTS (1, 2, 3, 5b).** Borrar `piper-sidecar.service.ts`, `sidecar-resolver.ts`, `ITtsSidecarService`, `ITtsSidecarAssets`, `ITTSService`, `ITtsTextProvider`, los providers de Gemini/OpenRouter, la cadena, `normalize-speech-text.ts`. **No** borrar `transcript-extractor.service.ts` ni `IContextExtractor`: se conservan como capacidad de lectura de transcript no-voz (§5c). El build debe quedar verde.
5. **Limpiar configuración (5b, 5c, 7).** En `config.types.ts`/`env.config.ts`: eliminar `TTS_ENABLED` y renombrar `TTS_CONTEXT_N`→`TRANSCRIPT_CONTEXT_N` (conservada, no-voz). En `.env.example`: borrar solo el bloque `TTS_SIDECAR_*` (líns. ~41-51) y añadir `TRANSCRIPT_CONTEXT_N` al bloque de proxy. **No** tocar `routing/providers/{gemini,openrouter}/secrets.json` (los comparte routing).
6. **Limpiar soporte/instalación (6, 8, 9).** Quitar `postinstall-tts.ts`, las entradas de `package.json`, `tts-sidecar.sha256` y el pipeline de CI del sidecar (borrar `.circleci/`, ver §9). También eliminar los artefactos binarios legacy de `vendor/tts-sidecar/` (`tts-sidecar.exe`, `windows-amd64.zip`, `libespeak-ng.dll`), sobras de la fase ONNX+Rust que ya no se reconstruyen en este repo.
7. **Eliminar pruebas y referencias (sección Pruebas).** Borrar o reubicar los 4 archivos de test de `tests/`, el escenario TTS de `scripting/headless/gateway-test.ts`, la guía `tts-testing.md`, el spec activo `openspec/specs/tts-hooks/`, y limpiar las referencias en `README.md`/`CHANGELOG.md`/`AGENTS.md`.

Cada paso debe dejar el proyecto compilando; si un paso rompe el build, detenerse y resolver el dependiente antes de continuar.

## Criterio de eliminación o reemplazo

Una pieza debe considerarse candidata de eliminación o reemplazo si cumple cualquiera de estos criterios:

1. implementa directamente el motor local de voz,
2. depende del binario local del sidecar,
3. resuelve assets o rutas del motor,
4. descarga o instala el motor,
5. prueba esa implementación concreta,
6. o se usa solo para una integración específica con el motor local y ya no corresponde a este repositorio.

En términos prácticos, cualquier artefacto que todavía describa, instancie, configure o pruebe la narración como parte de este repositorio debe considerarse legacy y debe eliminarse.

## Importante

Lo que debe desaparecer es la implementación concreta del motor local y cualquier dependencia que asuma que este repositorio es quien lo ejecuta. La narración debe quedar fuera de este repositorio; la parte que permanezca debe limitarse a la experiencia de usuario y a la gestión de eventos, sin referirse a un runtime ni a un binario específico de voz.

El objetivo final no es solo quitar código, sino dejar una arquitectura limpia en la que la experiencia de usuario se separe por completo de la síntesis de voz y de la narración.
