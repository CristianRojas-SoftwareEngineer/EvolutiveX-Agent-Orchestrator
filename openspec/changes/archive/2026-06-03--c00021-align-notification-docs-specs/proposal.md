## Why

Tras restaurar mejoras de notificaciones (mapeo WinRT de sonidos, sync repo→caché por hash, helpers de imagen) y curar manualmente los PNG del repo (256×256 RGBA), la **documentación operativa** (`docs/notifications.md`) y la **spec canónica** (`openspec/specs/desktop-notifications-service/spec.md`) describían un estado distinto al código y a los assets versionados (p. ej. 128×128 opaco como norma del repo, salida `LoopingAlarm7` en win32 en lugar de `Notification.Looping.Alarm7`, inventario de archivos sin los helpers de mantenimiento).

Eso generaba riesgo de ejecutar pipelines que sobrescriben arte manual y de interpretar mal el contrato frente a los tests y al smoke test Windows ya validado.

**Trazabilidad:** este change supersede normativamente (para lectores actuales) la interpretación de **salida de sonido en win32** del archive `2026-06-03--c00019-add-notification-event-profiles`, sin modificar ese folder archivado. El catálogo sigue almacenando tokens BurntToast; el resolvedor traduce a `Notification.*` en runtime.

## What Changes

- Delta spec `desktop-notifications-service`: sonidos WinRT, `syncEventImageFromRepoIfStale`, inventario con helpers opcionales, assets 256×256 RGBA versionados, pipelines opcionales 128×128.
- `docs/notifications.md`: dos capas de assets (versionado vs tooling), advertencias de sobrescritura, enlace a la spec canónica.
- Fusión del delta en `openspec/specs/desktop-notifications-service/spec.md`.

**Sin cambios de comportamiento runtime** salvo correcciones documentales; el código staged ya implementa el comportamiento descrito.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `desktop-notifications-service`: alineación normativa y documental con la implementación actual.

## Impact

- **Capa PKA:** 2-services (documentación de módulos existentes); `docs/notifications.md`.
- **Directorios:** `openspec/changes/align-notification-docs-specs/`, `openspec/specs/desktop-notifications-service/`, `docs/`.

## No objetivos

- Regenerar o reencuadrar PNG en `assets/notifications/`.
- Editar changes en `openspec/changes/archive/`.
- Cambiar el catálogo de 11 eventos, hooks en `.claude/settings.json` o `ai-assistant.ico`.
- Commit automático (queda a criterio del usuario).
