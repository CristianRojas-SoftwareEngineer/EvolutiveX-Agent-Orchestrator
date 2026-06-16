# Spec: agentkanban-board-mirror

## Purpose

Define la proyección server-side del lifecycle de tareas spec-delta sobre archivos `.md`
en `.agentkanban/tasks/`, discriminada por `metadata.source='spec-delta'`. Permite que
el board de vscode-agent-kanban refleje el progreso real de la implementación del
pipeline spec-delta, usando la infraestructura de relay de hooks existente
(`POST /hooks` → `AuditHookEventHandler`).

---
## Requirements

### Requirement: Discriminación de eventos spec-delta en `PostToolUse`

El sistema SHALL implementar un `KanbanBoardProjector` en capa 3 (`src/3-operations/`) que sea invocado desde `AuditHookEventHandler.handlePostToolUse` **solo** cuando se cumplan todas las condiciones:

1. `event.toolName ∈ { 'TaskCreate', 'TaskUpdate' }`
2. `event.toolInput?.metadata?.source === 'spec-delta'`

El `KanbanBoardProjector` SHALL ser una dependencia opcional inyectada por constructor en `AuditHookEventHandler`. Si no se inyecta, la rama de proyección SHALL no ejecutarse (no ha de haber error).

#### Scenario: PostToolUse TaskCreate sin discriminador spec-delta no proyecta

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskCreate'` y `toolInput.metadata.source` distinto de `'spec-delta'`
- **WHEN** `AuditHookEventHandler.handlePostToolUse` procesa el evento
- **THEN** `KanbanBoardProjector` NO SHALL invocarse

#### Scenario: PostToolUse TaskCreate con discriminador spec-delta proyecta

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskCreate'`, `toolInput.metadata.source: 'spec-delta'`, y `toolResponse.task.id: '42'`
- **WHEN** `AuditHookEventHandler.handlePostToolUse` procesa el evento
- **THEN** `KanbanBoardProjector.onTaskCreate` SHALL invocarse con el evento

#### Scenario: PostToolUse TaskUpdate spec-delta proyecta al actualizar estado

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskUpdate'`, `toolInput.metadata.source: 'spec-delta'` y `toolInput.status: 'in_progress'`
- **WHEN** `AuditHookEventHandler.handlePostToolUse` procesa el evento
- **THEN** `KanbanBoardProjector.onTaskUpdate` SHALL invocarse con el evento

#### Scenario: KanbanBoardProjector ausente no lanza excepción

- **GIVEN** `AuditHookEventHandler` construido sin `KanbanBoardProjector`
- **AND** un `ClaudeHookEvent` con `eventName: 'PostToolUse'`, `toolName: 'TaskCreate'`, `toolInput.metadata.source: 'spec-delta'`
- **WHEN** el handler procesa el evento
- **THEN** no SHALL lanzarse ninguna excepción
- **AND** el resto del procesamiento (completeToolUse, toast) SHALL continuar normalmente

---

### Requirement: Creación de archivo de tarea en el board (`TaskCreate`)

Cuando `KanbanBoardProjector` recibe un evento `PostToolUse/TaskCreate` con `metadata.source='spec-delta'`, SHALL crear el archivo `.agentkanban/tasks/<id>.md` con el siguiente frontmatter YAML:

```yaml
---
id: "<tool_response.task.id>"
title: "<tool_input.subject>"
description: "<tool_input.description>"
lane: todo
group: "<tool_input.metadata.group si existe, vacío si no>"
created: "<ISO 8601 UTC>"
updated: "<ISO 8601 UTC>"
---
```

El `<id>` SHALL obtenerse de `event.toolResponse?.task?.id`. Si `toolResponse` o `tool_response.task.id` no están presentes, el projector SHALL loguear una advertencia y no escribir el archivo.

El directorio `.agentkanban/tasks/` SHALL crearse si no existe (operación idempotente).

#### Scenario: TaskCreate spec-delta crea archivo con lane todo

- **GIVEN** `KanbanBoardProjector.onTaskCreate` recibe un evento con `toolResponse.task.id: '7'`, `toolInput.subject: 'Extender parseHookEvent'`
- **WHEN** el método ejecuta
- **THEN** SHALL existir el archivo `.agentkanban/tasks/7.md`
- **AND** el frontmatter SHALL contener `lane: todo` y `id: "7"`

#### Scenario: TaskCreate sin toolResponse no crea archivo

- **GIVEN** `KanbanBoardProjector.onTaskCreate` recibe un evento con `toolResponse` ausente
- **WHEN** el método ejecuta
- **THEN** no SHALL crearse ningún archivo en `.agentkanban/tasks/`
- **AND** SHALL emitirse un log `warn`

