## Context

`SessionEnd` es el único hook del ciclo de vida que se dispara mientras Claude Code
apaga el proceso. El delta c00070 añadió `"async": true` para evitar `Hook cancelled`,
pero el relay síncrono a `post-hook-event.ts` sigue muriendo con el padre antes de
completar el fetch. La sonda `detached-session-end-probe.ts` validó que un wrapper con
`spawn({ detached: true })` + `unref()` entrega `SessionEnd` al gateway; esa sonda es
instrumentación temporal que debe retirarse.

Patrón existente en el repo: `scripting/clean-modules.ts` usa el mismo mecanismo
detached para `npm install` en auto-recuperación.

## Goals / Non-Goals

**Goals:**

- Entregar `SessionEnd` al gateway de forma fiable en Windows, macOS y Linux.
- Script productivo sin trazas ni logs de sonda.
- Mantener `"async": true` en la plantilla (complementa el relay detached).
- Eliminar toda la instrumentación temporal del probe.

**Non-Goals:**

- Cambiar el relay de los otros 12 eventos (siguen usando `post-hook-event.ts` directo).
- Añadir TTS o cambios en `AuditHookEventHandler` para `SessionEnd`.
- Resolver la no-emisión de `SessionEnd` en modo `claude -p` (limitación del runtime).

## Decisions

### D1: Script dedicado `detached-session-end-relay.ts` en `scripting/`

Un único entry point invocado solo por `SessionEnd`. Lee stdin, delega al hijo
detached, sale. Reutiliza `readStdinBuffer` exportado desde `post-hook-event.ts` y
`resolvePosixAbsolutePath` de `npx-tsx-command.ts`.

**Alternativa descartada:** integrar lógica detached dentro de `post-hook-event.ts` con
flag/env — mezclaría responsabilidades y afectaría los otros 12 hooks.

### D2: Hijo con node + tsx directo (sin npx)

El hijo usa `process.execPath`, `node_modules/tsx/dist/cli.mjs` y ruta absoluta a
`post-hook-event.ts`. Reduce cold-start frente a `npx` en el camino crítico del apagado.

**Alternativa descartada:** hijo también vía `npx` — latencia extra en el momento más
restrictivo del ciclo de vida.

### D3: Comando del hook vía plantilla npx estándar

La entrada en `hooks.json` invoca el relay padre con el mismo patrón
`npx --prefix … tsx …/detached-session-end-relay.ts` que el resto de hooks. Solo el
hijo interno evita npx.

### D4: Retirar probe sin reemplazo en tests E2E

Los tests de contrato verifican plantilla, tipos y `spawnDetachedPostHookEvent` vía
unit test del módulo relay. No se mantiene runner headless del probe.

## Risks / Trade-offs

- **[Riesgo] Gateway caído al cerrar sesión** → El hijo detached fallará igual que
  `post-hook-event.ts` directo; no empeora el comportamiento previo.
- **[Riesgo] Proceso huérfano** → Aceptable: el hijo termina tras el POST (segundos).
- **[Trade-off] Dos procesos por SessionEnd** → Coste mínimo, solo al cerrar sesión.

## Migration Plan

1. Merge del delta e implementación.
2. `npm run setup:install -- --hooks` en máquinas de desarrollo.
3. Verificar `SessionEnd` en `server/logs.jsonl` al cerrar sesión interactiva.

## Open Questions

_(ninguna — la sonda acotada ya validó la estrategia)_
