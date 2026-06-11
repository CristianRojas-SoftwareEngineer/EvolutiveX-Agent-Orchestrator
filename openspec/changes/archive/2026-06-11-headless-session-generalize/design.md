## Context

`scripting/headless-tts-gateway-test/` contiene cuatro módulos genéricos que implementan el mecanismo de sesión aislada:

| Módulo actual | Responsabilidad |
|---|---|
| `proxy-lifecycle.ts` | Arrancar/detener proxy en puerto dedicado, health check, kill-on-port |
| `run-claude-headless.ts` | Ejecutar `claude -p` sin shell, con env injection, parsear JSON output |
| `provider-env.ts` | Resolver config de provider en memoria, construir env splits para proxy y claude |
| `env-utils.ts` | Leer `PORT` de `configs/.env`, calcular byte offset de logs |

Estos módulos no tienen dependencias TTS. El script orquestador `headless-tts-gateway-test.ts` los usa junto con módulos TTS-específicos (`log-analyzer`, `wait-for-tts`, etc.) para una suite concreta. No existe ningún punto de entrada que exponga el mecanismo genérico.

La skill `headless-cli-testing/SKILL.md` documenta mezcladamente el mecanismo y la aplicación TTS, con ~80% de contenido TTS.

## Goals / Non-Goals

**Goals:**
- Exponer `runHeadlessSession(opts)` como API programática de alto nivel para lanzar una sesión aislada Smart Code Proxy + Claude Code
- Mover los cuatro módulos genéricos a `scripting/headless-session/` con nombres consistentes
- Mantener `headless-tts-gateway-test.ts` funcionando sin cambios de lógica (solo imports)
- Reestructurar `headless-cli-testing/SKILL.md` para documentar el mecanismo genérico; extraer TTS a `references/tts-testing.md`

**Non-Goals:**
- Cambiar lógica TTS ni módulos específicos de la suite existente
- Crear comando CLI `npm run` para la API genérica
- Modificar el proxy ni el gateway

## Decisions

### D1 — Función de alto nivel, no primitivos expuestos

`runHeadlessSession(opts)` encapsula el ciclo completo: kill-port → start proxy → health check → run claude → stop proxy. El consumidor recibe solo `{ output, exitCode, isError, logPath, sessionDir, claudeStartedAt }` sin conocer el ciclo de vida.

*Alternativa descartada:* re-exportar los primitivos desde un `index.ts`. Obliga a cada consumidor a repetir el `try/finally` de lifecycle, que ya está probado en la suite TTS.

### D2 — Módulos internos no re-exportados desde `index.ts`

`proxy-lifecycle.ts`, `run-claude.ts`, `provider-env.ts` y `env-utils.ts` son importables directamente por path (para la suite TTS), pero `index.ts` solo exporta `runHeadlessSession` y su tipo `HeadlessSessionResult`. Esto evita crear una superficie de API pública implícita.

*Alternativa descartada:* barrel export de todo. Haría difícil distinguir qué es API pública vs. detalle interno.

### D3 — Renombrar `run-claude-headless.ts` → `run-claude.ts`

El sufijo `-headless` es redundante dentro de un módulo que ya se llama `headless-session/`. Queda más limpio sin redundancia.

### D4 — Estructura de `runHeadlessSession` opts

```typescript
interface HeadlessSessionOptions {
  provider: string;           // 'anthropic' | 'minimax' | 'openrouter' | 'ollama' | 'default'
  prompt: string;
  port?: number;              // default 8788
  maxTurns?: number;          // default 1
  claudeTimeoutMs?: number;   // default 180_000
  healthTimeoutMs?: number;   // default 30_000
  logFile?: string;           // default 'logs-headless.jsonl'
  auditDir?: string;          // default 'server/headless/sessions'
  extraProxyEnv?: Record<string, string>;  // para escenarios como no-openrouter-key
}

interface HeadlessSessionResult {
  output: string;
  exitCode: number;
  isError: boolean;
  logPath: string;
  sessionDir: string;
  claudeStartedAt: number;    // Date.now() al lanzar claude -p
}
```

`extraProxyEnv` permite al test TTS inyectar `OPENROUTER_SECRETS_PATH=/nonexistent` para el escenario de fallback, sin exponer ese detalle en la firma principal.

### D5 — Reestructura de la skill como cambio de documentación puro

`SKILL.md` se reescribe desde cero con foco en el mecanismo genérico. El contenido TTS actual se preserva íntegramente en `references/tts-testing.md`, siguiendo el patrón `references/` ya establecido en otras skills del repo.

## Risks / Trade-offs

- **Riesgo: imports rotos en la suite TTS** → Mitigación: actualizar todos los imports en `headless-tts-gateway-test/` y el orquestador en el mismo commit; `npm run test:quick` (typecheck) lo detecta antes del commit.
- **Trade-off: `extraProxyEnv` como escape hatch** — agrega flexibilidad pero puede convertirse en una API de facto para casos no contemplados. Aceptable porque el módulo es scripting interno, no una librería pública.

## Migration Plan

1. Crear `scripting/headless-session/index.ts` con `runHeadlessSession()`
2. Mover (copiar + borrar) los cuatro módulos a `scripting/headless-session/`
3. Actualizar imports en `scripting/headless-tts-gateway-test/` y el orquestador
4. Verificar: `npm run test:quick` (typecheck)
5. Reestructurar `SKILL.md` y crear `references/tts-testing.md`
6. Commit único con el change completo

Rollback: `git revert` del commit; no hay cambios de comportamiento en runtime.
