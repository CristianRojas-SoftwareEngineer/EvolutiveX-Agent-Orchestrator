# Tasks: simplify-tts-dedicated-openrouter

## 1. Retiro del diseño multi-provider en el handler

- [x] 1.1 `src/3-operations/audit-hook-event.handler.ts`: eliminar de `generateSpeechText` la detección `isAnthropic`/`isOllama`, la selección de token (`capturedToken`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`), los headers condicionales, el `max_tokens` condicional, la lectura de `ANTHROPIC_DEFAULT_HAIKU_MODEL` y de `PORT`, y el `fetch` al proxy local.
- [x] 1.2 Eliminar del handler el campo `capturedToken`, el método `setAuthToken()`, el campo `anthropic` y el import del SDK `@anthropic-ai/sdk`, y el parámetro de constructor `upstreamOrigin`.
- [x] 1.3 `src/5-user-interfaces/http/proxy.controller.ts:48`: eliminar la captura del token (`hookEventHandler.setAuthToken(token)`) y cualquier variable que quede huérfana por ese retiro.
- [x] 1.4 `src/4-api/composition-root.ts`: dejar de pasar `config.UPSTREAM_ORIGIN` al handler (línea ~117); verificar que `ProviderCatalogService` u otros consumidores de `UPSTREAM_ORIGIN` no se ven afectados.

## 2. Implementación del provider TTS dedicado

- [x] 2.1 `src/4-api/composition-root.ts`: resolver en el arranque la API key desde `routing/providers/openrouter/secrets.json` (campo `ANTHROPIC_AUTH_TOKEN`; archivo ausente o malformado → `undefined`, sin lanzar) e inyectarla al handler como `ttsApiKey`.
- [x] 2.2 Handler: reescribir `generateSpeechText` con el camino único — sin `ttsApiKey` → `[TTS-FALLBACK] reason: no-openrouter-key`; con clave → `fetch('https://openrouter.ai/api/v1/messages')` con modelo `poolside/laguna-xs.2:free`, `max_tokens: 512`, `reasoning: { effort: 'none' }`, headers fijos (`Authorization: Bearer`, `content-type`, `HTTP-Referer`, `X-Title`).
- [x] 2.3 Conservar sin cambios: extracción solo de bloques `text`, fallbacks `http-NNN`/`empty-response`/`exception`/`no-messages`, logs `[TTS-FALLBACK]`/`[TTS-SPEECH]`, `FALLBACK_SPEECH`.
- [x] 2.4 Definir las constantes del camino TTS (URL, modelo, budget, headers) junto a las constantes existentes del handler o en `src/2-services/tts/` — sin variables de entorno nuevas.

## 3. Actualización del harness y tests

- [x] 3.1 Revisar `scripting/headless-tts-gateway-test.ts` y módulos: la aserción "Stop dinámico" sigue válida; retirar cualquier lógica que asuma que el TTS usa el provider de sesión (p. ej. expectativas por provider del modelo haiku).
- [x] 3.2 Añadir al harness el escenario de fallback sin clave: proxy de test arrancado sin la clave TTS → asertar `[TTS-FALLBACK] reason: no-openrouter-key` y mensaje genérico.
- [x] 3.3 Actualizar `tests/scripting/headless-tts-*.test.ts` y los unit tests del handler que cubran la vía antigua (token por provider, headers condicionales, budget condicional) — reemplazarlos por tests de la vía dedicada y del fallback sin clave.
- [x] 3.4 Verificar: `npm run test:quick` en verde.

## 4. Verificación E2E

- [ ] 4.1 `npm run test:headless-tts -- --no-voice-announce` → 5/5 providers de sesión con "Stop dinámico" (todos vía OpenRouter dedicado) + escenario fallback sin clave OK, exit 0. Restricción: no tocar el proxy principal (8787) ni `configs/.env` ni `~/.claude/settings.json`.

## 5. Documentación

- [ ] 5.1 `.claude/skills/headless-cli-testing/SKILL.md`: actualizar la descripción del ciclo Stop→TTS (ya no usa el token capturado ni el provider de sesión).
- [ ] 5.2 Revisar `README.md` y docs que describan el TTS multi-provider; actualizar a "provider dedicado OpenRouter, fallback genérico sin clave".
