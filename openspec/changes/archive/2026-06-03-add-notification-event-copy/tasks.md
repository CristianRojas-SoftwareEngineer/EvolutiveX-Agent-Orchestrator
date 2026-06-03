# Tasks: add-notification-event-copy

## 1. Catálogo — copy estático

- [x] 1.1 Ampliar `EventNotificationProfile` con `title: string` y `message: string` en `event-notification-profile.ts`.
- [x] 1.2 Añadir `title` y `message` a las 11 entradas de `EVENT_NOTIFICATION_PROFILES` según tabla en `design.md` (marca «AI Assistant» en títulos).
- [x] 1.3 Actualizar `tests/2-services/notifications/event-notification-profile.test.ts` para assert de `title`/`message` en al menos `Stop`, `StopFailure`, `SessionStart`.
  - _Criterio: `npm run test:quick` verde._

## 2. Formatters de payload

- [x] 2.1 Crear `src/2-services/notifications/hook-payload-notification-message.ts` con constantes de truncado, mapa `STOP_FAILURE_ERROR_MAP`, helpers `truncate` / `normalizeWhitespace`, y formatters (paridad `C:\AI\src\notifications\builders.ts` + `UserPromptSubmit`/`Stop`).
- [x] 2.2 Exportar `resolveHookNotificationMessage(eventKey, payload)` con registro para los cinco `eventKey` del design.
- [x] 2.3 Crear `tests/2-services/notifications/hook-payload-notification-message.test.ts` con fixtures JSON: `StopFailure` (rate_limit + mensaje), `PermissionRequest` (command), `PreToolUse` (2 questions), `UserPromptSubmit` (prompt), `Stop` (last_assistant_message), casos `null`/vacío.
  - _Criterio: `npm run test:quick` verde._

## 3. CLI — precedencia en `buildEvent`

- [x] 3.1 Modificar `cli.ts`: título según D1; mensaje según D2; eliminar `deriveMessageFromPayload`.
- [x] 3.2 Ampliar `tests/2-services/notifications/cli.test.ts`: título desde catálogo con `--stdin-json`; mensaje dinámico `StopFailure`; fallback a `profile.message`; override `--message`; `--title` override.
  - _Criterio: `npm run test:quick` verde._

## 4. Hooks y documentación

- [x] 4.1 Simplificar `.claude/settings.json`: quitar `--message` donde el catálogo define el cuerpo; mantener `--stdin-json` en los cinco eventos con formatter.
- [x] 4.2 Actualizar `docs/notifications.md`: modelo dos capas (catálogo + formatters); tabla de formatters; corregir fila `Stop` (sí usa `--stdin-json`); quitar `deriveMessageFromPayload` de ejemplos; nota de privacidad (previews en Action Center).
- [x] 4.3 Añadir `hook-payload-notification-message.ts` al inventario de componentes en `docs/notifications.md`.
  - _Criterio: lectura humana coherente con spec delta; grep `deriveMessageFromPayload` en docs → 0._

## 5. Verificación manual (Windows)

- [x] 5.1 Smoke: `StopFailure` con payload de prueba (error + `last_assistant_message`) — título «AI Assistant», cuerpo con error legible.
- [x] 5.2 Smoke: `PermissionRequest` — cuerpo con nombre de herramienta.
- [x] 5.3 Smoke: `SessionStart` sin stdin — cuerpo «Sesión iniciada» sin flags `--message`.
  - _Criterio: observación visual aceptable; documentar en PR/commit si algún campo no viene en payload real de Claude Code._

## 6. Cierre OpenSpec

- [x] 6.1 `openspec validate add-notification-event-copy` → success.
- [x] 6.2 Tras implementación: `openspec-verify` sobre el change (sin CRITICAL) antes de archive.
- [x] 6.3 `openspec-sync` o archive según flujo del usuario para fusionar delta en `openspec/specs/desktop-notifications-service/spec.md`.
