# Tasks: add-task-in-progress-notification

## 1. Catálogo de notificaciones (capa 2-services)

- [x] 1.1 Añadir entrada `TaskInProgress` a `EVENT_NOTIFICATION_PROFILES` en `src/2-services/notifications/event-notification-profile.ts` con `message: 'Tarea iniciada'`, `image: 'task-in-progress.png'`, `level: 'activity'`, `sound: { win32: 'IM', darwin: 'Ping', linux: true }` (paridad con `SubagentStart`).
- [x] 1.2 Verificar que `NOTIFICATION_EVENT_KEYS` tiene 12 entradas tras el cambio con `node -e "import('./src/2-services/notifications/event-notification-profile.ts').then(m => console.log(m.NOTIFICATION_EVENT_KEYS.length))"`.

## 2. Formatter dinámico (capa 2-services)

- [x] 2.1 Añadir `formatTaskInProgressMessage(payload: Record<string, unknown>): string | null` en `src/2-services/notifications/hook-payload-notification-message.ts` con la lógica: leer `subject` desde `payload.tool_input` (fallback `payload.subject`), aplicar `normalizeWhitespace` + `truncate(..., MAX_TOOL_INPUT_PREVIEW_LEN)`, anteponer `"Tarea iniciada: "`, devolver `null` si no hay subject.
- [x] 2.2 Registrar `TaskInProgress: formatTaskInProgressMessage` en `HOOK_PAYLOAD_MESSAGE_FORMATTERS`.
- [x] 2.3 Verificar typecheck: `npm run test:quick` debe pasar sin errores en el módulo de notificaciones.

## 3. Tests del formatter (capa 2-services)

- [x] 3.1 Crear/ampliar `tests/2-services/notifications/hook-payload-notification-message.test.ts` con casos:
  - `resolveHookNotificationMessage('TaskInProgress', { tool_input: { subject: 'X' } })` → contiene `"Tarea iniciada: X"`.
  - Sin `subject` → devuelve `null`.
  - `subject` con mojibake (`ConfiguraciÃ³n`) → devuelve string con `"Configuración"` reparado.
  - `subject` > 120 chars → fragmento ≤ 121 chars con sufijo `…` (truncate añade 1 char al límite).
- [x] 3.2 Ejecutar `npm run test:quick` y confirmar que los nuevos casos pasan. ✓ 592 tests passing.

## 4. Relay scripting (capa scripting)

- [x] 4.1 Crear `scripting/task-in-progress-hook-ux.ts` — implementado con `DesktopNotificationAdapter` directamente (más idiomático que `spawn`; mismo patrón que `pre-tool-use-hook-ux.ts`): lee stdin, parsea JSON defensivo, filtra por `tool_input.status === 'in_progress'`, llama `buildEvent` + `adapter.notify()`, exit 0 en todos los paths.
- [x] 4.2 Verificar typecheck del script: `npm run test:quick` pasa sin errores.
- [x] 4.3 Crear `tests/scripting/task-in-progress-hook-ux.test.ts` con 6 casos: in_progress notifica; completed/deleted/sin status → exit 0 silencioso; JSON inválido → stderr + exit 0; stdin vacío → exit 0.
- [x] 4.4 Ejecutar `npm run test` y confirmar que los tests pasan. ✓ 592 tests passing.

## 5. Plantilla canónica de hooks (configuración)

- [x] 5.1 Editar `configs/hooks.json` para añadir la entrada bajo `hooks.PostToolUse`:
  ```json
  {
    "matcher": "TaskUpdate",
    "hooks": [
      {
        "type": "command",
        "command": "npx --prefix \"${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}\" tsx \"${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/task-in-progress-hook-ux.ts\""
      }
    ]
  }
  ```
- [x] 5.2 Verificar que la entrada existente `hooks.PostToolUse[matcher="*"]` se preserva intacta en el mismo array. ✓ Confirmado por test hooks-canonical-encoding.

