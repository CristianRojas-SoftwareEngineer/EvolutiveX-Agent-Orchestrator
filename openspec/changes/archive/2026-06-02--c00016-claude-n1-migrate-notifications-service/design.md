# claude-n1-migrate-notifications-service — design

## Context

El proxy de `src/` procesa tráfico `wire` y mantiene un correlador de workflows. La configuración en `.claude/settings.json` invoca `C:\AI\claude-code-notifications.ts` para los 5 hooks con doble comando (los introducidos en H1). Ese script vive fuera del repo, no tiene tests, y no está integrado con PKA. La deriva de versiones entre el script externo y el resto del sistema es inevitable; cualquier cambio de flags, de defaults, o de la API de `node-notifier` queda invisible para los tests del repo.

N1 migra la primera versión de este servicio al repositorio bajo `src/2-services/notifications/`, con una superficie mínima y testeable: puerto `INotificationService` (capa 1) + adaptador `DesktopNotificationAdapter` (capa 2) que delega en `node-notifier.notify()` con un subset acotado de opciones, más un CLI standalone (capa 4) que un hook de Claude Code puede invocar directamente. El reapuntamiento de los hooks a este CLI ocurre en N2; en N1 los hooks siguen apuntando a `C:\AI\claude-code-notifications.ts`.

## Goals / Non-Goals

**Goals:**

- Crear `src/2-services/notifications/` con EXACTAMENTE cuatro archivos fuente (`INotificationService.ts`, `DesktopNotificationAdapter.ts`, `types.ts`, `index.ts`) más un entry point CLI (`cli.ts`).
- Puerto `INotificationService` con un único método `notify(event)`; tipo `NotificationEvent` con `title`, `message`, `sound?`, `silent?` únicamente.
- Adaptador `DesktopNotificationAdapter` que implementa el puerto y delega en `node-notifier.notify()` pasando solo `title`, `message`, `sound?` y `wait: false`. Sin `icon`, sin `contentImage`, sin `appId`, sin `SnoreToast`, sin `.lnk`, sin AUMID, sin `heroImage`, sin `defaultIcon`, sin `brandTitle`.
- CLI standalone con `commander` que parsea `--event-type`, `--message`, `--title`, `--sound`, `--silent`, `--stdin-json` y delega en una instancia del adaptador.
- Tests unitarios de `DesktopNotificationAdapter` con `node-notifier` mockeado, verificando que NO se invoca con `icon` y que `silent: true` se traduce a `sound: false`.
- `docs/notifications.md` describiendo API, CLI, contrato del puerto y exclusiones explícitas de v1.
- `package.json` lista `node-notifier` y `commander` como `dependencies`.
- `C:\AI\claude-code-notifications.ts` queda intacto (no se elimina en N1).

**Non-Goals:**

- Eliminar `C:\AI\claude-code-notifications.ts` o su `package.json` externo (queda como fallback; `@deprecated` en N2; retirada efectiva fuera del scope).
- Crear adaptadores alternativos (`SlackNotificationAdapter`, `EmailNotificationAdapter`) — el prefijo `Desktop` deja la puerta abierta pero no es alcance.
- Cargar configuración desde `JSON` externo (sin `config.ts` en v1).
- Lógica de construcción de payload específica por tipo de evento (sin `builders.ts` en v1).
- Perfiles de sonido OS-specific (sin `sound/` en v1).
- Personalización de icono, AUMID, `.lnk`, `heroImage`, `defaultIcon`, `brandTitle`.
- Registro de SnoreToast con AUMID propio (sin `windows-toast.ts` en v1).
- Cablear el adaptador al composition root del proxy (`src/4-api/`) — N1 entrega librería + CLI standalone; el wiring contra Fastify queda para N2.

## Decisions

### Ubicación: `src/2-services/notifications/`

**Decisión:** Todos los archivos del servicio viven en `src/2-services/notifications/`. El subdirectorio se crea nuevo.

