## 1. Artefactos del change

- [x] 1.1 Crear `openspec/changes/align-notification-docs-specs/` (proposal, design, tasks, `.openspec.yaml`)
- [x] 1.2 Redactar delta `specs/desktop-notifications-service/spec.md`

## 2. Documentación operativa

- [x] 2.1 Reestructurar `docs/notifications.md` (assets 256 RGBA, sync, pipelines opcionales 128, advertencias, enlace a spec)
- [x] 2.2 Tabla de componentes: distinguir runtime vs mantenimiento en helpers de imagen

## 3. Spec canónica

- [x] 3.1 Fusionar delta en `openspec/specs/desktop-notifications-service/spec.md`

## 4. Verificación

- [x] 4.1 `openspec validate align-notification-docs-specs` (o revisión manual si el CLI no está disponible)
- [x] 4.2 `npm run test:quick` — 411 tests
- [x] 4.3 Checklist: doc 256 RGBA; pipelines opcionales; spec `Notification.*`; helpers opcionales; `syncEventImageFromRepoIfStale`; archive intacto
