## MODIFIED Requirements

### Requirement: Validación de raíz del proxy por feature

En modo install, el script SHALL validar únicamente las features seleccionadas que requieren archivos en disco. Si la validación de alguna feature falla, el script SHALL terminar con código de salida distinto de cero sin escribir en `settings.json`.

| Feature       | Validación requerida                                    |
|---------------|---------------------------------------------------------|
| statusline    | `scripting/router-status.ts` y `routing/providers/` existen |
| voice         | ninguna                                                 |
| hooks         | `configs/hooks.json`, `scripting/post-hook-event.ts`, `scripting/stop-hook-ux.ts`, `scripting/gateway-hook-notify.ts`, `scripting/pre-tool-use-hook-ux.ts` y `src/2-services/notifications/cli.ts` existen |

#### Scenario: Validación hooks exige los dos relays de stdin único

- **GIVEN** `--root` no contiene `scripting/gateway-hook-notify.ts`
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** el script SHALL terminar con código de salida distinto de cero
- **AND** SHALL no modificar `settings.json`

---

### Requirement: Indivisibilidad de --hooks

El flag `--hooks` SHALL instalar el conjunto indivisible de las **13 claves** de hooks declaradas en `configs/hooks.json`. Este conjunto cubre:

- **Gateway** (`scripting/post-hook-event.ts` y relays que integran `POST /hooks`).
- **Relays stdin único** (`stop-hook-ux.ts`, `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`).
- **Notificaciones CLI** (`src/2-services/notifications/cli.ts`) para entradas que no usan relay compuesto.

#### Scenario: --hooks instala relays y CLI según plantilla

- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** `settings.hooks` SHALL reflejar `configs/hooks.json` resuelto
- **AND** SHALL incluir `gateway-hook-notify` para `UserPromptSubmit` y `StopFailure`
- **AND** SHALL incluir `pre-tool-use-hook-ux` para `PreToolUse` matcher `*`
