## 1. Crear módulo headless-session

- [x] 1.1 Crear directorio `scripting/headless-session/`
- [x] 1.2 Mover `scripting/headless-tts-gateway-test/proxy-lifecycle.ts` → `scripting/headless-session/proxy-lifecycle.ts`
- [x] 1.3 Mover `scripting/headless-tts-gateway-test/run-claude-headless.ts` → `scripting/headless-session/run-claude.ts` (renombrar)
- [x] 1.4 Mover `scripting/headless-tts-gateway-test/provider-env.ts` → `scripting/headless-session/provider-env.ts`
- [x] 1.5 Mover `scripting/headless-tts-gateway-test/env-utils.ts` → `scripting/headless-session/env-utils.ts`

## 2. Implementar runHeadlessSession

- [x] 2.1 Crear `scripting/headless-session/index.ts` con tipos `HeadlessSessionOptions` y `HeadlessSessionResult`
- [x] 2.2 Implementar `runHeadlessSession(opts)`: guard de aislamiento de puerto → kill-port → start proxy → health check → run claude → stop proxy (try/finally)
- [x] 2.3 Aplicar defaults: `port=8788`, `maxTurns=1`, `claudeTimeoutMs=180_000`, `healthTimeoutMs=30_000`, `logFile='logs-headless.jsonl'`, `auditDir='server/headless/sessions'`
- [x] 2.4 Pasar `extraProxyEnv` al `startProxy` cuando se provea

## 3. Actualizar imports de la suite TTS

- [x] 3.1 Actualizar imports en todos los archivos de `scripting/headless-tts-gateway-test/` que referencien los módulos movidos
- [x] 3.2 Actualizar imports en `scripting/headless-tts-gateway-test.ts` (orquestador)
- [x] 3.3 Verificar: `npm run test:quick` pasa sin errores de typecheck

## 4. Reestructurar skill headless-cli-testing

- [x] 4.1 Crear `scripting/headless-session/index.ts` con tipos `HeadlessSessionOptions` y `HeadlessSessionResult` (ya cubierto por 2.1 — verificar completitud)
- [x] 4.2 Crear directorio `.claude/skills/headless-cli-testing/references/`
- [x] 4.3 Crear `.claude/skills/headless-cli-testing/references/tts-testing.md` con el contenido TTS extraído del `SKILL.md` actual (ciclo TTS, log tags, provider matrix, drain loop, escenario fallback, `npm run test:headless-tts`)
- [x] 4.4 Reescribir `.claude/skills/headless-cli-testing/SKILL.md` centrado en el mecanismo genérico: overview, isolation guard, arquitectura de módulos, uso manual con `claude -p`, uso programático con `runHeadlessSession`, referencia a `references/tts-testing.md`
