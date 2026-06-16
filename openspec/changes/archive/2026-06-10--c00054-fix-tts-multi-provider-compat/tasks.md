## 1. Constantes y tipos base (2-services)

- [x] 1.1 Crear `src/2-services/tts/fallback-speech.constants.ts` con `FALLBACK_SPEECH`, `STOP_FALLBACK_TEXT` y `ALL_FALLBACK_TEXTS`; eliminar la declaración inline de `FALLBACK_SPEECH` en `audit-hook-event.handler.ts` y añadir el import desde el nuevo módulo
- [x] 1.2 Verificar: `npm run test:quick` pasa sin errores de typecheck ni lint

## 2. Fix SapiTTSService awaitable (2-services)

- [x] 2.1 En `src/2-services/tts/sapi-tts.service.ts`, cambiar `speak()` para hacer `await this.synthesize()` y eliminar el fire-and-forget; actualizar `synthesize()` para resolver/rechazar en el evento `close` del proceso hijo en lugar de llamar `resolve()` y `child.unref()` inmediatamente
- [x] 2.2 Verificar: `npm run test:quick` pasa

## 3. Fix handler TTS multi-provider (3-operations)

- [x] 3.1 Añadir parámetro `upstreamOrigin: string` al constructor de `AuditHookEventHandler` con default `'https://api.anthropic.com'`
- [x] 3.2 Implementar `logTtsFallback(eventName, reason, fallbackText)` y `logTtsDynamic(eventName, text)` como métodos privados que escriben entradas JSONL con tags `[TTS-FALLBACK]` / `[TTS-SPEECH]`
- [x] 3.3 En `generateSpeechText()`, reemplazar el guard `if (!this.capturedToken || messages.length === 0)` por guards separados con sus respectivos `logTtsFallback()`: primero `no-token` (usando la selección de token por provider), luego `no-messages`
- [x] 3.4 Implementar la selección de token por provider: Anthropic → `capturedToken ?? ANTHROPIC_API_KEY`; bearer → `ANTHROPIC_AUTH_TOKEN ?? capturedToken`
- [x] 3.5 Implementar la selección de headers por provider: Anthropic → `anthropic-version: 2023-06-01`; otros → `HTTP-Referer + X-Title`
- [x] 3.6 Reemplazar `extractSpeakableTextFromContent()` para que extraiga **solo** bloques `type === "text"`; eliminar completamente la rama de fallback a bloques `thinking`; si no hay texto → `logTtsFallback("empty-response")` → retornar fallback
- [x] 3.7 Añadir `logTtsFallback("exception", ...)` en el bloque `catch` y `logTtsFallback("http-NNN", ...)` tras un `!res.ok`
- [x] 3.8 Verificar: `npm run test:quick` pasa

## 4. Wiring en composition root (4-api)

- [x] 4.1 En `src/4-api/composition-root.ts`, pasar `config.UPSTREAM_ORIGIN` como argumento al constructor de `AuditHookEventHandler`
- [x] 4.2 Verificar: `npm run test:quick` pasa

## 5. Configuración de provider OpenRouter

- [x] 5.1 En `routing/providers/openrouter/config.json`, confirmar `ANTHROPIC_DEFAULT_HAIKU_MODEL = models/laguna-xs.2` (Gemma 4 fue descartado: falla en sesiones reales vía gateway; laguna-xs.2 funciona con TTS al subir `max_tokens` a 512 para absorber su thinking)

## 6. Harness de pruebas headless

- [x] 6.1 Añadir el script `test:headless-tts` en `package.json` apuntando a `tsx scripting/headless-tts-gateway-test.ts`
- [x] 6.2 Registrar la entrada del script en `scripting/help.ts`
- [x] 6.3 Crear `scripting/headless-tts-gateway-test.ts` (orquestador CLI con `commander`) y los módulos auxiliares en `scripting/headless-tts-gateway-test/`: `types.ts`, `providers.ts`, `provider-env.ts` (resolución de config en memoria), `proxy-lifecycle.ts`, `env-utils.ts`, `run-claude-headless.ts` (spawn sin `shell: true`, env vía `--settings`), `verify-prompt.ts`, `log-analyzer.ts`, `wait-for-tts.ts`, `local-announce.ts`, `fallback-speech.ts`
- [x] 6.4 Importar `FALLBACK_SPEECH` en el harness desde `scripting/headless-tts-gateway-test/fallback-speech.ts` (re-export de `src/2-services/tts/fallback-speech.constants.ts` o copia de constantes) para que la detección de fallback silencioso use los mismos textos que el gateway
- [x] 6.5 Crear los tests unitarios del harness en `tests/scripting/`: `headless-tts-log-analyzer.test.ts`, `headless-tts-providers.test.ts`, `headless-tts-provider-env.test.ts`, `headless-tts-run-claude.test.ts`, `headless-tts-verify-prompt.test.ts`
- [x] 6.6 Verificar: `npm run test:quick` pasa con los nuevos tests

## 6b. Aislamiento del harness respecto a la sesión principal

- [x] 6b.1 Extraer la resolución de provider (tipos, `MANAGED_ENV_VARS`, `resolveModelId`, `getAvailableProviders`, `loadProviderConfig`) a `scripting/shared/provider-config.ts`; refactorizar `scripting/configure-provider.ts` para consumir el módulo compartido
- [x] 6b.2 Soportar `LOG_FILE` y `AUDIT_BASE_DIR` por entorno en `src/index.ts` (logs y auditoría de test separados de `server/logs.jsonl` y `sessions/`)
- [x] 6b.3 Crear `provider-env.ts` (`buildIsolatedProviderEnv`): config de provider resuelta en memoria e inyectada vía `--settings` a `claude -p` y vía env al proxy de test (puerto 8788, guard contra el puerto del proxy principal)
- [x] 6b.4 Ajustar presupuesto TTS en el handler: no-Anthropic 512 tokens (Ollama local 150) + `reasoning: { effort: 'none' }`; default de modelo con `||`
- [x] 6b.5 Documentar el modo aislado en `.claude/skills/headless-cli-testing/SKILL.md`
- [x] 6b.6 Verificar: `npm run test:quick` pasa con los tests nuevos (`headless-tts-provider-env.test.ts`, casos `--settings` en `headless-tts-run-claude.test.ts`)

## 7. Verificación end-to-end

- [x] 7.1 Ejecutar `npm run test:headless-tts -- --no-voice-announce` y confirmar que los 5 providers (ollama, minimax, openrouter, anthropic, default) pasan con TTS dinámico, sin `[TTS-FALLBACK]` accionable en Stop, y exit code 0