**Rationale:** PKA capa 2 (servicios, adapters y ports) es el lugar correcto para el adaptador concreto y su puerto. Coincidir con la convención de otros adapters del repo (`provider-catalog.service.ts`, `session-metrics.service.ts`, etc.) simplifica la búsqueda y reduce el coste de onboarding.

**Alternativa rechazada:** Subdirectorio bajo `src/2-services/ports/notifications/` para el puerto y `src/2-services/adapters/notifications/` para el adaptador — fragmenta la entrega de N1 en dos directorios, sin valor de gobernanza añadido en v1 (un solo adaptador, un solo puerto).

### Puerto `INotificationService` con un único método `notify`

**Decisión:** El puerto expone `notify(event: NotificationEvent): void`. Se descarta `notifyBatch`, `dismiss`, `subscribe`, `listPending`.

**Rationale:** N1 solo necesita que un llamante (CLI en v1, handler en N2) emita un toast. Multiplicar la superficie del puerto obliga a mockear métodos no usados en tests y a deprecarlos si la realidad operativa no los demanda.

**Alternativa rechazada:** Puerto con `notify`, `notifyBatch`, `dismiss` — superficie inflada para v1; reintroducirla en el futuro es trivial (añadir un método no rompe consumidores existentes).

### `NotificationEvent` con cuatro campos exactos

**Decisión:** `NotificationEvent = { title: string; message: string; sound?: boolean; silent?: boolean }`. Sin `icon`, sin `image`, sin `subtitle`, sin `category`, sin `urgency`, sin `timeout`, sin `wait`, sin `appId`, sin `actions`, sin `open`, ni `closeLabel`.

**Rationale:** El puerto debe ser la representación más simple del dominio "mostrar un toast". Toda opción de personalización es una decisión que pertenece al adaptador concreto o a un change posterior. Restringir el tipo en el puerto garantiza que el contrato observable del sistema no crece en v1.

**Alternativa rechazada:** Reusar el tipo `notifier.Notification` de `node-notifier` como `NotificationEvent` — acopla el puerto a una librería de infraestructura; rompe la independencia de PKA capa 1 vs capa 2.

### `DesktopNotificationAdapter` con subset mínimo de opciones para `node-notifier`

**Decisión:** El adaptador invoca `nodeNotifier.notify({ title, message, sound, wait: false })`. Cuando `silent: true` está presente en el evento, fuerza `sound: false`. NO pasa ningún otro campo. La implementación envuelve la llamada en una `Promise` que resuelve al callback `onFulfilled` de `node-notifier` o rechaza en `onRejected`, para soportar tanto el `await adapter.notify(...)` como el fire-and-forget del CLI.

**Rationale:** El comportamiento observable en v1 (toast con título, mensaje, sonido opcional) es equivalente al de `C:\AI\claude-code-notifications.ts` cuando se invoca sin flags Windows-specific. Pasar un subset mínimo reduce la superficie expuesta a cambios de `node-notifier` entre versiones.

**Alternativa rechazada:** Replicar la API completa de `node-notifier` con un mapper 1:1 — reintroduce la deuda de versionado que N1 está intentando evitar.

### Sin `config.ts` y sin carga de `JSON` externo

**Decisión:** No existe `config.ts`. La configuración del adaptador se hace por código (constructor con defaults razonables: `wait: false`).

**Rationale:** `notifications-config.json` en `C:\AI/` es una fuente conocida de deriva de versiones. Eliminarlo en v1 reduce la superficie a testear y elimina la dependencia de `fs` desde el adaptador.

**Alternativa rechazada:** Copiar `notifications-config.json` al repo y cargarlo desde `src/2-services/notifications/config.ts` — reintroduce el problema de versionado y obliga a tests que mockeen `fs.readFile`.

### CLI con `commander` y `--stdin-json` opcional

**Decisión:** El CLI usa `commander` (promovido a `dependencies`) para parsear `--event-type <type>`, `--message <msg>`, `--title <title>`, `--sound`, `--silent`, `--stdin-json`. Cuando `--stdin-json` está presente, el CLI lee `process.stdin` completo (`for await` o buffer concat), lo parsea como JSON, y deriva `title` del campo `hook_event_name`; el `message` se construye con un resumen de los campos relevantes del payload (en v1, basta con la concatenación `hook_event_name + session_id`).

