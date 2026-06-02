# Tasks — claude-h1-register-missing-hooks

## 1. Editar `.claude/settings.json` del proyecto

- [x] 1.1 Crear la clave `hooks` en `.claude/settings.json` con las 8 entradas del lifecycle: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`.
  - _Criterio: el archivo pasa `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json'))"` sin error de sintaxis_
  - _Criterio: `Object.keys(d.hooks).sort()` retorna exactamente `[ 'PostToolUse', 'PostToolUseFailure', 'PreToolUse', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit' ]`_
- [x] 1.2 Para cada entrada, añadir un objeto `{ "hooks": [ { "type": "command", "command": "curl -sS -X POST $ANTHROPIC_BASE_URL/hooks -H 'Content-Type: application/json' --data-binary @-" } ] }`.
  - _Criterio: las 8 entradas contienen el comando exacto anterior (verificable con `jq '.hooks[].hooks[].command'` o equivalente)_
- [x] 1.3 En `PreToolUse` y `PostToolUse`, añadir `"matcher": "*"`.
  - _Criterio: `jq '.hooks.PreToolUse.matcher'` retorna `"*"`; idem `PostToolUse`_
- [x] 1.4 En las 5 entradas con doble comando (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`), añadir un segundo objeto al array `hooks` con `"type": "command"` y `"command": "node \"C:/AI/node_modules/tsx/dist/cli.mjs\" \"C:/AI/claude-code-notifications.ts\" --event-type <EventName> [--stdin-json]"`.
  - _Criterio: cada una de esas 5 entradas tiene 2 elementos en el array `hooks`; las 3 restantes tienen 1_
  - _Criterio: el segundo comando de cada una referencia `C:/AI/claude-code-notifications.ts` con el `--event-type` correspondiente (`UserPrompt`, `AskUserQuestion` para `PreToolUse`, `Write|Edit` con `--stdin-json` para `PostToolUse`, `TurnIdle` para `Stop`, `StopFailure --stdin-json` para `StopFailure`)_

## 2. Actualizar `README.md` §setup

- [x] 2.1 Añadir (si no existe) o ampliar la sección §setup con un párrafo "Configuración de hooks" que enumere las 8 entradas del lifecycle y mencione el mecanismo de sobrescritura del user-level por el proyecto.
  - _Criterio: `grep -c "UserPromptSubmit\|PreToolUse\|PostToolUse\|PostToolUseFailure\|SubagentStart\|SubagentStop\|Stop\|StopFailure" README.md` ≥ 8_
  - _Criterio: la sección menciona explícitamente que las entradas del proyecto sobrescriben las del user-level para esas claves_

## 3. Alinear `docs/gateway-architecture.md` §18 (si documenta hooks)

- [x] 3.1 Si `docs/gateway-architecture.md` §18 documenta la config de hooks, actualizarla para reflejar las 8 entradas y los matchers `*` en `PreToolUse`/`PostToolUse`.
  - _Criterio: si §18 existe y menciona hooks, contiene las 8 entradas y los matchers `*`_
  - _Criterio: si §18 no documenta hooks, no se modifica_

## 4. Validación operacional

- [x] 4.1 Ejecutar `npm run test:quick` (lint + typecheck + unit) — debe pasar sin errores.
  - _Criterio: el comando retorna código de salida 0_
- [x] 4.2 Ejecutar `openspec validate claude-h1-register-missing-hooks` — debe pasar.
  - _Criterio: el comando retorna "is valid"_

## 5. Spec sync y archive

- [ ] 5.1 Ejecutar `openspec-sync` sobre el change para promover los deltas `ADDED Requirements` a `openspec/specs/hooks-lifecycle-correlation/spec.md`.
  - _Criterio: `openspec show hooks-lifecycle-correlation` lista los 2 nuevos requirements_
- [ ] 5.2 Ejecutar `openspec-archive` sobre el change para moverlo a `openspec/changes/archive/2026-06-02-claude-h1-register-missing-hooks/`.
  - _Criterio: `openspec list` ya no muestra el change; existe el directorio archivado_

## 6. Cierre

- [ ] 6.1 Actualizar el phase registry del orquestador L1 (`design.md`): fila H1 = `archivada`. Marcar tasks 1.1–1.10 del L1 como `[x]`.
  - _Criterio: la fila H1 del registry muestra `archivada`_
- [ ] 6.2 Commit con mensaje en español, conventional-commits, con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
  - _Criterio: `git log --oneline -1` muestra el commit; `git status` limpio_
