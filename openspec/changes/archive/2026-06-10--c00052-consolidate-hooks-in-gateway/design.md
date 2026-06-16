## Context

El sistema tiene 14 eventos de hook de Claude Code que producen efectos (toasts, TTS, audit). Hoy esos efectos se ejecutan en 5 tipos de scripts distintos, algunos con lógica de decisión embebida (filtros condicionales, mensajes dinámicos). El gateway solo conoce 8 de los 14 eventos; los 5 eventos de ciclo de sesión lo bypasean completamente.

El invariante que queremos establecer: `post-hook-event.ts` es el único canal de transporte entre Claude Code y el gateway; `AuditHookEventHandler.executeAsync` es el único punto de decisión de efectos.

## Goals / Non-Goals

**Goals:**
- Un solo tipo de hook command en `configs/hooks.json`: `post-hook-event.ts`
- `executeAsync` cubre los 14 eventos con sus efectos correspondientes
- Instalador simplificado: reconoce solo la ruta de `post-hook-event`
- Eliminar el race condition de Windows eliminando los procesos concurrentes por evento

**Non-Goals:**
- Cambiar el comportamiento visible de ningún toast (mensajes, iconos, sonidos)
- Modificar la lógica TTS o el sistema de voz
- Introducir nuevos efectos o nuevos eventos
- Migrar `notifications/cli.ts` — sigue como utilidad standalone

## Decisions

### Decisión 1: Extender `ClaudeHookEvent` con campos de herramienta en vez de pasar raw payload

**Alternativa considerada**: inyectar el payload wire crudo (`Record<string, unknown>`) al handler y reutilizar los formatters de `hook-payload-notification-message.ts` directamente con él.

**Elegida**: agregar `toolName?: string`, `toolInput?: Record<string, unknown>` y `prompt?: string` a `ClaudeHookEvent`, mapeados desde `tool_name`, `tool_input` y `prompt` en `parseHookEvent`.

**Razón**: mantener la capa de dominio como la única interfaz del handler. El handler no debe depender de la forma wire (snake_case) — esa transformación ya existe en `parseHookEvent`. Los formatters de `hook-payload-notification-message.ts` toman `Record<string, unknown>`; el handler puede construir el objeto de llamada a partir de los campos tipados del evento.

### Decisión 2: Eliminar los 4 scripts en lugar de deprecarlos gradualmente

**Alternativa**: mantener los scripts como stubs que simplemente hacen POST /hooks y delegar, sin desaparecerlos de golpe.

**Elegida**: eliminación directa.

**Razón**: los scripts son el problema. Cualquier versión stub que haga POST /hooks es funcionalmente equivalente a `post-hook-event.ts`. Mantenerlos como stubs multiplica archivos sin valor. La migración es instantánea: el instalador re-aplica `hooks.json` con `npm run setup:install -- --hooks`.

### Decisión 3: `emitToast` del handler sigue con branding genérico (no per-event)

**Alternativa**: extender `emitToast` para resolver icono y sonido por tipo de evento desde `EVENT_NOTIFICATION_PROFILES`.

**Elegida**: mantener `emitToast` sin cambios; solo se agrega la llamada desde nuevos casos del switch.

**Razón**: el toast del Stop (Change A) ya usa branding genérico. Añadir resolución per-event en este cambio excede el alcance. Es una mejora separable identificable como deuda técnica.

### Decisión 4: `HookEventName` incorpora los 5 eventos de ciclo de sesión como literales

Los 5 eventos (`SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`) se añaden explícitamente a la unión de `HookEventName`. El `default` del switch existente en `executeAsync` ya capturaba cualquier `string`; agregar los literales al tipo mejora el autocompletado y permite exhaustive-check futuro.

## Risks / Trade-offs

- **Latencia en PermissionRequest**: al ir por `post-hook-event.ts` → `POST /hooks`, el toast tiene un round-trip extra (~1 ms loopback) respecto al `cli.ts` directo anterior. → El gateway responde 202 antes de emitir el toast; la latencia perceptible para el usuario es nula.
- **SessionStart/End sin audit**: el gateway recibe los eventos pero no los persiste en ningún workflow (no hay workflow abierto en SessionStart). Los eventos se procesan solo para el toast. → Es el comportamiento correcto; el audit de sesión sigue basado en UserPromptSubmit/Stop.
- **Doble despacho eliminado en PostToolUse**: con el matcher duplicado `*` + `TaskUpdate` eliminado, el gateway recibe PostToolUse una sola vez. La lógica de TaskUpdate toast se mueve al gateway con `event.toolName === 'TaskUpdate' && event.toolInput?.status === 'in_progress'`. → Ninguna pérdida funcional; el filtro es equivalente al `matcher: "TaskUpdate"` de hooks.json.

## Migration Plan

1. Aplicar los cambios de código (hook.types.ts, audit-hook-event.handler.ts, features/hooks.ts, hooks.json).
2. Eliminar los 4 scripts obsoletos.
3. Re-instalar los hooks en la máquina de desarrollo: `npm run setup:install -- --hooks --force`.
4. Verificar con sesión headless (`claude -p "Di hola" --model haiku`): toasts y TTS correctos.
5. Rollback si necesario: `git revert` + `npm run setup:install -- --hooks --force`.

## Open Questions

(ninguna — el diseño está completamente especificado)
