# Spec delta: desktop-notifications-service

## MODIFIED Requirements

### Requirement: Relay `Stop` desde scripting (toast único con mensaje de continuidad)

En el proyecto Smart Code Proxy, el flujo UX del hook `Stop` SHALL delegarse en `scripting/stop-hook-ux.ts`, que importa `buildEvent` y `DesktopNotificationAdapter` desde `src/2-services/notifications/` (mismo contrato de `NotificationEvent` que el CLI).

El relay SHALL emitir **un único toast** por ejecución:

| Título | Cuerpo | Sonido |
| --- | --- | --- |
| `"Stop"` (`eventKey` sin override) | Preview truncado (≤ 250 chars) del mensaje de continuidad; si no hay mensaje generado: fallback al texto fuente truncado; si no hay texto fuente: copy del catálogo para `Stop` | Según catálogo `Stop` |

La lógica de generación del mensaje de continuidad SHALL vivir en `scripting/stop-work-summary-notification.ts` (función `runContinuityNotification`). La función `notifyStopTurnFinished()` SHALL ser eliminada. El orquestador `scripting/stop-hook-ux.ts` SHALL invocar `POST /hooks` antes del toast (ver `hooks-lifecycle-correlation`).

El texto completo del mensaje de continuidad SHALL persistirse en `sessions/.last-continuity-message.txt` antes de emitir el toast. Ver spec `stop-hook-continuity-message` para el contrato completo de generación y persistencia.

Este requirement NO modifica el contrato del CLI standalone: instalaciones globales (`install:notifications`) y otros hooks del lifecycle siguen usando `cli.ts` directamente.

#### Scenario: Toast único usa mensaje de continuidad generado

- **GIVEN** `runContinuityNotification` genera un mensaje de continuidad no vacío
- **WHEN** se construye el evento del toast vía `buildEvent({ eventType: 'Stop', message: preview, stdinJson: false })`
- **THEN** `title` SHALL ser `'Stop'`
- **AND** `message` SHALL ser el preview truncado (≤ 250 chars) del mensaje de continuidad
- **AND** el branding (`appId`, icono de perfil `Stop`) SHALL aplicarse vía `buildEvent` con `eventType: 'Stop'`

#### Scenario: Sin texto generado → fallback al texto fuente

- **GIVEN** que `generateContinuityMessage` devuelve `undefined` (sin API key o fallo)
- **AND** existe texto fuente (`last_assistant_message` o transcript)
- **WHEN** se construye el evento del toast
- **THEN** `message` SHALL ser `fallbackSummary(assistantText)` (texto normalizado truncado)
- **AND** `title` SHALL ser `'Stop'`

#### Scenario: Sin texto fuente → copy del catálogo

- **GIVEN** que no hay texto fuente disponible (stdin vacío, sin `last_assistant_message`, sin transcript legible)
- **WHEN** se construye el evento del toast
- **THEN** `message` SHALL ser el copy del catálogo para `Stop` («Tu turno — El asistente terminó. Escribe tu siguiente mensaje.»)
- **AND** `title` SHALL ser `'Stop'`

#### Scenario: CLI con payload inválido → error en stderr y exit 1

- **GIVEN** `no-json` en stdin con `--stdin-json`
- **WHEN** se invoca el CLI
- **THEN** SHALL escribirse un mensaje de error en `stderr`
- **AND** SHALL terminar con código de salida 1

#### Scenario: CLI sin flags de branding aplica defaults

- **GIVEN** el CLI entry point del repo
- **AND** invocación sin `--app-id` ni `--icon`
- **AND** el archivo `assets/notifications/ai-assistant.png` existe en disco
- **WHEN** se invoca el CLI con flags requeridos (`--event-type Stop --message "Test"`)
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'AIAssistant.Proxy'`
- **AND** SHALL contener `icon: <ruta absoluta al .png>` resuelta con `path.resolve` desde `import.meta.url`

#### Scenario: CLI con `--app-id` explícito override el default

- **GIVEN** el CLI entry point del repo
- **WHEN** se invoca con `--app-id "Custom.Id" --event-type Stop --message "Test"`
- **THEN** el evento pasado al adaptador SHALL contener `appId: 'Custom.Id'`

## REMOVED Requirements

### Requirement: (escenarios obsoletos del doble toast)

**Reason**: El relay `Stop` emite ahora un único toast con mensaje de continuidad. Los siguientes escenarios del requirement anterior quedan reemplazados por los nuevos en la versión MODIFIED:
- «Primer toast Stop usa catálogo sin `--stdin-json`» — eliminado; ya no existe un primer toast de señal de estado separado.
- «Segundo toast usa título de resumen y mensaje generado» — eliminado; el único toast usa título `"Stop"`, no `"Resumen del trabajo"`.
- «Relay Stop no sustituye formatter CLI con `--stdin-json`» — eliminado; la distinción entre formatter CLI y relay ya no aplica al doble toast.

**Migration**: El comportamiento equivalente está cubierto por los nuevos escenarios del requirement MODIFIED «Relay `Stop` desde scripting (toast único con mensaje de continuidad)».
