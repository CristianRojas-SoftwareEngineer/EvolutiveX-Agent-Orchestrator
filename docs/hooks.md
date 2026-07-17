# Hooks de Claude Code — Arquitectura e implementación

**Smart Code Proxy** intercepta 13 eventos de hooks de Claude Code para correlacionar workflows y emitir notificaciones de escritorio. Esta documentación describe el contrato, la implementación y cómo se construye cada mensaje de notificación.

---

## Tabla de contenidos

- [1. Clasificación de hooks](#1-clasificación-de-hooks)
- [2. Configuración de hooks](#2-configuración-de-hooks)
- [3. Relays de eventos](#3-relays-de-eventos)
- [4. Mensaje de notificación por hook](#4-mensaje-de-notificación-por-hook)
  - [4.1. Hooks con mensaje estático](#41-hooks-con-mensaje-estático)
  - [4.2. Hooks con mensaje dinámico desde payload](#42-hooks-con-mensaje-dinámico-desde-payload)
  - [4.3. Hooks con mensaje contextual (transcript)](#43-hooks-con-mensaje-contextual-transcript)
- [5. Integración con notificaciones de escritorio](#5-integración-con-notificaciones-de-escritorio)

---

## 1. Clasificación de hooks

Claude Code emite hooks en 13 puntos del **ciclo de vida del turno** (desde que el usuario envía un prompt hasta que el asistente termina, incluyendo spawn/cierre de subagentes y eventos de tareas). Smart Code Proxy los clasifica según su función en el gateway:

| Hook | Origen | Correlación workflow | Toast |
|------|--------|----------------------|-------|
| `UserPromptSubmit` | Ciclo de turno | No (workflow creado por wire) | Sí (`prompt` → preview) |
| `PreToolUse` | Ciclo de turno | Sí (ToolUse.status) | Sí (solo AskUserQuestion) |
| `PostToolUse` | Ciclo de turno | Sí (completar ToolUse) | Sí (condicional TaskInProgress) |
| `PostToolUseFailure` | Ciclo de turno | Sí (ToolUse.status) | No |
| `SubagentStart` | Subagente | Sí (confirmar sub-workflow) | Sí |
| `SubagentStop` | Subagente | Sí (cerrar workflow) | Sí (contextual) |
| `Stop` | Ciclo de turno | Sí (cerrar workflow main) | Sí (contextual) |
| `StopFailure` | Ciclo de turno | Sí (cerrar con error) | Sí (`error` + `last_assistant_message`) |
| `SessionStart` | Sesión | No | Sí |
| `SessionEnd` | Sesión | No | Sí (contextual) |
| `PermissionRequest` | UX | No | Sí (`tool_name` + preview) |
| `TaskCreated` | UX | No | Sí |
| `TaskCompleted` | UX | No | Sí |

**Nota:** `TaskInProgress` no es un hook de Claude Code. Es un caso especial dentro de `PostToolUse` cuando `toolName === 'TaskUpdate' && toolInput.status === 'in_progress'`. El gateway evalúa esta condición y emite un toast distinto.

**Resumen por función:**

| Función | Hooks | Cantidad |
|---------|-------|----------|
| **Correlación workflows** | PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, Stop, StopFailure | 7 |
| **Solo notificación** | UserPromptSubmit, SessionStart, SessionEnd, PermissionRequest, TaskCreated, TaskCompleted | 6 |
| **Caso especial (PostToolUse)** | TaskInProgress (interno) | 1 |

---

## 2. Configuración de hooks

**Plantilla canónica:** [`configs/hooks.json`](../configs/hooks.json)

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "..." }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "..." }] }],
    ...
  }
}
```

La cobertura incluye:
- **8 hooks de lifecycle** (fundamental para correlación de workflows)
- **5 hooks de UX** (SessionStart, SessionEnd, PermissionRequest, TaskCreated, TaskCompleted)

---

## 3. Relays de eventos

### 3.1. Relay genérico (12 hooks)

**`scripting/hooks/post-hook-event.ts`**

Cliente minimalista que:
1. Lee el payload JSON de `stdin` (UTF-8)
2. Envía `POST /hooks` a `$ANTHROPIC_BASE_URL`
3. Sale con código 0/1

Este relay **NO** decide efectos. Solo reenvía al gateway, que centraliza toda la lógica de correlación y notificaciones.

### 3.2. Relay especializado (SessionEnd)

**`scripting/hooks/session-end-hook.ts`**

Cliente autocontenido que usa `node` directo (type-stripping nativo, sin `npx`/`tsx`). Es equivalente al genérico pero más rápido en el teardown de sesión.

### 3.3. Hook secundario en Stop (pipeline AUTO)

**`scripting/openspec/enforce-auto-pipeline.mts`**

Hook **secundario** que corre después de `post-hook-event.ts` en el evento `Stop`. Su propósito es controlar el flujo del pipeline specification-delta en modo AUTO: bloquea el cierre del turno hasta que el pipeline complete o se alcance una parada admisible. **No emite notificaciones**; solo devuelve `{ "decision": "block" }` para bloquear el stop o permite el cierre.

---

## 4. Mensaje de notificación por hook

### 4.1. Mensajes estáticos (catálogo)

Estos son los mensajes por defecto del catálogo en `event-notification-profile.ts`. **Nota clave:** El mensaje estático de `Stop`, `SubagentStop` y `SessionEnd` es reemplazado por el contenido del transcript cuando está disponible (ver 4.3):

| Hook | Mensaje estático | Imagen | Sonido (Windows) |
|------|------------------|--------|------------------|
| `UserPromptSubmit` | Procesando tu solicitud... | user-prompt-submit.png | Reminder |
| `PreToolUse` | Pregunta pendiente — Responde en la ventana del cliente. | pre-tool-use-ask.png | SMS |
| `SubagentStart` | Subagente iniciado | subagent-start.png | IM |
| `SubagentStop` | Subagente terminado | subagent-stop.png | Default |
| `Stop` | Tu turno — El asistente terminó. Escribe tu siguiente mensaje. | stop.png | IM |
| `StopFailure` | Error de API — No se completó la respuesta. | stop-failure.png | LoopingAlarm7 |
| `SessionStart` | Sesión iniciada | session-start.png | Default |
| `SessionEnd` | Sesión finalizada | session-end.png | Default |
| `PermissionRequest` | Permiso requerido — Confirma la herramienta en el cliente. | permission-request.png | SMS |
| `TaskCreated` | Tarea creada | task-created.png | Reminder |
| `TaskCompleted` | Tarea completada | task-completed.png | Default |

**Título del toast:** El `emitToast(title, text)` usa el nombre del hook como título (ej: `"Stop"`, `"SubagentStop"`). Para `TaskCreated/TaskCompleted`, el título es `"Tarea creada"` o `"Tarea completada"` directamente.

**Implementación:** `AuditHookEventHandler.emitToast(título, mensaje)` donde el segundo parámetro es el texto ya construido.

### 4.2. Mensajes dinámicos desde payload

Estos mensajes se construyen leyendo campos del payload del hook. Algunos hooks (AskUserQuestion, TaskUpdate) son **condicionales** → el formatter devuelve `null` si no aplican:

| Hook + Condición | Formatter | Campos relevantes | Formato del mensaje |
|------------------|-----------|-------------------|---------------------|
| `UserPromptSubmit` | `formatUserPromptSubmitMessage` | `prompt` | Preview truncado (120 chars) del prompt |
| `StopFailure` | `formatStopFailureMessage` | `error`, `last_assistant_message` | "Límite de tasa (API)\n[preview]" o solo tipo de error |
| `PreToolUse` (AskUserQuestion) | `formatPreToolUseAskMessage` | `tool_input.questions[]` | "N preguntas pendientes\n[preview de la primera]" |
| `PermissionRequest` | `formatPermissionRequestMessage` | `tool_name`, `tool_input` | "Permiso para: [tool]\n[preview]" |
| `PostToolUse` (TaskUpdate in_progress) | `formatTaskInProgressMessage` | `tool_input.subject` | "Tarea iniciada: [subject]" |

**Implementación:** `resolveHookNotificationMessage(eventKey, payload)` devuelve el texto formateado o `null`. La CLI usa `--stdin-json` para activar este path.

### 4.3. Hooks con mensaje contextual (transcript)

Estos hooks enriquecen el toast con el último mensaje del asistente, leído del transcript:

| Hook | Método | Fuente del texto |
|------|--------|------------------|
| `Stop` | `announceStop()` | `lastAssistantText(transcriptPath)` → último mensaje del transcript |
| `SubagentStop` | `emitContextualToast()` | `lastAssistantText(transcriptPath)` → último mensaje del transcript |
| `SessionEnd` | `lastAssistantText()` directo | `lastAssistantText(transcriptPath)` → preview del transcript |

**Formato del mensaje contextual:**
- Si hay texto del transcript: `"Título del evento: [texto]"`
- Si no: `"Título del evento"` (texto fijo del catálogo)

**Ejemplos:**
- `Stop`: "Tu turno — El asistente terminó. Escribe tu siguiente mensaje.: [último mensaje]" o solo el mensaje estático
- `SubagentStop`: "Subagente terminado: [último mensaje]" o "Subagente terminado"
- `SessionEnd`: "Sesión finalizada: [último mensaje]" o "Sesión finalizada"

---

## 5. Integración con notificaciones de escritorio

### 5.1. Flujo completo

```mermaid
sequenceDiagram
  participant CC as Claude Code
  participant Relay as post-hook-event.ts
  participant GW as Gateway (AuditHookEventHandler)
  participant Notifier as INotificationService

  CC->>Relay: Hook stdin → POST /hooks
  Relay->>GW: Payload JSON
  GW->>GW: switch(eventName)
  GW->>Notifier: notify({title, message, appId?, icon?, sound?})
  Notifier->>Notifier: DesktopNotificationAdapter → node-notifier
```

### 5.2. Branding

| Campo | Valor por defecto | Configuración |
|-------|-------------------|---------------|
| `appId` (AUMID) | `AIAssistant.Proxy` | Variable `AI_ASSISTANT_AUMID` |
| `icon` | `assets/notifications/events/[event].png` | `--icon` o ruta estable en `%LOCALAPPDATA%\AIAssistant\` |
| `sound` | Token por evento (ver tabla en 4.1) | Variable `sound` en `event-notification-profile.ts` |

### 5.3. Helpers de branding

**`src/2-services/notifications/register.ts`**

| Comando | Acción |
|---------|--------|
| `--install` | Crea `.lnk` + registro AUMID (idempotente) |
| `--status` | Verifica estado de registro |
| `--uninstall` | Elimina `.lnk` y clave de registro |

---

## Referencias

- Spec: `openspec/specs/desktop-notifications-service/spec.md`
- Spec: `openspec/specs/hooks-lifecycle-correlation/spec.md`
- Implementación: `src/3-operations/audit-hook-event.handler.ts`
- Formatters: `src/2-services/notifications/hook-payload-notification-message.ts`