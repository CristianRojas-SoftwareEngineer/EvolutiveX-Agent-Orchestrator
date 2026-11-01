# Hooks de Claude Code — Arquitectura e implementación

**Smart Code Proxy** intercepta 13 eventos de hooks de Claude Code para correlacionar workflows, cerrar métricas de sesión y proyectar tareas en Kanban.

---

## Tabla de contenidos

- [1. Clasificación de hooks](#1-clasificación-de-hooks)
- [2. Configuración de hooks](#2-configuración-de-hooks)
- [3. Relays de eventos](#3-relays-de-eventos)
- [4. Referencias](#4-referencias)

---

## 1. Clasificación de hooks

Claude Code emite hooks en 13 puntos del **ciclo de vida del turno**. Smart Code Proxy los recibe en `POST /hooks` y los procesa en `AuditHookEventHandler`:

| Hook                 | Origen         | Efecto en el gateway                                                      |
| -------------------- | -------------- | ------------------------------------------------------------------------- |
| `UserPromptSubmit`   | Ciclo de turno | Sin efecto en repo (workflow creado por wire)                             |
| `PreToolUse`         | Ciclo de turno | Traza de log informativa                                                  |
| `PostToolUse`        | Ciclo de turno | Completar `ToolUse` (autoridad `hook`) + proyección Kanban (`spec-delta`) |
| `PostToolUseFailure` | Ciclo de turno | Completar `ToolUse` con error (`isError: true`)                           |
| `SubagentStart`      | Subagente      | Confirmar sub-workflow (`confirmSubagentFromHook`)                        |
| `SubagentStop`       | Subagente      | Cerrar sub-workflow y finalizar métricas                                  |
| `Stop`               | Ciclo de turno | Cerrar workflow principal y finalizar métricas                            |
| `StopFailure`        | Ciclo de turno | Cerrar workflow con error y finalizar métricas                            |
| `SessionStart`       | Sesión         | Reservado en relay `POST /hooks`                                          |
| `SessionEnd`         | Sesión         | Reservado en relay síncrono `session-end-hook.ts`                         |
| `PermissionRequest`  | UX             | Reservado en relay `POST /hooks`                                          |
| `TaskCreated`        | UX             | Reservado en relay `POST /hooks`                                          |
| `TaskCompleted`      | UX             | Reservado en relay `POST /hooks`                                          |

---

## 2. Configuración de hooks

**Plantilla canónica:** [`configs/hooks.json`](../configs/hooks.json)

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "..." }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "..." }] }]
  }
}
```

---

## 3. Relays de eventos

### 3.1. Relay genérico (12 hooks)

**`scripting/hooks/post-hook-event.ts`**

Cliente minimalista que lee el payload JSON de `stdin` (UTF-8), envía `POST /hooks` a `$ANTHROPIC_BASE_URL` y sale sin decidir efectos locales.

### 3.2. Relay especializado (SessionEnd)

**`scripting/hooks/session-end-hook.ts`**

Cliente autocontenido que usa `node` directo (type-stripping nativo, sin `npx`/`tsx`) para entregar `POST /hooks` dentro del presupuesto de cierre de sesión.

### 3.3. Hook secundario en Stop (pipeline AUTO)

**`scripting/openspec/enforce-auto-pipeline.mts`**

Hook secundario que controla el flujo del pipeline specification-delta en modo AUTO.

---

## 4. Referencias

- Spec: `openspec/specs/hooks-lifecycle-correlation/spec.md`
- Implementación: `src/3-operations/audit-hook-event.handler.ts`
