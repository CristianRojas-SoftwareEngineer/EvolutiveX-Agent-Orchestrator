## Why

El handler de TTS (`AuditHookEventHandler`) asumía implícitamente que el provider activo era siempre Anthropic: enviaba el header `anthropic-version: 2023-06-01` y usaba el token OAuth capturado en todas las llamadas de inferencia TTS, sin importar el provider configurado. En entornos multi-provider (OpenRouter, Ollama, MiniMax, Xiaomi), esto producía errores `402 Payment Required` silenciosos que degradaban la voz al mensaje genérico de fallback sin ninguna señal diagnóstica en logs. Adicionalmente, `SapiTTSService.speak()` era fire-and-forget: el proceso de audio se cortaba si el gateway se cerraba antes de que terminara la síntesis.

## What Changes

- **Detección dinámica de provider**: el handler recibe `upstreamOrigin` desde el composition root y lo usa para bifurcar token y headers en la llamada de inferencia TTS.
- **Selección de token por tipo de auth**:
  - Provider Anthropic (OAuth / API key): `capturedToken ?? ANTHROPIC_API_KEY`
  - Otros providers (bearer): `ANTHROPIC_AUTH_TOKEN ?? capturedToken`
- **Selección de headers por provider**:
  - Anthropic: `anthropic-version: 2023-06-01`
  - Otros: `HTTP-Referer` + `X-Title` (recomendado por OpenRouter, neutro para el resto)
- **`SapiTTSService.speak()` awaitable**: convierte el fire-and-forget en `await synthesize()`, esperando el evento `close` del proceso PowerShell antes de retornar.
- **Logging estructurado TTS**: cada fallback emite `[TTS-FALLBACK]` con `reason` (`no-token`, `no-messages`, `http-NNN`, `empty-response`, `exception`); cada mensaje dinámico emite `[TTS-SPEECH]`.
- **Extracción de constantes de fallback**: `FALLBACK_SPEECH` se mueve a `src/2-services/tts/fallback-speech.constants.ts` para ser reutilizable desde el harness de pruebas.
- **Eliminación del fallback a bloques `thinking`**: la función de extracción de texto retorna solo bloques `type === "text"`; si no hay texto, activa `[TTS-FALLBACK]` con `reason: empty-response` en lugar de leer razonamiento interno en inglés.
- **Presupuesto de tokens TTS por provider**: providers no-Anthropic usan `max_tokens: 512` para absorber el thinking de modelos razonadores (MiniMax-M2.5, laguna-xs.2), excepto Ollama local (`localhost:11434`) que mantiene 150 porque su backend cloud rechaza valores mayores. Se añade `reasoning: { effort: 'none' }` en la rama no-Anthropic (lo respeta OpenRouter parcialmente; los demás lo ignoran sin error). El modelo por defecto usa `||` en lugar de `??` para que una env var vacía caiga al default.
- **Actualización de modelo haiku en OpenRouter**: `models/gemma-4-31b-it` → `models/laguna-xs.2`. Gemma fue descartado porque falla en sesiones reales vía gateway; laguna-xs.2 es thinking pero produce bloques `text` de forma fiable con presupuesto 512.
- **Harness de pruebas headless aislado**: script `npm run test:headless-tts` que gestiona el ciclo de vida de un proxy de test (puerto 8788) y ejecuta `claude -p` por cada provider, verificando TTS dinámico en logs de forma determinista. El aislamiento no toca el proxy principal (8787), `~/.claude/settings.json` ni `configs/.env`: la configuración de provider se resuelve en memoria (`provider-env.ts` + `scripting/shared/provider-config.ts`, extraído de `configure-provider.ts`) y se inyecta vía `--settings` a `claude -p` y vía env al proxy de test (`LOG_FILE=server/logs-headless-tts.jsonl`, `AUDIT_BASE_DIR=server/headless-tts/sessions`, soportados por `src/index.ts`).

## Capabilities

### New Capabilities

_(ninguna — el change no introduce nuevas capacidades, solo corrige el comportamiento de una existente)_

### Modified Capabilities

- `tts-hooks`: los requisitos de autenticación y cabeceras de la llamada de inferencia TTS cambian para soportar todos los providers del catálogo; se añade requisito de observabilidad (logging estructurado de fallback vs. dinámico) y se precisa que solo bloques `type === "text"` son válidos como salida hablable.

## Impact

**Capas PKA afectadas:**
- `3-operations`: `AuditHookEventHandler` — lógica de token, headers, presupuesto de tokens y extracción de texto
- `2-services/tts`: `SapiTTSService` (fix awaitable), `fallback-speech.constants.ts` (nuevo)
- `4-api`: `composition-root.ts` — pasa `UPSTREAM_ORIGIN` al handler
- entrypoint: `src/index.ts` — `LOG_FILE` y `AUDIT_BASE_DIR` sobreescribibles por entorno (aislamiento del harness)

**Archivos clave:**
- `src/3-operations/audit-hook-event.handler.ts`
- `src/2-services/tts/sapi-tts.service.ts`
- `src/2-services/tts/fallback-speech.constants.ts` _(nuevo)_
- `src/4-api/composition-root.ts`
- `routing/providers/openrouter/config.json`
- `src/index.ts`
- `scripting/headless-tts-gateway-test.ts` + `scripting/headless-tts-gateway-test/` _(nuevo)_
- `scripting/shared/provider-config.ts` _(nuevo, extraído de `configure-provider.ts`)_
- `scripting/configure-provider.ts` _(refactor: consume el módulo compartido)_
- `tests/scripting/headless-tts-*.test.ts` _(nuevos, ×5)_
- `package.json`, `scripting/help.ts`
- `.claude/skills/headless-cli-testing/SKILL.md` _(sección de modo aislado)_

**Sin cambios en:** protocolo de proxy, formato de sesiones, API pública del gateway, comportamiento observable desde Claude Code.
