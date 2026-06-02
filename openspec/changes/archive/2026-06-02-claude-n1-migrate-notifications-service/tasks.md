# claude-n1-migrate-notifications-service — tasks

## 1. Capa 1 — tipos y puerto

- [ ] 1.1 Crear `src/2-services/notifications/types.ts` con `NotificationEvent` (4 campos: `title`, `message`, `sound?`, `silent?`) y `EventType` (unión de los 8 nombres del lifecycle, igual a `HookEventName` de la spec canónica `hooks-lifecycle-correlation`).
  - _Criterio: el archivo compila con `npm run typecheck` sin warnings_
  - _Criterio: `NotificationEvent` no expone `icon`, `image`, `appId`, `subtitle`, `category`, `urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, `heroImage`_
- [ ] 1.2 Crear `src/2-services/notifications/INotificationService.ts` con la interfaz del puerto (un único método público `notify(event: NotificationEvent): Promise<void> | void`).
  - _Criterio: el archivo no importa `node-notifier`, ni `fs`, ni `os`, ni `path`_
  - _Criterio: el archivo no accede a `C:\AI\`_

## 2. Capa 2 — adaptador y exports

- [ ] 2.1 Añadir `node-notifier` como `dependency` y promover `commander` de `devDependencies` a `dependencies` en `package.json`.
  - _Criterio: `npm install` resuelve ambas dependencias sin conflictos_
  - _Criterio: `commander` ya no aparece en `devDependencies`_
- [ ] 2.2 Crear `src/2-services/notifications/DesktopNotificationAdapter.ts` que implementa `INotificationService` y delega en `node-notifier.notify()` con el subset acordado (`title`, `message`, `sound?`, `wait: false`); traduce `silent: true` a `sound: false`.
  - _Criterio: el archivo implementa `INotificationService`_
  - _Criterio: el adaptador envuelve la llamada en una `Promise` que resuelve en `onFulfilled` y rechaza en `onRejected` de `node-notifier`_
  - _Criterio: ningún literal `icon`, `contentImage`, `appId`, `SnoreToast`, `.lnk`, `AUMID`, `heroImage`, `defaultIcon`, `brandTitle`, `urgency` aparece en el código_
- [ ] 2.3 Crear `src/2-services/notifications/index.ts` con los `export` públicos: `INotificationService`, `DesktopNotificationAdapter`, `NotificationEvent`, `EventType`.
  - _Criterio: `import { INotificationService, DesktopNotificationAdapter, NotificationEvent } from '<repo>/src/2-services/notifications'` resuelve sin error_

## 3. Capa 4 — entry point CLI standalone

- [ ] 3.1 Crear `src/2-services/notifications/cli.ts` con `commander` que parsea `--event-type`, `--message`, `--title`, `--sound`, `--silent`, `--stdin-json`; delega en `DesktopNotificationAdapter`; lee `process.stdin` cuando `--stdin-json` está presente y deriva `title` de `hook_event_name`; imprime error en `stderr` y sale con código 1 ante payload inválido o flags faltantes.
  - _Criterio: el archivo importa `commander` y `DesktopNotificationAdapter`_
  - _Criterio: el archivo NO importa nada desde `src/4-api/`, `src/3-operations/`, ni `src/5-user-interfaces/`_
  - _Criterio: el archivo NO accede a `C:\AI/...`_

## 4. Tests unitarios

- [ ] 4.1 Crear `tests/2-services/notifications/desktop-notification.adapter.test.ts` con `vitest`, mockeando `node-notifier` con `vi.mock('node-notifier', ...)`.
  - _Criterio: los tests verifican que `adapter.notify({ title, message })` invoca `nodeNotifier.notify` SIN campo `icon` (ni `contentImage`, ni `appId`)_
  - _Criterio: los tests verifican que `adapter.notify({ title, message, sound: true })` invoca `nodeNotifier.notify` con `sound: true`_
  - _Criterio: los tests verifican que `adapter.notify({ title, message, silent: true })` invoca `nodeNotifier.notify` con `sound: false`_
  - _Criterio: los tests verifican que el adaptador NO llama a `SnoreToast` ni accede a `.lnk` (no hay tales invocaciones en el source)_

## 5. Documentación

- [ ] 5.1 Crear `docs/notifications.md` con secciones: propósito, puerto (`INotificationService`), adaptador (`DesktopNotificationAdapter`), entry point CLI (flags, ejemplos de invocación, códigos de salida), contrato del puerto (`NotificationEvent`), exclusiones explícitas de v1 (lista completa: sin `config.ts`, sin `builders.ts`, sin `sound/`, sin `windows-toast.ts`, sin SnoreToast/AUMID/.lnk/heroImage/defaultIcon/brandTitle, sin JSON externo), referencia a la spec canónica `desktop-notifications-service`.
  - _Criterio: el doc existe y enlaza el path del entry point CLI y de la spec canónica_
  - _Criterio: el doc declara explícitamente que `C:\AI\claude-code-notifications.ts` queda intacto durante N1; la retirada efectiva es responsabilidad de un change posterior fuera del scope de este roadmap_
- [ ] 5.2 Añadir una sección "Notifications" al `README.md` (entre "Configuración de hooks" de H1 y el resto del setup) que referencie `docs/notifications.md` y describa brevemente el entry point CLI.
  - _Criterio: la sección "Notifications" del `README.md` existe y enlaza `docs/notifications.md`_

## 6. Specs canónicas (sync)

- [ ] 6.1 Crear `openspec/specs/desktop-notifications-service/spec.md` con los 6 requirements `ADDED` del L2 (puerto, tipo `NotificationEvent`, adaptador, exclusiones, CLI, dependencias npm), cada uno con al menos un scenario `Given/When/Then`.
  - _Criterio: el archivo existe bajo `openspec/specs/desktop-notifications-service/spec.md`_
  - _Criterio: contiene los 6 requirements del L2 con sus scenarios_

## 7. Validación y archivado

- [ ] 7.1 `npm run test:quick` verde (lint + typecheck + unit).
  - _Criterio: 0 errores de lint, 0 errores de typecheck, todos los tests del repo pasan_
  - _Criterio: el inventario de `src/2-services/notifications/` contiene EXACTAMENTE 5 archivos: `INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`, `cli.ts`_
- [ ] 7.2 `openspec validate claude-n1-migrate-notifications-service` → success.
  - _Criterio: el comando retorna código 0_
- [ ] 7.3 `openspec-roadmap-manager` con `args="gate claude-n1-migrate-notifications-service"` → PASS.
  - _Criterio: las 6 comprobaciones del gate están en verde (o con WARNING no bloqueante)_
  - _Criterio: no hay CRITICAL en la salida del gate_
- [ ] 7.4 Verificar que `C:\AI\claude-code-notifications.ts` está intacto (no modificado por N1).
  - _Criterio: el archivo en `C:\AI\` mantiene el mismo contenido que antes de N1_
- [ ] 7.5 Archivar el L2 con `openspec-archive claude-n1-migrate-notifications-service` (mover a `openspec/changes/archive/2026-06-02-claude-n1-migrate-notifications-service/`).
  - _Criterio: el directorio del L2 desaparece de `openspec/changes/`_
  - _Criterio: el directorio aparece bajo `openspec/changes/archive/2026-06-02-claude-n1-migrate-notifications-service/`_
- [ ] 7.6 Actualizar `openspec/changes/claude-code-hooks-implementation/design.md`: fila N1 → estado `archivada`; `openspec/changes/claude-code-hooks-implementation/tasks.md`: tasks 2.1–2.11 → `[x]`.
  - _Criterio: la columna "Estado" de N1 en el registro es `archivada`_
  - _Criterio: las 11 tasks de N1 (sección 2 del L1) están marcadas `[x]`_
- [ ] 7.7 Commit en español, conventional-commits (`feat(notifications): …` o equivalente), con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
  - _Criterio: el commit aparece en `git log` con mensaje en español_
  - _Criterio: `git status` retorna working tree limpio tras el commit_
