## Context

`SessionEnd` es el único evento del ciclo de vida que se dispara mientras Claude Code
está terminando el proceso. Los hooks síncronos compiten con el teardown del runtime y
reciben `Hook cancelled` en Windows, macOS y Linux (comportamiento documentado en el
ecosistema de Claude Code, no condicionado a un SO).

El relay `post-hook-event.ts` ya es fire-and-forget respecto a Claude (lee stdin,
hace `fetch`, sale). Solo necesita tiempo de CPU para completar el POST al gateway.

## Goals / Non-Goals

**Goals**

- Garantizar que `SessionEnd` llegue al gateway en todas las plataformas.
- Cambio mínimo: un flag en la plantilla canónica + tipo TS + test de contrato.
- Preservar hooks síncronos para los otros 12 eventos (semántica del agentic loop).

**Non-Goals**

- Lógica condicional por `process.platform` en el instalador o en el relay.
- Scripts de diagnóstico ad hoc ni workarounds con `nohup`/`disown` por SO.
- Marcar otros eventos como async.

## Decisions

### D1: `"async": true` solo en `SessionEnd` (plantilla + instalador)

**Por qué:** Es la opción soportada nativamente por Claude Code para hooks que deben
sobrevivir al cierre de sesión, sin ramas por plataforma.

**Alternativa descartada:** Detach manual con `nohup`/`start /B` — acoplamiento al
shell y al SO; frágil en PowerShell vs bash.

### D2: Preservar `async` en `resolveHooksBlock`

`resolveHooksBlock` ya hace spread de cada entrada (`{ ...entry, command: ... }`).
Solo hay que tipar `async?: boolean` en `HookEntry`; no se requiere lógica nueva.

### D3: Test de contrato en `hooks-canonical-encoding.test.ts`

Assert sobre el JSON canónico (no sobre stderr de Claude Code), válido en CI en
cualquier runner.

## Risks / Trade-offs

- **Ruido residual en stderr:** Claude Code puede seguir mostrando avisos de hooks
  cancelados de configuraciones user-level antiguas hasta reinstalar — mitigación:
  documentar `setup:install -- --hooks`.
- **Async fire-and-forget:** errores del relay no bloquean el exit code de Claude Code
  — aceptable; paridad con el resto de relays no bloqueantes.

## Migration

Usuarios con hooks instalados: `npm run setup:install -- --hooks` (idempotente).
