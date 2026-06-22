## Why

El hook `SessionEnd` no entrega su `POST /hooks` al cerrar una sesión interactiva, por lo que nunca aparece el toast «Sesión finalizada». La causa raíz (confirmada empíricamente) es el **cold-start de `npx` + `tsx`** del comando actual: tarda ~1471 ms en ejecutar la primera línea del relay, pero como el hook es `async` (fire-and-forget, Claude no espera) y `SessionEnd` "cannot block", Claude derriba el subárbol de procesos del hook mucho antes de los ~1480 ms en que el relay haría el `spawn` detached. El hijo detached **nunca nace** y no hay POST. Los changes previos c00070 (`async`) y c00071 (relay detached) atacaron el síntoma equivocado: la primitiva detached funciona, pero el proceso que la ejecutaría muere durante su propio arranque.

## What Changes

- **Nuevo** `scripting/hooks/session-end-hook.ts`: script TypeScript autocontenido (sin imports relativos) que lee el payload de stdin y hace `POST /hooks` directamente. Es un cliente HTTP delgado del contrato estable `/hooks`, no comparte código con `post-hook-event.ts`.
- **Modificado** `configs/hooks.json`: la entrada `SessionEnd` pasa de `npx --prefix … tsx … detached-session-end-relay.ts` con `"async": true` a `node "${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/hooks/session-end-hook.ts"` **síncrono** (sin `npx`, sin `tsx`, sin `async`). Aprovecha el type-stripping nativo de Node. Medido: ~212 ms wall-clock (~7× más rápido), POST en ~38 ms.
- **Modificado** `scripting/features/hooks.ts`: `validateScpRoot` exige el nuevo `session-end-hook.ts` en vez de `detached-session-end-relay.ts`; `isScpManagedCommand` conserva el substring `detached-session-end-relay` para que la reinstalación limpie instalaciones viejas.
- **BREAKING** (operativo): retiro de `scripting/detached-session-end-relay.ts` y su test; tras mergear, hay que ejecutar `npm run setup:install -- --hooks` y reiniciar Claude Code para repropagar `~/.claude/settings.json`.
- **Requisito de entorno**: Node con type-stripping nativo de TypeScript (≥ 22.18 / 23.6; el entorno usa Node 24).

## Capabilities

### New Capabilities

<!-- Ninguna. El cambio modifica el comportamiento de entrega de un hook existente. -->

### Modified Capabilities

- `hooks-lifecycle-correlation`: cambia la entrega del evento `SessionEnd`. Se retiran los requirements «SessionEnd hook SHALL ejecutarse en modo async» y «SessionEnd relay SHALL usar spawn detached multiplataforma»; el comando canónico de `SessionEnd` deja de ser el relay detached y pasa a un script `node`-directo síncrono que cumple el mismo contrato `POST /hooks` dentro de la ventana de teardown.

## Impact

- **Código**: `scripting/hooks/session-end-hook.ts` (nuevo), `configs/hooks.json`, `scripting/features/hooks.ts`; eliminación de `scripting/detached-session-end-relay.ts` y `tests/scripting/detached-session-end-relay.test.ts`.
- **Specs/Docs**: `openspec/specs/hooks-lifecycle-correlation/spec.md`, `README.md`.
- **Operación**: requiere reinstalar hooks y reiniciar Claude Code post-merge; impone una versión mínima de Node con type-stripping nativo.
- **Validación pendiente (fuera de los tests automatizados)**: manual gate del `/exit` interactivo real para confirmar que el hook síncrono gana la carrera del teardown; si fallara, fallback documentado a `async` sobre el mismo script rápido.
