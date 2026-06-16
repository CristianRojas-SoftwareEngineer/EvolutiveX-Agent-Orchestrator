## Why

El hook `Stop` emite actualmente dos notificaciones de escritorio separadas: una señal inmediata de fin de turno ("Tu turno — El asistente terminó") y un segundo toast con un resumen generado por Haiku a partir únicamente del campo `last_assistant_message`. Este diseño de doble notificación es ruido de UX, y el contexto limitado produce resúmenes superficiales. El propósito del hook debería ser asistir la continuidad conversacional, no registrar un evento del sistema.

## What Changes

- **Se elimina** `notifyStopTurnFinished()` y el primer toast de señal de estado.
- **Se añade** `extractWorkflowContext(transcriptPath)`: lee el JSONL del transcript de Claude Code y extrae el workflow actual (desde el último mensaje `user`) más el turno previo (mensaje `user` + último mensaje `assistant`) para dar contexto de continuidad entre workflows.
- **Se reemplaza** el prompt de Haiku: en lugar de un resumen simple de 2-4 frases, genera un *mensaje de continuidad* con tres dimensiones: qué se completó, qué está abierto o ambiguo, y la dirección sugerida para el siguiente prompt.
- **Se aumenta** `max_tokens` de 300 a 600 y se elimina el tope de generación de 320 chars: el texto completo se genera sin truncar; el truncado ocurre solo en el display del toast.
- **Se añade** `writeContinuityMessage(text, projectDir)`: persiste el texto completo en `sessions/.last-continuity-message.txt` para consumo futuro por el sistema TTS (Fase 2).
- **Se emite** un único toast con título `"Stop"` y cuerpo = preview truncado del mensaje de continuidad (~250 chars).
- Se renombra internamente `runStopWorkSummaryNotification` → `runContinuityNotification` para reflejar el propósito ampliado.

## Capabilities

### New Capabilities

- `stop-hook-continuity-message`: Generación de mensajes de continuidad asistida en el hook `Stop`. Cubre la extracción de contexto del transcript (workflow actual + turno previo), el nuevo prompt de Haiku con tres dimensiones, la persistencia del texto completo en disco, y el toast único con preview truncado.

### Modified Capabilities

- `desktop-notifications-service`: La spec del relay `Stop` desde scripting cambia: de doble toast (señal + resumen) a toast único (mensaje de continuidad). Se eliminan los requirements sobre `notifyStopTurnFinished` y el primer toast de catálogo.
- `hooks-lifecycle-correlation`: El contrato del hook `Stop` en el relay scripting cambia: el orquestador `stop-hook-ux.ts` ya no llama `notifyStopTurnFinished`, y el paso de notificación produce un único toast con contexto ampliado.

## Impact

- **Capas PKA afectadas**: scripting/ (fuera de capas PKA formales), capa 2 (`src/2-services/notifications/`) como consumidor del adaptador de notificaciones.
- **Archivos modificados**:
  - `scripting/stop-hook-ux.ts` — eliminar llamada a `notifyStopTurnFinished`, pasar `CLAUDE_PROJECT_DIR` al orquestador.
  - `scripting/stop-work-summary-notification.ts` — nueva función `extractWorkflowContext`, nuevo prompt, `writeContinuityMessage`, renombre a `runContinuityNotification`, ajuste de `max_tokens` y límites.
  - `tests/scripting/stop-hook-ux.test.ts` — actualizar mocks.
  - `tests/scripting/stop-work-summary-notification.test.ts` — nuevos tests para `extractWorkflowContext` y `writeContinuityMessage`.
- **Documentación**: `docs/notifications.md` § Hook Stop, `README.md` § Configuración de hooks.
- **OpenSpec specs**: delta en `desktop-notifications-service` y `hooks-lifecycle-correlation`.
- **No se modifican**: el gateway, el endpoint `POST /hooks`, el CLI de notificaciones `src/2-services/notifications/cli.ts`, ni la lógica de branding/icono.
- **Dependencia futura**: `sessions/.last-continuity-message.txt` es el punto de integración con el sistema TTS (Fase 2; fuera del scope de este cambio).
