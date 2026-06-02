# claude-n1-migrate-notifications-service

> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** n1 (N)

## Why

El sistema de notificaciones de escritorio que Claude Code invoca desde `.claude/settings.json` vive hoy en `C:\AI\claude-code-notifications.ts` (más `C:\AI\src\notifications\*`, `C:\AI\notifications-config.json` y un `package.json` externo con `commander` y `node-notifier`). Está fuera del repo, sin tests, sin integración PKA, y sujeto a deriva de versiones. Migrar la primera versión al repositorio —bajo `src/2-services/notifications/`, con un puerto `INotificationService` (capa 1) y un adaptador concreto `DesktopNotificationAdapter` (capa 2)— elimina esa deriva y deja el camino listo para que N2 reapunte los hooks al entry point interno.

## What Changes

- Crea `src/2-services/notifications/` con cuatro archivos (`INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`) más un entry point CLI (`cli.ts`). El contrato del puerto se reduce a un único método `notify(event)` con `title`, `message`, `sound?` y `silent?`; el adaptador delega en `node-notifier.notify()` sin personalización (sin `icon`, sin `SnoreToast`, sin `.lnk`, sin AUMID, sin `heroImage`, sin `defaultIcon`, sin `brandTitle`).
- Añade `node-notifier` y `commander` como `dependencies` en `package.json` (hoy están en `devDependencies` por la presencia de `commander` en `scripting/`; el `node-notifier` es nuevo).
- Crea `tests/2-services/notifications/desktop-notification.adapter.test.ts` con `node-notifier` mockeado, verificando que el adaptador NO se invoca con `icon`.
- Crea `docs/notifications.md` con la API del servicio, el entry point CLI, el contrato del puerto, y la lista explícita de exclusiones de v1 (sin personalización, sin `JSON` externo, sin dependencias Windows-specific).
- Crea la spec canónica `openspec/specs/desktop-notifications-service/spec.md` con el contrato del puerto y las exclusiones como deltas `ADDED`.
- `C:\AI\claude-code-notifications.ts` y su `package.json` externo quedan intactos durante N1; la retirada efectiva se difiere a N2 (marcado `@deprecated`) y a un change posterior fuera del scope de este roadmap (por vivir fuera del repo).
- Actualiza `README.md` con una nueva sección "Notifications" que referencie `docs/notifications.md` y describa el entry point CLI.

## Capabilities

### New Capabilities

- `desktop-notifications-service`: contrato del puerto `INotificationService` y de su adaptador `DesktopNotificationAdapter` (capa 1 + capa 2 PKA), más el entry point CLI cross-platform (capa 4).

### Modified Capabilities

- _(ninguna — `hooks-lifecycle-correlation` no se ve afectada en N1; el cambio de contrato llega en N2 cuando se reapunten los hooks al entry point del repo)._

## Impact

- **PKA**: capas 1 (puerto `INotificationService` con tipos puros) → 2 (adaptador `DesktopNotificationAdapter`, lógica de `node-notifier`) → 4 (composition root + entry point CLI). Capas 3 (operations) y 5 (user-interfaces) no se tocan en N1.
- **Directorios afectados**: `src/2-services/notifications/` (nuevo), `tests/2-services/notifications/` (nuevo), `docs/notifications.md` (nuevo), `openspec/specs/desktop-notifications-service/` (nuevo), `README.md` (nueva sección "Notifications"), `package.json` (añade `node-notifier` y mueve `commander` a `dependencies`).
- **Capa externa intacta**: `.claude/settings.json` no se modifica en N1 (los hooks siguen apuntando a `C:\AI\claude-code-notifications.ts`); el reapuntamiento queda para N2.
- **Exclusiones explícitas en v1**: sin `config.ts`, sin `builders.ts`, sin `sound/`, sin `windows-toast.ts`, sin `JSON` externo, sin registro SnoreToast/AUMID, sin `.lnk`, sin `heroImage`, sin `defaultIcon`, sin `brandTitle`, sin perfiles de sonido OS-specific. Estas exclusiones se documentan en `docs/notifications.md` y en la spec canónica, y son prerrequisito de N2 (un reapuntamiento a un servicio "completo" reintroduciría deuda).
- **No objetivos**: no se elimina `C:\AI\claude-code-notifications.ts`; no se crea un `INotificationService` con más métodos que `notify(event)`; no se introducen adaptadores alternativos (Slack, email); no se añade un composition root cableado al servidor Fastify (N1 entrega solo la librería y el CLI standalone; el wiring contra el proxy se difiere a N2).