**Rationale:** `commander` ya está en el repo (`devDependencies`) y se usa en `scripting/`. Reutilizarlo evita reinventar el parsing de `argv` y mantiene la coherencia con el resto del CLI del proxy. Promoverlo a `dependencies` (no `devDependencies`) refleja que el CLI es producto, no herramienta de desarrollo.

**Alternativa rechazada:** Parsing manual de `process.argv` — más código, más bugs, y rompe la convención del repo.

### CLI standalone, no cableado al proxy

**Decisión:** N1 entrega el CLI como ejecutable standalone, invocable vía `tsx src/2-services/notifications/cli.ts <flags>` o equivalente. NO se importa `INotificationService` ni `DesktopNotificationAdapter` desde `src/4-api/` ni desde ningún handler.

**Rationale:** El reapuntamiento de los hooks a este CLI ocurre en N2; cablear el adaptador en el composition root en N1 obligaría a N2 a coordinar dos cambios a la vez (cableado + reapuntamiento de `settings.json`). Mantener N1 como librería + CLI standalone desacopla la entrega.

**Alternativa rechazada:** Cablear el adaptador en `src/4-api/composition.ts` y exponer un endpoint Fastify para invocarlo — exige que N2 coordine dos modificaciones en `src/`, rompiendo la atomicidad del reapuntamiento de hooks.

### PKA: orden de implementación capa 1 → capa 2 → capa 4

**Decisión:** N1 implementa en este orden: (1) `types.ts` y `INotificationService.ts` (capa 1, tipos puros sin imports de `node-notifier`); (2) `DesktopNotificationAdapter.ts` y `index.ts` (capa 2, adaptador concreto); (3) `cli.ts` (capa 4, composition root standalone).

**Rationale:** PKA exige dependencias solo hacia capas internas. Construir el puerto antes que el adaptador garantiza que el adaptador compila contra una interfaz ya existente, no contra una suposición. El CLI se construye al final porque depende del adaptador (capa 2) ya implementado y testeado.

**Alternativa rechazada:** Implementar CLI en paralelo con el adaptador — el CLI depende de la firma del adaptador; empezar en paralelo obliga a refactorizar cuando la firma cambia durante la implementación.

## Risks / Trade-offs

- **R1 — Comportamiento de toasts puede diferir entre `C:\AI/...` y la versión migrada** → Mitigation: los tests unitarios mockean `node-notifier` y verifican el subset de campos pasado. El smoke test manual del CLI (criterio 2.7) queda como gate del usuario, no automatizable en CI por requerir OS interactivo.
- **R2 — `node-notifier` puede variar su API entre versiones** → Mitigation: se acota a `notify(notificationObject)` con un subset estable (`title`, `message`, `sound`, `wait`). Cualquier otro campo queda fuera del contrato.
- **R3 — Sin cableado al proxy, la cobertura de integración del nuevo servicio es nula en v1** → Mitigation: N1 entrega librería + CLI standalone + tests unitarios. El cableado y los tests de integración se difieren a N2, que cierra el ciclo (reapunta hooks + smoke test del CLI + verificación end-to-end).
- **R4 — El path del CLI (`src/2-services/notifications/cli.ts`) puede no coincidir con la ruta final que N2 invoque desde `.claude/settings.json`** → Mitigation: N1 entrega el archivo en su ubicación lógica y documenta la convención. N2 decide la ruta exacta; si N2 requiere moverlo (p. ej. a `src/2-services/notifications/bin/notify.ts`), N1 acepta ese cambio como parte de N2.
- **R5 — `commander` promovido a `dependencies` puede inflar el bundle del proxy** → Mitigation: la promoción es necesaria porque el CLI standalone es producto. El proxy no importa el servicio en N1; el wiring queda para N2. El impacto en el bundle del proxy se evalúa en N2, cuando se importe el adaptador desde `src/4-api/`.
