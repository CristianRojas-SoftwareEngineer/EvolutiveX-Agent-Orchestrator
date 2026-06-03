## Contexto

El servicio de notificaciones ya resuelve imagen y sonido por `--event-type`. En Windows, SnoreToast usa `ToastImageAndText02` (`-p`) para la imagen de cuerpo y tokens `Notification.*` para audio. El repo mantiene assets en rutas que pueden contener caracteres no-ASCII; `%LOCALAPPDATA%\AIAssistant\` es caché ASCII-only.

## Modelo de dos capas de assets

| Capa | Ubicación | Formato típico | Consumido por |
|------|-----------|----------------|---------------|
| **Versionado (fuente de verdad)** | `assets/notifications/events/*.png`, `ai-assistant.png` | 256×256, RGBA, fondo transparente permitido, curación manual o externa | CLI vía `resolveEventImagePath` → SnoreToast `-p` |
| **Salida de tooling (opcional)** | Mismos paths si se ejecuta un pipeline | 128×128, opaco `#fefefe`, sin alpha | Solo si el operador invoca `writeAllEventNotificationImages` o `reframeAllEventNotificationImages` |

Los pipelines en `toast-body-image-spec.ts` y `event-notification-image.ts` **no** están cableados al CLI ni a `register.ts`. Ejecutarlos **sobrescribe** los PNG versionados.

## Sonidos: catálogo vs runtime win32

- **Catálogo** (`event-notification-profile.ts`): tokens BurntToast (`IM`, `SMS`, `LoopingAlarm7`, …) por paridad con `claude-notifications-enhanced.ps1`.
- **CLI → adaptador:** `resolveNotificationSound` + `toWin32NotificationSound()` producen `Notification.IM`, `Notification.SMS`, `Notification.Looping.Alarm7`, etc., porque `node-notifier`/`mapToWin8` sustituye strings sin prefijo `Notification.` por `Notification.Default`.

## Sincronización de imágenes

1. **`register --install`:** copia idempotente por SHA-256 de `events/*.png` y assets globales al cache estable.
2. **`resolveEventImagePath` (runtime):** en win32, si existe PNG en repo y el hash difiere del cache, `syncEventImageFromRepoIfStale` recopia antes de devolver la ruta estable.

Orden efectivo: comprobar repo → sync si hace falta → preferir ruta estable si existe.

`repoEventsDirProvider` en `event-image-paths.ts` existe solo para tests ESM (sustituir directorio repo); no es API de producto.

## Transparencia y SnoreToast

PNG con alpha en runtime es válido si el resultado visual en el Action Center es aceptable (validado en smoke test). Los pipelines opacos 128×128 son remedio opcional para letterboxing o fondos heterogéneos, no requisito del repo actual.

## Header vs cuerpo

- **Header del toast:** `ai-assistant.ico` / `ai-assistant.png` globales (registro AUMID + `.lnk`).
- **Cuerpo (`-p`):** PNG por evento del catálogo.

Si solo se actualiza `ai-assistant.png`, conviene regenerar `ai-assistant.ico` para paridad del icono de cabecera (ver `docs/notifications.md`).

## Decisiones

- No reabrir el archive `add-notification-event-profiles`; este change documenta el comportamiento actual.
- No fusionar tooling de imagen en el CLI: mantener opt-in explícito vía scripts documentados.