## 6. Instalador de hooks (capa scripting)

- [x] 6.1 Añadir `task-in-progress-hook-ux` a `isScpManagedCommand()` en `scripting/features/hooks.ts` y a la lista `files` en `validateScpRoot()`.
- [x] 6.2 Actualizar el JSDoc del módulo hooks.ts con la mención del nuevo script (lista de 14 entradas en el comentario).
- [x] 6.3 Añadir test en `tests/scripting/features/hooks.test.ts`: `isScpManagedCommand` detecta `task-in-progress-hook-ux`. Añadir test en `tests/scripting/hooks-canonical-encoding.test.ts`: PostToolUse contiene matchers `*` y `TaskUpdate` disjuntos.
- [x] 6.4 Fixture `tests/scripting/helpers/proxy-root-fixture.ts` actualizado para incluir `scripting/task-in-progress-hook-ux.ts`. ✓ Tests del setup pasan.

## 7. Asset PNG

- [x] 7.1 Aprobación recibida del usuario: PNG creado con overlay `badge-plus-orange` (círculo cian, cuadrado + símbolo naranja `#FF8C00`, paridad visual con `task-created.png` excepto color).
- [x] 7.2 `assets/notifications/events/task-in-progress.png` creado (16 KB). Overlay `badge-plus-orange` añadido a `event-image-overlays.ts`; mapa `EVENT_IMAGE_OVERLAY_BY_KEY` actualizado en `event-notification-image.ts`.
- [x] 7.3 `npm run notifications:register -- --install` ejecutado. PNG instalado en `%LOCALAPPDATA%\AIAssistant\events\task-in-progress.png`.

## 8. Documentación (capa docs)

- [ ] 8.1 Actualizar `docs/notifications.md` con la nueva entrada UX: añadir fila `TaskInProgress` en la tabla de `--stdin-json` por entrada, indicando que es `PostToolUse[matcher=TaskUpdate]` y que filtra por `status === "in_progress"`.
- [ ] 8.2 Actualizar el conteo de "5 entradas UX" → "6 entradas UX" en la sección relevante.
- [ ] 8.3 (Opcional) Añadir nota breve en `docs/gateway-architecture.md` sobre el relay de notificaciones de tareas, si la sección ya cubre otros relays (gateway-hook-notify, pre-tool-use-hook-ux).

## 9. Verificación end-to-end

- [x] 9.1 `npm run test:quick` pasa sin warnings ni errores. ✓ 592 tests passing.
- [ ] 9.2 `npm run test` debe pasar todos los tests unit + integración.
- [ ] 9.3 Smoke test manual en una sesión de Claude Code: ejecutar `TaskUpdate(in_progress)` → confirmar toast con `message: "Tarea iniciada: <subject>"` o fallback `"Tarea iniciada"`. Ejecutar `TaskUpdate(completed)` → confirmar que NO aparece un segundo toast (solo el de `TaskCompleted`).
- [x] 9.4 `NOTIFICATION_EVENT_KEYS` tiene 12 entradas. ✓ Confirmado por test de profile.
- [x] 9.5 `task-in-progress.png` instalado en `%LOCALAPPDATA%\AIAssistant\events\`. ✓ Confirmado.

## 10. Archive OpenSpec

- [ ] 10.1 Activar `openspec-verify` y confirmar que el change pasa las 3 dimensiones (Completeness, Correctness, Coherence).
- [ ] 10.2 Activar `openspec-archive` para fusionar las delta specs a `openspec/specs/` y mover el change a `openspec/changes/archive/`.
- [ ] 10.3 Sincronizar la documentación que haya quedado stale (revisar `docs/notifications.md` y `docs/gateway-architecture.md`).
- [ ] 10.4 Crear commit con conventional-commits: `feat(notifications): notificación al iniciar tareas del TaskList` con los 4 bloques en español (Motivación, Propósito, Objetivos, Resumen de cambios).
