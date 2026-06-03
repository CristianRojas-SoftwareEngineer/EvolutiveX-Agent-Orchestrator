## 1. Catálogo y resolvedores

- [x] 1.1 Crear `src/2-services/notifications/event-notification-profile.ts` con `EVENT_NOTIFICATION_PROFILES` (11 claves), niveles semánticos de sonido, `win32` alineado a `C:\AI\claude-notifications-enhanced.ps1`, equivalentes `darwin`, y `linux: true` en los 11 eventos (best-effort vía `sound: true`)
- [x] 1.2 Crear `src/2-services/notifications/event-image-paths.ts` con `resolveEventImagePath(filename)` (prioridad `STABLE_EVENTS_DIR` → repo → `undefined`)
- [x] 1.3 Crear `src/2-services/notifications/resolve-notification-sound.ts` con `resolveNotificationSound(profile, platform)` (`win32`/`darwin` → string; `linux` → solo boolean, nunca tokens BurntToast)
- [x] 1.4 Añadir `STABLE_EVENTS_DIR` en `asset-paths.ts`

## 2. Tipos y adaptador

- [x] 2.1 Ampliar `NotificationEvent.sound` a `boolean | string` en `types.ts`
- [x] 2.2 Actualizar `DesktopNotificationAdapter` para reenviar `sound` string/boolean; mantener `silent → sound: false`

## 3. CLI

- [x] 3.1 Implementar `resolveEventKey(options, stdinPayload)` en `cli.ts`
- [x] 3.2 Extender `resolveBranding` para usar imagen del perfil del evento (fallback `ai-assistant.png`)
- [x] 3.3 Extender `buildEvent` para aplicar sonido del catálogo (`--silent` / `--sound` overrides según spec)
- [x] 3.4 Verificar que hooks actuales en `.claude/settings.json` no requieren cambios

## 4. Register (Windows)

- [x] 4.1 En `register.ts`, copiar `assets/notifications/events/*.png` a `%LOCALAPPDATA%\AIAssistant\events\` en `--install` (idempotente por hash, reutilizar `copyFileIfChanged`; incluir hashes de `events/` en la verificación de idempotencia de `--install`)

## 5. Tests

- [x] 5.1 Tests de `event-notification-profile.ts`: 11 claves presentes; paridad legacy `StopFailure` → `LoopingAlarm7`, `PreToolUse` → `SMS`; todos con `linux: true`
- [x] 5.2 Tests de `resolveEventImagePath` y `resolveNotificationSound` (mock `win32`, `darwin`, `linux`; verificar `StopFailure` → `true` en linux, no `'LoopingAlarm7'`)
- [x] 5.3 Actualizar `cli.test.ts`: `--event-type Stop` → icono `stop.png` y sonido según plataforma; `--silent` / `--icon` overrides
- [x] 5.4 Actualizar `desktop-notification.adapter.test.ts`: `sound: 'SMS'` reenviado a `node-notifier`
- [x] 5.5 Test de `register --install` copia directorio `events/` (mock fs)

## 6. Documentación

- [x] 6.1 Actualizar `docs/notifications.md`: sección perfiles por evento, tabla imagen + sonido por SO, paridad legacy BurntToast, consistencia semántica multiplataforma, paso `register --install` tras cambiar PNGs
- [x] 6.2 Documentar limitaciones: `LoopingAlarm7` en SnoreToast vs BurntToast legacy; Linux `sound: true` es best-effort (DE/configuración del usuario, sin timbres distintos por evento)

## 7. Verificación

- [x] 7.1 `npx openspec validate add-notification-event-profiles --strict` → válido
- [x] 7.2 `npm run test:quick` → lint, typecheck y tests verdes
- [x] 7.3 Smoke manual Windows: `Stop` (sonido `IM`), `StopFailure` (`LoopingAlarm7` o fallback), `PermissionRequest` (`SMS`) con `register --install` previo
- [x] 7.4 Smoke manual macOS (opcional): verificar nombres `darwin` (`Ping`, `Basso`, etc.)
- [x] 7.5 Smoke manual Linux (opcional): `PermissionRequest` y `StopFailure` con `sound: true`; confirmar audio si el DE tiene sonido de notificaciones habilitado
