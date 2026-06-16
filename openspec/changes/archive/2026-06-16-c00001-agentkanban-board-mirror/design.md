## Context

El pipeline spec-delta (`apply-specification-delta`) implementa tareas anunciándolas en prosa y marcando checkboxes en `tasks.md`, pero no emite `TaskCreate`/`TaskUpdate` con metadatos de discriminación. Como consecuencia, el board de vscode-agent-kanban no recibe feed para reflejar el ciclo de vida de la implementación.

El proxy ya cuenta con la infraestructura de relay (`scripting/post-hook-event.ts` → `POST /hooks` → `AuditHookEventHandler`) y con el patrón de dependencias opcionales en el constructor del handler (tts, notifier, contextExtractor). El único eslabón faltante es (a) que `parseHookEvent` preserve `tool_response` y (b) que exista una clase que proyecte esos eventos a `.agentkanban/tasks/`.

El cambio es puramente aditivo: no rompe ningún comportamiento existente.

## Goals / Non-Goals

**Goals:**

- Proyectar el lifecycle de tareas spec-delta (`TaskCreate`, `TaskUpdate`) sobre archivos `.agentkanban/tasks/<id>.md` con frontmatter YAML y lane `todo|doing|done`.
- Archivar la tarea completada en `.agentkanban/tasks/archive/<id>.md`.
- Discriminar exclusivamente por `toolInput.metadata.source === 'spec-delta'`.
- Preservar todo el comportamiento existente del handler (`completeToolUse`, toast, TTS).
- Extender `ClaudeHookEvent` con `toolResponse` para acceder a `task.id` del `TaskCreate`.

**Non-Goals:**

- Tablero Kanban general para todas las tasks del harness (solo spec-delta).
- Sincronización bidireccional (board → harness).
- Persistencia del board en git (`.agentkanban/` permanece fuera del VCS).
- Soporte para otros eventos task fuera de `TaskCreate`/`TaskUpdate`.

## Decisions

### D1: `KanbanBoardProjector` como dependencia opcional en `AuditHookEventHandler`

**Alternativas consideradas:**

- A) Lógica inline en `handlePostToolUse` — acopla una concern de I/O de archivos al handler de correlación de workflows.
- B) Script relay separado en `scripting/` — fuera de la cadena de tipos, duplica la lectura de stdin.
- **C) `KanbanBoardProjector` en `src/3-operations/` como dependencia opcional inyectada vía constructor** — coherente con el patrón existente (posiciones 5–10 en el constructor son todas opcionales: ttsService, contextExtractor, notifier, toastBranding, ttsApiKey). Keeps `AuditHookEventHandler` cohesivo.

**Decisión: C.** `KanbanBoardProjector` se añade como argumento 11 (`readonly kanbanProjector?: KanbanBoardProjector`) en el constructor de `AuditHookEventHandler`.

### D2: Activación siempre-on en `composition-root.ts`

**Alternativas consideradas:**

- A) Gated por variable de entorno `KANBAN_ENABLED=true` — añade configuración que el usuario necesita gestionar.
- **B) Siempre construido en `createProxyDependencies`** — `.agentkanban/tasks/` solo se crea cuando llegan eventos reales; no hay overhead en arranque.

**Decisión: B.** El projector se construye con `baseDir = path.join(process.cwd(), '.agentkanban')` directamente en `composition-root.ts`. No requiere nueva variable de entorno. Si el directorio no existe, se crea la primera vez que llega un evento `TaskCreate`.

### D3: Campo `toolResponse` en `ClaudeHookEvent` — opaque pass-through

**Alternativas consideradas:**

- A) Extraer solo `tool_response.task.id` como campo tipado `taskResponseId?: string` — más restrictivo, pero pierde el resto del payload para usos futuros.
- **B) Preservar todo el objeto como `toolResponse?: Record<string, unknown>`** — minimal, non-breaking, consistente con el tratamiento de `toolInput`.

**Decisión: B.** Se añade `toolResponse?: Record<string, unknown>` a `ClaudeHookEvent` y se mapea `tool_response` → `toolResponse` en `parseHookEvent`.

### D4: Formato del archivo `.agentkanban/tasks/<id>.md`

El archivo usa frontmatter YAML minimal, sin dependencia de una librería YAML (serialización manual de string → valor):

```markdown
---
id: "7"
title: "Extender parseHookEvent"
description: "..."
lane: todo
group: ""
created: "2026-06-15T10:00:00.000Z"
updated: "2026-06-15T10:00:00.000Z"
---
```

