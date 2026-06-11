# Proposal: simplify-tts-dedicated-openrouter

## Why

La generación del resumen TTS hereda hoy el provider de la sesión, lo que obliga a mantener una matriz de compatibilidad multi-provider dentro de `generateSpeechText` (detección por `upstreamOrigin`, selección de token capturado vs env, headers condicionales, presupuesto de tokens condicional 150/512). Ese diseño es frágil, costoso de mantener y consume tokens del provider principal en una función cosmética. Se reemplaza por un único camino determinista: un provider dedicado y gratuito (OpenRouter + `poolside/laguna-xs.2:free`) para todos los resúmenes de voz, independiente del provider de sesión.

## What Changes

- **BREAKING (interno)**: `generateSpeechText` deja de usar el provider de la sesión. Llama siempre directo a OpenRouter (`https://openrouter.ai/api/v1/messages`) con el modelo fijo `poolside/laguna-xs.2:free`, autenticado con el `ANTHROPIC_AUTH_TOKEN` de `routing/providers/openrouter/secrets.json`, leído en el arranque.
- Sin clave de OpenRouter disponible → fallback genérico existente (`FALLBACK_SPEECH`, p. ej. "El asistente terminó su turno") con `[TTS-FALLBACK] reason: no-openrouter-key`. No hay validación proactiva de la clave: cualquier fallo de la llamada (401, 429, timeout, respuesta vacía) cae al fallback con su `reason`.
- **Eliminación íntegra** del diseño multi-provider del TTS: detección `isAnthropic`/`isOllama`, token capturado (`capturedToken`/`setAuthToken` en lo que respecta al TTS), headers condicionales, presupuesto condicional, modelo desde `ANTHROPIC_DEFAULT_HAIKU_MODEL`, y la inyección de `upstreamOrigin` en el handler si queda sin uso. Reemplazo total: no se conservan ramas retrocompatibles ni fallbacks al provider de sesión.
- La llamada TTS deja de pasar por el proxy local (`http://127.0.0.1:PORT/v1/messages`) y va directa al upstream de OpenRouter: ya no necesita el pipeline de traducción del proxy ni contamina la auditoría de la sesión.
- El harness `test:headless-tts` se ajusta: la expectativa pasa a ser "Stop dinámico vía provider TTS dedicado para cualquier provider de sesión" más un escenario de fallback sin clave.

## Capabilities

### New Capabilities

(ninguna — es una simplificación de la capability existente)

### Modified Capabilities

- `tts-hooks`: los requisitos de "generación dinámica multi-provider" (token por provider, headers por provider, presupuesto por provider) se reemplazan por el requisito de provider TTS dedicado con dos estados: resumen dinámico (clave presente) o fallback genérico (clave ausente o fallo).

## Impact

- `src/3-operations/audit-hook-event.handler.ts` — núcleo del cambio: reescritura de `generateSpeechText`, retiro del branching multi-provider.
- `src/4-api/composition-root.ts` — retirar la inyección de `UPSTREAM_ORIGIN` al handler si queda sin uso; inyectar la credencial TTS resuelta.
- `src/2-services/tts/fallback-speech.constants.ts` — sin cambios funcionales (se reutiliza).
- `scripting/headless-tts-gateway-test*` y `tests/scripting/headless-tts-*.test.ts` — actualizar expectativas del harness y unit tests.
- `openspec/specs/tts-hooks/spec.md` — delta de requisitos (reemplazo del requisito de presupuesto multi-provider).
- `.claude/skills/headless-cli-testing/SKILL.md` — actualizar descripción del flujo TTS si menciona el provider de sesión.
- Sin dependencias nuevas; sin variables de entorno nuevas. La única configuración es la ya existente `routing/providers/openrouter/secrets.json`.