#### Scenario: Directorio tasks creado automáticamente si no existe

- **GIVEN** `.agentkanban/tasks/` no existe en el sistema de archivos
- **AND** `KanbanBoardProjector.onTaskCreate` recibe un evento válido
- **WHEN** el método ejecuta
- **THEN** el directorio SHALL crearse
- **AND** el archivo SHALL escribirse correctamente

---

### Requirement: Actualización de lane en el board (`TaskUpdate`)

Cuando `KanbanBoardProjector` recibe un evento `PostToolUse/TaskUpdate` con `metadata.source='spec-delta'`, SHALL actualizar el campo `lane` del frontmatter del archivo `.agentkanban/tasks/<taskId>.md` según el valor de `toolInput.status`, y SHALL refrescar el campo `updated` a la marca de tiempo actual en cada actualización:

| `toolInput.status` | Acción |
|---|---|
| `in_progress` | Actualizar `lane: doing` en el frontmatter |
| `completed` | Actualizar `lane: done` en el frontmatter + mover el archivo a `.agentkanban/tasks/archive/<taskId>.md` |
| cualquier otro | No hacer nada (sin error) |

El `<taskId>` SHALL obtenerse de `event.toolInput.taskId`. Si el archivo correspondiente no existe, el projector SHALL loguear una advertencia y no lanzar excepción.

#### Scenario: TaskUpdate in_progress actualiza lane a doing

- **GIVEN** existe `.agentkanban/tasks/7.md` con `lane: todo`
- **AND** `KanbanBoardProjector.onTaskUpdate` recibe un evento con `toolInput.taskId: '7'`, `toolInput.status: 'in_progress'`
- **WHEN** el método ejecuta
- **THEN** `.agentkanban/tasks/7.md` SHALL tener `lane: doing`

#### Scenario: TaskUpdate completed archiva la tarea

- **GIVEN** existe `.agentkanban/tasks/7.md` con `lane: doing`
- **AND** `KanbanBoardProjector.onTaskUpdate` recibe un evento con `toolInput.taskId: '7'`, `toolInput.status: 'completed'`
- **WHEN** el método ejecuta
- **THEN** SHALL existir `.agentkanban/tasks/archive/7.md` con `lane: done`
- **AND** NO SHALL existir `.agentkanban/tasks/7.md`

#### Scenario: TaskUpdate con archivo inexistente no lanza excepción

- **GIVEN** no existe `.agentkanban/tasks/99.md`
- **AND** `KanbanBoardProjector.onTaskUpdate` recibe un evento con `toolInput.taskId: '99'`, `toolInput.status: 'in_progress'`
- **WHEN** el método ejecuta
- **THEN** no SHALL lanzarse ninguna excepción
- **AND** SHALL emitirse un log `warn`

---

### Requirement: Emisión de TaskCreate/TaskUpdate en `apply-specification-delta`

El skill `apply-specification-delta` SHALL emitir las tool calls `TaskCreate` y `TaskUpdate` durante el loop de implementación del Step 2, además del anuncio en prosa y los checkboxes existentes:

- Al iniciar cada tarea `- [ ]`: emitir `TaskCreate` con `{ subject: "<descripción de la tarea>", description: "<descripción completa>", metadata: { source: "spec-delta", taskNum: "<N/M>", group: "<heading de tasks.md>" } }`.
- Al completar cada tarea (`- [x]`): emitir `TaskUpdate` con `{ taskId: "<id devuelto por TaskCreate>", status: "completed", metadata: { source: "spec-delta" } }`.

El `taskId` SHALL preservarse en memoria durante el loop desde la respuesta de `TaskCreate` (`tool_response.task.id`).

#### Scenario: Loop de Step 2 emite TaskCreate al inicio de cada tarea

- **GIVEN** `tasks.md` tiene una tarea `- [ ] 1.1 Extender parseHookEvent`
- **WHEN** `apply-specification-delta` inicia esa tarea
- **THEN** SHALL emitir `TaskCreate` con `metadata.source: 'spec-delta'`
- **AND** el `id` retornado SHALL preservarse para el `TaskUpdate` posterior

#### Scenario: Loop de Step 2 emite TaskUpdate completed al marcar checkbox

- **GIVEN** `apply-specification-delta` acaba de completar la tarea `1.1`
- **AND** el `taskId` de esa tarea está en memoria
- **WHEN** marca el checkbox `- [x]`
- **THEN** SHALL emitir `TaskUpdate` con `{ taskId: "<id>", status: "completed", metadata: { source: "spec-delta" } }`
