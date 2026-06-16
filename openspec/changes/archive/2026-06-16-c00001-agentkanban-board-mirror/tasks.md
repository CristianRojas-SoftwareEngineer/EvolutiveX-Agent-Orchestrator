## 1. Preparación

- [x] 1.1 Añadir `.agentkanban/` a `.gitignore`

## 2. Extensión del dominio — `hook.types.ts`

- [x] 2.1 Añadir campo `toolResponse?: Record<string, unknown>` a la interfaz `ClaudeHookEvent`
- [x] 2.2 Mapear `tool_response` (object) → `toolResponse` en `parseHookEvent`, consistente con el tratamiento de `toolInput`

## 3. `KanbanBoardProjector`

- [x] 3.1 Crear `src/3-operations/kanban-board.projector.ts`: constructor con `baseDir: string` y método async `onTaskCreate(event: ClaudeHookEvent): Promise<void>` que escribe `.agentkanban/tasks/<id>.md` con frontmatter YAML (`lane: todo`); obtiene id de `event.toolResponse?.task?.id`; crea el directorio si no existe; logea `warn` y no lanza si `toolResponse` o `task.id` están ausentes
- [x] 3.2 Implementar método async `onTaskUpdate(event: ClaudeHookEvent): Promise<void>`: si `status === 'in_progress'` actualiza `lane: doing`; si `status === 'completed'` actualiza `lane: done` y mueve el archivo a `.agentkanban/tasks/archive/<id>.md`; logea `warn` y no lanza si el archivo no existe; ignora silenciosamente otros valores de status
- [x] 3.3 Sanitizar valores de `subject` y `description` en la serialización YAML manual: envolver entre comillas dobles y escapar `"` interiores para evitar frontmatter inválido con caracteres especiales

## 4. Integración en `AuditHookEventHandler`

- [x] 4.1 Añadir `private readonly kanbanProjector?: KanbanBoardProjector` como argumento 11 (opcional) del constructor
- [x] 4.2 En `handlePostToolUse`, tras el bloque de toast `TaskUpdate+in_progress`, añadir: si `kanbanProjector` existe y `toolName ∈ { 'TaskCreate', 'TaskUpdate' }` y `toolInput?.metadata?.source === 'spec-delta'` → llamar `void kanbanProjector.onTaskCreate(event)` o `void kanbanProjector.onTaskUpdate(event)` según `toolName`

## 5. Wiring en `composition-root.ts`

- [x] 5.1 Importar `KanbanBoardProjector`; construirlo con `path.join(process.cwd(), '.agentkanban')`; pasarlo como argumento 11 al constructor de `AuditHookEventHandler`

## 6. `apply-specification-delta/SKILL.md`

- [x] 6.1 En Step 2, al inicio de cada iteración (antes de los cambios de código), añadir la instrucción de emitir `TaskCreate` con `{ subject: "<descripción de la tarea>", description: "<descripción completa>", metadata: { source: "spec-delta", taskNum: "N/M", group: "<heading de tasks.md>" } }` y preservar el `taskId` devuelto (`tool_response.task.id`)
- [x] 6.2 En Step 2, tras marcar el checkbox `- [x]`, añadir la instrucción de emitir `TaskUpdate` con `{ taskId: "<id preservado>", status: "completed", metadata: { source: "spec-delta" } }`
