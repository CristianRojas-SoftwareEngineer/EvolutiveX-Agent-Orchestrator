## Why

Los changes `add-notifications-branding` y `add-notification-event-profiles` establecieron branding (AUMID + icono global), catálogo tipado de **imagen y sonido** por `--event-type`, y cableado de 11 hooks en `.claude/settings.json`. Eso resolvió la capa visual/auditiva del toast.

Queda un hueco funcional: el **copy** (título y mensaje) no sigue el mismo modelo centralizado. Hoy:

- Varios hooks repiten `--message "…"` en settings (duplicación, `.claude/` en gitignore).
- Los hooks con `--stdin-json` asumen contexto rico (`error`, `tool_name`, `prompt`, `last_assistant_message`), pero `cli.ts` solo concatena `hook_event_name` y `session_id` (`deriveMessageFromPayload`).
- `docs/notifications.md` describe un comportamiento que el código no implementa.

El legacy en `C:\AI\src\notifications\builders.ts` (paridad con `claude-notifications-enhanced.ps1`) ya demostró el valor de **mensajes dinámicos** para `StopFailure`, `PermissionRequest` y preguntas interactivas. Este change **extiende** el servicio a una versión más completa: catálogo para copy estático + formatters de payload para copy dinámico, sin reintroducir JSON externo ni PowerShell.

## What Changes

- Se amplía `EventNotificationProfile` con `title` y `message` (copy estático por las 11 claves del catálogo).
- Se introduce `hook-payload-notification-message.ts` con formatters **completos** (paridad `builders.ts` + extensiones `UserPromptSubmit` y `Stop`) registrados por `eventKey`.
- Se redefine `buildEvent()` en `cli.ts`:
  - **Título:** override `--title` → siempre `profile.title` del catálogo (nunca `hook_event_name` como título por defecto).
  - **Mensaje:** override `--message` → formatter si `--stdin-json` y hay resultado → `profile.message` del catálogo.
- Se elimina `deriveMessageFromPayload` como comportamiento por defecto con `--stdin-json`.
- Se actualiza la spec `desktop-notifications-service`: el catálogo cubre copy estático; los formatters cubren copy dinámico; se aclara la relación con la exclusión histórica de `builders.ts` (v1 = sin config JSON; v2 = formatters tipados en repo).
- Tests unitarios por formatter y por precedencia en `buildEvent`.
- `docs/notifications.md`: modelo de dos capas, tabla de formatters, alineación con `settings.json` (incl. `Stop` con `--stdin-json`).

**Hooks (`.claude/settings.json`):** se simplifican comandos quitando `--message` redundante donde el catálogo ya define el cuerpo; se mantienen `--stdin-json` en los eventos con formatter.

## Capabilities

### New Capabilities

- Ninguna (extensión del spec existente `desktop-notifications-service`).

### Modified Capabilities

- `desktop-notifications-service`: copy estático en catálogo; resolución de mensaje desde payload de hook; precedencia en CLI; inventario de módulos; escenarios de `--stdin-json` actualizados.

## Relación con changes anteriores (no contradicción, extensión)

| Change archivado | Qué aportó | Cómo se extiende aquí |
|------------------|------------|------------------------|
| `claude-n1-migrate-notifications-service` | Puerto mínimo, CLI, sin `C:\AI\` | Se mantiene; solo crece el composition root (`cli.ts`). |
| `add-notifications-branding` | `appId`, icono global, `register.ts` | Sin cambios en contrato del puerto. |
| `add-notification-event-profiles` | Catálogo `image` + `sound`; «no `builders.ts`» | Se **reinterpreta**: el catálogo sustituyó config **externa** y builders como **sustituto de imagen/sonido**, no la derivación de mensaje desde stdin. Se añaden `title`/`message` al mismo catálogo. |
| `align-notification-docs-specs` | WinRT, assets, inventario helpers | Compatible; este change actualiza la sección de copy en `docs/notifications.md`. |

La frase histórica *«mensajes ya vienen de flags/stdin»* en el diseño de perfiles era válida para **v1 mínima**; este change formaliza **v2 de copy** dentro del mismo servicio.

## No objetivos

- `notifications-config.json`, `config.ts` ni carga de JSON externo.
- Archivo `builders.ts` (nombre reservado al legacy); el módulo nuevo usa nombre distinto (`hook-payload-notification-message.ts`).
- Cambiar sonidos, rutas de imagen, `register.ts`, ni el adaptador más allá de recibir `title`/`message` ya ensamblados.
- Throttling o dedupe de `TaskCreated` / `TaskCompleted`.
- Eliminar `C:\AI\` del disco del usuario (sigue fuera de scope del repo).
- Modo «solo título dinámico» o formatters parciales sin preview de `tool_input` / `last_assistant_message` (el usuario eligió **formatter completo**).

## Impact

- **PKA:** capa 2 (`src/2-services/notifications/`), composition root `cli.ts`; sin cambios en dominio gateway salvo reutilización opcional de tipos de `hook.types.ts` para documentación.
- **Archivos nuevos:** `hook-payload-notification-message.ts`, tests asociados.
- **Archivos modificados:** `event-notification-profile.ts`, `cli.ts`, `docs/notifications.md`, `.claude/settings.json` (simplificación de comandos).
- **Verificación:** `npm run test:quick`; smoke manual Windows en `StopFailure`, `PermissionRequest`, `PreToolUse` (AskUserQuestion).

## Decisiones de producto (cerradas)

1. **Título** siempre del catálogo (salvo `--title` explícito).
2. **Mensaje dinámico** vía formatters completos (truncado, mapa de errores, previews de tool/pregunta/prompt).
3. **Alcance:** los cinco `eventKey` con `--stdin-json` en settings actuales reciben formatter desde el primer change; el resto solo copy estático del catálogo.