Campos: `id` (string), `title` (de `toolInput.subject`), `description`, `lane` (`todo|doing|done`), `group` (de `toolInput.metadata.group`, vacío si ausente), `created` (ISO 8601 UTC, fijado al momento de escritura), `updated` (ISO 8601 UTC, igual a `created` en la creación y refrescado a la marca de tiempo actual en cada `TaskUpdate`). No se usa librería YAML externa — la estructura es suficientemente simple.

### D5: Actualización del frontmatter — reescritura completa del archivo

**Alternativas consideradas:**

- A) Edición línea por línea con regex — frágil ante variaciones de espaciado.
- **B) Reescritura completa del archivo** — lee el frontmatter actual, extrae campos, sobreescribe el campo `lane`. El contenido de cuerpo (todo lo que va después del cierre `---`) se preserva.

**Decisión: B.** `onTaskUpdate` lee el archivo, reemplaza el campo `lane` con el valor nuevo y refresca el campo `updated` a la marca de tiempo actual; los demás campos (`id`, `title`, `description`, `group`, `created`) se preservan inalterados.

### D6: Emisión de TaskCreate/TaskUpdate en `apply-specification-delta` Step 2

**Alternativas consideradas:**

- A) Modificar `create-plan` para inyectar `metadata.source='spec-delta'` — `create-plan` es general-purpose; no es el lugar correcto.
- B) Añadir metadata al update del harness task list interno de create-plan — no disponible: `create-plan` no expone ese hook.
- **C) Step 2 emite sus propios `TaskCreate`/`TaskUpdate` con `metadata.source='spec-delta'` por cada tarea de `tasks.md`** — ortogonal al tracking interno del plan. Los harness tasks del plan (creados por create-plan) y los del board (creados en Step 2) son paralelos y sirven propósitos distintos.

**Decisión: C.** Para cada tarea `- [ ]` en `tasks.md`, Step 2 llama:
1. `TaskCreate({ subject, description, metadata: { source: 'spec-delta', taskNum: 'N/M', group: '<heading>' } })` → recibe `taskId`.
2. Implementa la tarea.
3. `TaskUpdate({ taskId, status: 'completed', metadata: { source: 'spec-delta' } })`.
4. Marca el checkbox `- [x]`.

El `taskId` se preserva en memoria durante el loop (variable local por iteración).

### D7: `.agentkanban/` en `.gitignore`

`.agentkanban/` es un artefacto de ejecución local (equivalente a `sessions/` o `server/`). Debe añadirse a `.gitignore`. La tarea de cleanup (tasks.md) incluye este paso.

## Risks / Trade-offs

- **I/O async en handler sync** → La proyección se ejecuta con `void projector.onTaskCreate(event)` (fire-and-forget), consistente con el patrón de `emitToast` y `speakAsync`. Los errores se capturan internamente con `logger.warn`; nunca propagan al flujo principal.
- **Frontmatter manual sin parser YAML** → La estructura es suficientemente simple (escalares de string e ISO date). Si el contenido de `subject`/`description` contiene caracteres YAML especiales (`:`), la serialización manual debe sanitizarlos (wrap entre comillas dobles con escape de `"`).
- **Idempotencia no garantizada en TaskCreate duplicado** → Si el pipeline re-ejecuta una tarea (reintentos), se crea un archivo nuevo con el mismo `taskId`. No es un problema práctico dado que el board muestra el estado actual.
- **`apply-specification-delta` crea tasks paralelas** → El harness task list del plan (vía create-plan) y los tasks spec-delta del board (emitidos en Step 2) son independientes. No hay colisión de ids.

## Migration Plan

1. Añadir `.agentkanban/` a `.gitignore` (primer task de implementación).
2. Extender `ClaudeHookEvent` + `parseHookEvent` (`hook.types.ts`).
3. Crear `KanbanBoardProjector` (`src/3-operations/kanban-board.projector.ts`).
4. Inyectar `KanbanBoardProjector` en `AuditHookEventHandler` (constructor + `handlePostToolUse`).
5. Wiring en `composition-root.ts`.
6. Actualizar `apply-specification-delta/SKILL.md` Step 2.

No hay rollback destructivo: todos los cambios son aditivos. Para desactivar el board, basta con no inyectar `KanbanBoardProjector` en el composition root.

## Open Questions

- *(resuelto en D2)* ¿Flag de configuración o siempre-on? → Siempre-on.
- *(resuelto en D3)* ¿Campo tipado o pass-through? → Pass-through `Record<string, unknown>`.
