# claude-h1-register-missing-hooks

> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** h1 (H)

## Why

`server/logs.jsonl` acumula 256 warnings recurrentes originados en `src/3-operations/audit-workflow.handler.ts:604` (`[audit] No se encontró workflow padre para continuation — creando workflow standalone`) porque el `AuditHookEventHandler` espera 8 eventos del lifecycle y `.claude/settings.json` del proyecto está vacío. La spec canónica `hooks-lifecycle-correlation` define el contrato de hooks (8 eventos, `POST /hooks` con `ANTHROPIC_BASE_URL`), pero la configuración que dispara esos eventos no existe en el proyecto.

## What Changes

- Registra las 8 entradas del lifecycle en `.claude/settings.json` del proyecto: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`.
- Cada entrada incluye al menos un comando que invoca `POST $ANTHROPIC_BASE_URL/hooks` reenviando el payload JSON del hook por stdin. La URL del proxy se resuelve vía variable de entorno (no se acopla a `http://127.0.0.1:8787` literal).
- Los 5 hooks con notificación previa en user-level (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`) conservan el segundo comando apuntando a `C:\AI\claude-code-notifications.ts` hasta que N2 los reapunte al entry point del repo. Los 3 hooks nuevos (`SubagentStart`, `SubagentStop`, `PostToolUseFailure`) no llevan segundo comando.
- Los matchers de `PreToolUse` y `PostToolUse` se establecen en `*` para que el gateway reciba los eventos de todas las tools (no solo las listadas en matchers estrechos como `AskUserQuestion` o `Write|Edit`).
- Las entradas a nivel de proyecto sobrescriben las del user-level para las claves presentes (mecanismo de merge de Claude Code: el proyecto tiene precedencia).
- Actualiza `README.md` §setup para documentar el registro de las 8 entradas y el mecanismo de sobrescritura del user-level.
- Si `docs/gateway-architecture.md` §18 documenta config de hooks, lo alinea con el estado real de `.claude/settings.json`.

## Capabilities

### New Capabilities

- _(ninguna — este change no introduce una capability nueva en `openspec/specs/`)._

### Modified Capabilities

- `hooks-lifecycle-correlation`: se añaden requirements que reflejan el contrato de configuración de las 8 entradas del lifecycle en `.claude/settings.json` del proyecto, los matchers `*` en `PreToolUse`/`PostToolUse`, el uso de `$ANTHROPIC_BASE_URL`, y el mecanismo de sobrescritura del user-level por el proyecto.

## Impact

- `.claude/settings.json` del proyecto: pasa de `{}` a contener las 8 entradas del lifecycle con sus comandos.
- `README.md` §setup: nuevo párrafo "Configuración de hooks" con la enumeración de las 8 entradas.
- `docs/gateway-architecture.md` §18 (solo si documenta config de hooks): alinea su descripción con la config real.
- `C:\AI\claude-code-notifications.ts`: intacto (no se elimina; queda como fallback hasta N2).
- `src/`, `tests/`, `sessions/`: intactos (H1 es solo configuración, no toca código PKA).
- `package.json`: intacto (no se añaden dependencias; H1 no requiere `node-notifier` ni `commander`).
- `server/logs.jsonl`: tras una sesión de prueba representativa, deja de contener el warning `[audit] No se encontró workflow padre para continuation`.
