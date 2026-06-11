# Design: simplify-tts-dedicated-openrouter

## Context

El change `fix-tts-multi-provider-compat` (archivado 2026-06-10) hizo funcionar el TTS dinámico con los 5 providers heredando el provider de la sesión. El precio fue una matriz de compatibilidad dentro de `AuditHookEventHandler.generateSpeechText`: detección por `upstreamOrigin` (`isAnthropic`, `isOllama`), selección de token (capturado OAuth vs `ANTHROPIC_AUTH_TOKEN`), headers condicionales (`anthropic-version` vs `HTTP-Referer`/`X-Title`), presupuesto condicional (150/512) y modelo desde `ANTHROPIC_DEFAULT_HAIKU_MODEL`. Este change reemplaza todo eso por un único camino: OpenRouter + `poolside/laguna-xs.2:free`.

## Goals / Non-Goals

**Goals:**
- Un solo camino de inferencia TTS, determinista: clave de OpenRouter presente → resumen dinámico; ausente o fallo → fallback genérico.
- Borrado íntegro del branching multi-provider del TTS. Sin ramas retrocompatibles, sin fallback al provider de sesión.
- Cero configuración nueva: la credencial se resuelve desde `routing/providers/openrouter/secrets.json` existente.

**Non-Goals:**
- No se toca el routing/proxy de la sesión principal (provider de sesión sigue igual para el flujo agéntico).
- No se hace configurable el provider/modelo TTS (constantes fijas, por decisión explícita).
- No se valida la clave proactivamente ni se cachea su validez.
- No se cambia la síntesis de voz (SAPI) ni los toasts.

## Decisions

### D1 — Credencial resuelta en el arranque, inyectada por el composition root
El composition root lee `routing/providers/openrouter/secrets.json` (campo `ANTHROPIC_AUTH_TOKEN`) al construir las dependencias y pasa la clave (o `undefined`) al handler como parámetro de constructor (`ttsApiKey`), reemplazando el parámetro `upstreamOrigin`. Lectura única al arranque: si el usuario añade la clave después, requiere reiniciar el proxy — aceptable y coherente con cómo se cargan el resto de configs. El handler no hace I/O de archivos.

Alternativa descartada: leer el secrets.json en cada evento Stop (I/O innecesario) o vía variable de entorno nueva (superficie de config extra).

### D2 — Llamada directa al upstream de OpenRouter, sin pasar por el proxy local
`generateSpeechText` hace `fetch('https://openrouter.ai/api/v1/messages', ...)` con el formato Anthropic-compatible que OpenRouter ya acepta (verificado en el change anterior). Ventajas: no contamina la auditoría/logs de la sesión con tráfico sintético, no depende del `PORT` del proxy, y funciona idéntico en el harness aislado (puerto 8788) y en producción (8787).

### D3 — Constantes fijas del camino TTS
- Modelo: `poolside/laguna-xs.2:free` (constante en el handler o módulo de constantes TTS; no se lee `ANTHROPIC_DEFAULT_HAIKU_MODEL`).
- `max_tokens: 512` (laguna-xs.2 es thinking; <512 produce `empty-response`, verificado).
- `reasoning: { effort: 'none' }` (reduce el razonamiento; OpenRouter lo acepta).
- Headers: `Authorization: Bearer`, `content-type`, `HTTP-Referer: https://smartcodeproxy.local`, `X-Title: Smart Code Proxy`.

### D4 — Sin clave = fallback inmediato, sin health-check
Si `ttsApiKey` es `undefined`/vacía: `[TTS-FALLBACK] reason: no-openrouter-key` y retorno del fallback genérico, sin petición HTTP. Errores en la llamada (401/429/timeout/empty) usan los `reason` existentes (`http-NNN`, `exception`, `empty-response`). El `reason: no-token` desaparece (reemplazado por `no-openrouter-key`).

### D5 — Retiro de la maquinaria multi-provider
Se eliminan del handler: `isAnthropic`, `isOllama`, `capturedToken` y `setAuthToken()` (si su único consumidor era el TTS — verificar call sites en proxy/controllers antes de borrar), el cliente `Anthropic` del SDK instanciado en el constructor (sin uso tras el cambio), el parámetro `upstreamOrigin`, y la lectura de `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`/`ANTHROPIC_DEFAULT_HAIKU_MODEL`/`PORT` dentro de `generateSpeechText`. En `composition-root.ts` se retira el paso de `config.UPSTREAM_ORIGIN` al handler. Si `setAuthToken` tiene callers externos (captura del token en el proxy), se eliminan también esos call sites — el token capturado ya no tiene consumidor.

### D6 — Harness headless: misma vía para todos los providers + escenario sin clave
`test:headless-tts` mantiene la matriz de 5 providers de sesión, pero la aserción "Stop dinámico" ahora valida que todos pasan por la vía dedicada (la clave de OpenRouter debe existir para correr la suite). Se añade un escenario de fallback: proxy de test arrancado con la clave TTS ausente (mecanismo: env/flag del harness que simule secrets ausente) → espera `[TTS-FALLBACK] reason: no-openrouter-key` y exit 0. Los unit tests de `tests/scripting/headless-tts-*.test.ts` se actualizan donde asuman la vía antigua.

## Risks / Trade-offs

- **Rate limits de los modelos `:free` de OpenRouter** (429 en horas pico) → degradación a fallback genérico, observable vía `[TTS-FALLBACK] reason: http-429`. Aceptado: la función es cosmética.
- **Privacidad**: el historial del turno viaja siempre a OpenRouter, incluso con sesiones Ollama locales. Aceptado explícitamente por el usuario: el producto no promete ser local-first.
- **Disponibilidad del modelo**: si OpenRouter retira `laguna-xs.2:free`, el TTS degrada a fallback permanente (visible en logs). Mitigación futura: cambiar la constante.
- **Dependencia de secrets.json de OpenRouter** aunque no se use OpenRouter para sesiones: documentado en el SKILL/spec; sin clave el sistema funciona con mensajes genéricos.
- **Latencia**: laguna-xs.2 piensa antes de responder; el resumen puede tardar unos segundos más que un modelo no-thinking. Aceptado (el TTS ya es asíncrono respecto al hook).
