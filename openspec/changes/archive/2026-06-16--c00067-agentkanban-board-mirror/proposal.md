## Why

`apply-specification-delta` anuncia tareas en prosa pero no emite `TaskCreate`/`TaskUpdate`, por lo que el board de vscode-agent-kanban no tiene feed para reflejar el ciclo de vida de tareas del pipeline. Proyectar esos eventos a `.agentkanban/tasks/` permitiría ver el progreso real de la implementación del spec-delta en el tablero Kanban, usando la infraestructura de relay de hooks ya existente.

## What Changes

- `ClaudeHookEvent` y `parseHookEvent` reciben un nuevo campo opcional `toolResponse?: Record<string, unknown>` que mapea `tool_response` del payload wire. Necesario para obtener `tool_response.task.id` en `TaskCreate`.
- Nueva clase `KanbanBoardProjector` en `src/3-operations/` que escribe y actualiza archivos `.agentkanban/tasks/<id>.md` (frontmatter YAML con `lane: todo|doing|done`) y archiva tareas completadas en `.agentkanban/tasks/archive/`.
- `AuditHookEventHandler` recibe `KanbanBoardProjector` como dependencia opcional inyectada por constructor; su rama `PostToolUse` llama al projector cuando `toolName ∈ {TaskCreate, TaskUpdate}` y `toolInput.metadata.source === 'spec-delta'`.
- `apply-specification-delta/SKILL.md` Step 2: el loop emite `TaskCreate` (con `metadata: { source: 'spec-delta' }`) al inicio de cada tarea y `TaskUpdate` al completarla, además del anuncio en prosa y el checkbox existentes.

## Capabilities

### New Capabilities

- `agentkanban-board-mirror`: proyección del lifecycle de tareas spec-delta sobre archivos `.md` en `.agentkanban/tasks/`, discriminada por `metadata.source='spec-delta'`.

### Modified Capabilities

- `hooks-lifecycle-correlation`: la interfaz `ClaudeHookEvent` y `parseHookEvent` ganan el campo `toolResponse` (extiende el requisito "Parsing puro del evento de hook"); la tabla de despacho de `PostToolUse` en `AuditHookEventHandler` incluye la proyección al board como nueva acción.

## Impact

- `src/1-domain/types/hook.types.ts` — nueva propiedad `toolResponse` en la interfaz y en el parser.
- `src/3-operations/audit-hook-event.handler.ts` — nueva dependencia opcional `KanbanBoardProjector`; rama `handlePostToolUse` extendida.
- `src/3-operations/kanban-board.projector.ts` — nuevo archivo.
- `.claude/skills/apply-specification-delta/SKILL.md` — instrucciones del Step 2 actualizadas.
- `.agentkanban/tasks/` — directorio creado por el projector en tiempo de ejecución (no commiteado con el código).
