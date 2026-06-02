## Context

El gateway HTTP (`src/`) procesa hoy el tráfico `wire` (plano A/B de `gateway-design.md`) y mantiene un correlador de workflows en `src/3-operations/audit-workflow.handler.ts`. La spec canónica `openspec/specs/hooks-lifecycle-correlation/spec.md` describe el endpoint `POST /hooks`, el parsing puro del evento de hook (`parseHookEvent` en capa 1) y el despacho al `AuditHookEventHandler` (capa 3), pero los hooks que disparan ese endpoint **no están configurados en `.claude/settings.json`**: hoy el archivo del proyecto está vacío (`{}`) y el de usuario (`C:\Users\Cristian\.claude\settings.json`) tiene notificaciones para algunos eventos pero ningún enrutamiento a `POST /hooks`. Resultado: 256 warnings `[audit] No se encontró workflow padre para continuation` en `server/logs.jsonl` por correlación heurística fallida.

En paralelo, el sistema de notificaciones de escritorio (`C:\AI\claude-code-notifications.ts` + `C:\AI\src/notifications/*` + `C:\AI/notifications-config.json` + `C:\AI/package.json` con `commander` y `node-notifier`) vive fuera del versionado del repo. Esto genera tres problemas estructurales:

- **Deriva de versiones inevitable**: cualquier cambio al notificador debe sincronizarse manualmente con el repo.
- **Sin cobertura de tests en el repo**: el código en `C:\AI/...` no se testea junto con el resto del sistema.
- **Sin integración PKA**: el sistema de notificaciones no respeta la arquitectura de 6 capas (PKA) del repo; la convención de adapters/ports queda ignorada.

Ambos problemas comparten contención en `.claude/settings.json` (los hooks son el mecanismo de configuración, y el reapuntamiento del notificador vive en el mismo archivo), por lo que un cambio no coordinado puede dejar al repo en un estado inconsistente (hooks apuntando a rutas absolutas externas que se migrarán, o dos cambios editando la misma sección de `settings.json` en paralelo).

El precedente inmediato es el orquestador archivado `2026-06-01-gateway-migration`, que introdujo 11 fases L2 sobre 3 bloques (C, G, P) con DAG de dependencias, phase registry, back-reference rule, y phase gate de 6 chequeos. Este orquestador reutiliza ese mismo patrón, reducido a 3 fases sobre 2 bloques (H, N).

## Goals / Non-Goals

**Goals:**

- Phase registry trazable 1:1 a los dos problemas identificados, con DAG explícito.
- Convención de nombres para los 3 L2 changes hijos.
- Back-reference rule que permite navegar de L2 a L1 sin jerarquía nativa de OpenSpec.
- Estrategia de validación diferenciada por bloque (H = config; N = código + config).
- Política de mantenimiento documental y reducción de legacy por fase.
- Política de creación incremental de L2 changes (no upfront).

**Non-Goals:**

- Diseño técnico de ninguna fase (eso va en el `design.md` de cada L2).
- Modificación de `src/`, `tests/` o `sessions/` como parte de este change.
- Decisiones de implementación del servicio de notificaciones más allá de las ya acordadas (ubicación, naming, componentes) — el detalle pertenece al L2 `claude-n1-migrate-notifications-service`.
- Eliminación de `C:\AI\claude-code-notifications.ts` — queda como fallback, deprecado al cierre.

## Registro de fases

La relación padre→hijo entre este orquestador y los 3 L2 changes se expresa de dos formas complementarias, dado que OpenSpec no tiene jerarquía nativa:

1. **Registro del orquestador** (tabla siguiente): enumera los 3 L2 changes con sus slugs propuestos, aunque aún no existan en `openspec/changes/claude-code-hooks-implementation/phases/`.
2. **Back-reference en cada L2**: el `proposal.md` de cada change hijo incluye la sección `Orquestador: claude-code-hooks-implementation` con su phase ID.

| Fase | Change hijo | Bloque | Dependencia (DAG) | Gate de validación | Docs a actualizar | Legacy a retirar | Estado |
|------|-------------|--------|-------------------|--------------------|-------------------|------------------|--------|
| **H1** — registrar los 8 hooks del lifecycle en `.claude/settings.json` del proyecto | `claude-h1-register-missing-hooks` | Hooks config | — (entry) | Sesión de prueba con Claude Code no genera warnings `[audit] No se encontró workflow padre...` en `server/logs.jsonl`; tests E2E del `AuditHookEventHandler` confirman recepción de los 8 eventos del lifecycle (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`); `.claude/settings.json` contiene las 8 entradas, cada una con al menos un comando invocando `POST /hooks`; los 5 hooks que tenían notificación en user-level (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`) conservan el comando apuntando a `C:\AI\claude-code-notifications.ts`; los matchers de `PreToolUse` y `PostToolUse` quedan en `*` para que el gateway reciba los eventos de todas las tools | `README.md` §setup, `docs/gateway-architecture.md` §18 (si documenta config de hooks) | — (cambio aditivo en `settings.json`; las entradas de user-level quedan sobrescritas por las del proyecto) | archivada |
| **N1** — migrar servicio de notificaciones al repo | `claude-n1-migrate-notifications-service` | Notificaciones | — (entry, puede correr en paralelo con H1) | `npm run test:quick` verde (lint + typecheck + unit); tests unitarios de `DesktopNotificationAdapter` con `node-notifier` mockeado; smoke test del CLI entry point reproduce comportamiento de toasts equivalente al de `C:\AI\claude-code-notifications.ts` | `README.md` (nueva sección "Notifications"), nueva `docs/notifications.md` (API, entry point CLI, contrato del puerto) | — (código de `C:\AI/...` queda intacto durante N1) | archivada |
| **N2** — reapuntar los comandos de notificación al servicio interno | `claude-n2-repoint-hooks-to-internal-notifications` | Hooks config | H1 archivada, N1 archivada | `npm run test:quick` verde; verificación manual de toasts para los 5 hooks con doble comando en `.claude/settings.json` (los que tenían notificación en user-level y la conservaron en H1); `node-notifier` carga el icono del repo correctamente desde la ruta interna; `grep -F 'C:\AI\' .claude/settings.json` retorna cero coincidencias | `docs/notifications.md` (ruta final del entry point), `README.md` §setup (cualquier mención residual a `C:\AI/...`) | Marcar `C:\AI\claude-code-notifications.ts` como `@deprecated` con fecha de retirada (N2 no elimina el archivo; el repo deja evidencia del roadmap de retirada) | archivada |

### DAG

```
              H1 ──────┐
                       ├──► N2
              N1 ──────┘
```

H1 y N1 son entry points (sin dependencias), por lo que pueden ejecutarse en paralelo. N2 solo arranca cuando ambas estén `archivada`; modifica las entradas de `settings.json` registradas por H1, reemplazando la ruta al notificador externo por la ruta al entry point del servicio migrado por N1.

### Decisiones de diseño ya acordadas para N1 (primera versión sin personalización)

El diseño de `src/2-services/notifications/` se decidió en exploración previa a este orquestador y se ha **simplificado intencionalmente** en esta primera versión para descartar la capa de personalización y las dependencias Windows-specific. Las decisiones trasladadas a N1 son:

- **Ubicación**: `src/2-services/notifications/` (capa 2 PKA).
- **Puerto**: `INotificationService` (interface en capa 1; sigue convención de naming `I*` para ports ya usada en el repo, p. ej. `IWorkflowRepository`, `IEventBus`). En esta primera versión el contrato se reduce a un único método `notify(event)` con `title`, `message`, `sound?`, `silent?`.
- **Adaptador concreto**: `DesktopNotificationAdapter` (capa 2). El prefijo `Desktop` deja espacio para futuros adaptadores (`SlackNotificationAdapter`, `EmailNotificationAdapter`) sin forzar la abstracción ahora.
- **Componentes** (reducidos a 4 archivos + entry point CLI):
  - `index.ts` — exports públicos del paquete.
  - `types.ts` — `NotificationEvent`, `EventType`, y tipos auxiliares mínimos. **Sin** `WindowsToastConfig`, sin `heroImage`, sin `brandTitle`, sin `defaultIcon`.
  - `INotificationService.ts` — interface del puerto.
  - `DesktopNotificationAdapter.ts` — adaptador que envuelve `node-notifier`. **Sin** lógica de SnoreToast, **sin** registro de AUMID, **sin** `.lnk`, **sin** `heroImage`, **sin** `defaultIcon`, **sin** perfiles de sonido OS-specific.
- **Dependencias npm**: `commander` (para el entry point CLI) y `node-notifier` (para el adapter). Ambas ya presentes en `C:\AI/package.json`. `commander` puede omitirse si el L2 implementa el parsing de argv manualmente.
- **Entry point CLI**: residirá en el repo (no en `C:\AI`); el L2 decide la ruta exacta. Mantiene el subconjunto de flags de `C:\AI\claude-code-notifications.ts` que son cross-platform (`--event-type`, `--message`, `--title`, `--sound`, `--silent`); los flags Windows-specific de la versión previa (`--app-id`, `--shortcut`, etc.) se descartan.
- **Wiring en composition root**: capa 4 (`src/4-api/`); el L2 lo implementa.
- **Sin JSON externo en v1**: el adaptador se construye con configuración por código (constantes o parámetros del constructor). El JSON `notifications-config.json` de `C:\AI/` queda descartado en esta primera versión. Si en el futuro se necesita configuración externa, se introduce en un change posterior sin romper el contrato actual.
- **Sin `builders.ts`**: el cuerpo del toast es `title + message` del payload del hook. No hay lógica de construcción específica por tipo de evento en v1; los tipos de evento existen solo como `EventType` para el flag `--event-type` del CLI.

## Convención de nombres de L2 changes

```
claude-<phaseid>-<slug>
```

- `<phaseid>`: identificador en minúsculas de la fase (`h1`, `n1`, `n2`).
- `<slug>`: descripción kebab-case del entregable principal de la fase.
- Ejemplos: `claude-h1-register-missing-hooks`, `claude-n1-migrate-notifications-service`, `claude-n2-repoint-hooks-to-internal-notifications`.

### Back-reference obligatoria en el change hijo

Cada `proposal.md` de un L2 SHALL incluir al inicio:

```
> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** <h1|n1|n2> (<bloque>)
```

Esto es la única forma de navegar de hijo a padre, dado que OpenSpec no soporta jerarquía nativa. Misma convención que el orquestador archivado `gateway-migration`.

## Estrategia de validación por bloque

### Bloque H — Configuración de hooks

Gates de integración y verificación operacional:

- **H1**: smoke test de sesión de Claude Code + tests E2E del `AuditHookEventHandler`.
  - Criterio: `server/logs.jsonl` no contiene el warning `[audit] No se encontró workflow padre para continuation` durante una sesión de prueba representativa (al menos 1 `SubagentStart`, 1 `SubagentStop`, 1 `PostToolUseFailure`, 1 `PreToolUse` y 1 `PostToolUse` ejecutados).
  - Criterio: el handler recibe los 8 eventos del lifecycle cuando se invocan desde Claude Code.
- **N2**: smoke test manual + `npm run test:quick`.
  - Criterio: los toasts aparecen para los 5 hooks con doble comando en `.claude/settings.json` (los que tenían notificación en user-level y la conservaron en H1).
  - Criterio: `node-notifier` carga el icono desde la ruta interna del repo, no desde `C:\AI/...`.

### Bloque N — Migración de notificaciones

Gates unitarios y de regresión:

- **N1**: `npm run test:quick` (lint + typecheck + unit) + tests unitarios de `DesktopNotificationAdapter` con `node-notifier` mockeado.
  - Criterio: comportamiento equivalente al de `C:\AI\claude-code-notifications.ts` en cuanto a: tipos de toast (success/error/warning/info), sonido, duración, icono.
  - Criterio: la interfaz `INotificationService` está exportada y `DesktopNotificationAdapter` la implementa.
  - Criterio: el entry point CLI en el repo carga la config desde una ruta interna (no desde `C:\AI/notifications-config.json`).

## Mantenimiento documental por fase

Cada L2 es responsable de actualizar los documentos listados en su fila del registro **antes** de marcar la fase como `validada`. La política es:

1. Actualizar solo lo que la fase cambia; no reescribir secciones no afectadas.
2. `docs/gateway-architecture.md` §18 (si existe y documenta config) y `README.md` §setup reflejan el estado operativo del proxy; deben coincidir con la config real.
3. `docs/notifications.md` (creado por N1) es la fuente de verdad del servicio de notificaciones; debe actualizarse en N1 (creación) y en N2 (ruta final del entry point).
4. `openspec/specs/hooks-lifecycle-correlation/spec.md` puede recibir deltas en el L2 H1 si el contrato de configuración de hooks añade requirements nuevos. Esos deltas se sincronizan con `openspec-sync` tras la fase.

## Reducción de legacy por fase

La política es:

1. El código reemplazado se elimina en el mismo change que lo reemplaza. **Excepción:** `C:\AI\claude-code-notifications.ts` queda intacto durante N1 y se marca `@deprecated` (con fecha) en N2; la eliminación efectiva se difiere a un change posterior por estar fuera del repo y no ser versionable aquí.
2. Los imports huérfanos que genere el propio L2 deben eliminarse antes de que el gate (`npm run test:quick` o `npm run test`) pase.
3. `C:\AI/claude-code-notifications.ts` queda como fallback durante H1 y N1 (los hooks siguen invocándolo). En N2, su `@deprecated` se documenta en `docs/notifications.md` con la fecha de retirada prevista.

## Política de creación incremental de L2 changes

- El registro enumera los 3 L2 changes con slugs propuestos. **No se crean de golpe**: cada L2 se crea con `openspec-propose` al **iniciar** su fase.
- Antes de crear el L2 se verifica en el registro que sus dependencias están en estado `archivada`.
- Orden de inicio según DAG: H1 y N1 pueden iniciarse en paralelo (ambos `entry`); N2 arranca tras ambas archivadas.
- Dentro de N1, orden de implementación por capas PKA: capa 1 (puerto) → capa 2 (adaptador, config, builders, sound) → capa 4 (composition root, entry point CLI).

## Decisions

### Modelo de dos niveles sin jerarquía nativa en OpenSpec

**Decisión:** Expresar la relación padre→hijo mediante el registro del orquestador (en `design.md`) + back-reference en el `proposal.md` del L2.

**Rationale:** OpenSpec no tiene soporte nativo de jerarquía de changes. Esta convención es suficiente para navegar la relación y para que el `phase_gate` valide la trazabilidad (Check 2). Reutilizar exactamente la convención del orquestador archivado `gateway-migration` aporta consistencia al repo y reduce el coste de aprendizaje.

**Alternativa rechazada:** Carpeta anidada (`openspec/changes/claude-code-hooks-implementation/phases/<l2>/`) sin back-reference — rompería la trazabilidad y haría imposible navegar de L2 a L1 sin inspección manual.

### Fases H y N con dependencias independientes, N2 al final

**Decisión:** H1 y N1 son entry points (pueden correr en paralelo). N2 depende de ambas.

**Rationale:** H1 es configuración pura (`settings.json`); N1 es código (`src/2-services/notifications/`). No comparten archivos. N2 reapunta el notificador en `settings.json`, que es la intersección real entre los dos bloques, por lo que requiere que ambas fases anteriores estén estables.

**Alternativa rechazada:** H1 → N1 secuencial — introduce un retraso artificial sin beneficio técnico. H1 no necesita al servicio de notificaciones migrado, y N1 no necesita que los hooks estén reconfigurados.

### `DesktopNotificationAdapter` como adaptador concreto; prefijo `Desktop` deliberado

**Decisión:** El adaptador concreto se llama `DesktopNotificationAdapter`, no `NotificationAdapter` ni `ToastNotificationAdapter`.

**Rationale:** El prefijo `Desktop` describe el canal (escritorio del sistema operativo vía `node-notifier`), no la tecnología. Dejar el nombre así evita tener que renombrar cuando se añadan futuros adaptadores (`SlackNotificationAdapter`, `EmailNotificationAdapter`). El puerto `INotificationService` se mantiene agnóstico del canal.

**Alternativa rechazada:** `NotificationAdapter` (sin prefijo) — ambiguo cuando coexista con un segundo adaptador; exigiría renombrar a `DesktopNotificationAdapter` en ese momento, con migración de imports y tests.

### H1: 8 hooks del lifecycle registrados en `.claude/settings.json` del proyecto (sobrescribiendo user-level)

**Decisión:** Las 8 entradas del lifecycle se registran en `.claude/settings.json` del proyecto (Smart Code Proxy), no en `C:\Users\Cristian\.claude\settings.json` del usuario. Las entradas del proyecto **sobrescriben** las del user-level para las claves presentes (mecanismo de merge de Claude Code: project tiene precedencia sobre user).

**Rationale:** El proyecto debe ser self-contained y versionable. La configuración de hooks de un repo es una decisión del proyecto, no del usuario individual. Esto sigue el principio de la spec `hooks-lifecycle-correlation` (el contrato de hooks es del proxy, no del harness del usuario). Las 5 entradas que el user-level ya tenía configuradas (con notificación + sin `POST /hooks`) se reescriben a nivel de proyecto con el contrato ampliado (doble comando donde aplique: `POST /hooks` + notificación apuntando a `C:\AI/...` hasta N2).

**Consecuencia deliberada:** el user-level `settings.json` deja de ser la fuente de configuración de hooks para Smart Code Proxy. Esto es aceptable porque el proyecto define su propio contrato.

**Alternativa rechazada:** Registrar solo los 3 hooks ausentes en el proyecto y dejar los otros 5 en el user-level — provocaría que el gateway recibiera solo 3 de los 8 eventos por `POST /hooks`, y los otros 5 llegarían solo a notificación (sin correlación). La heurística de correlación seguiría incompleta y los 256 warnings no se eliminarían de forma estable.

**Alternativa rechazada:** Registrar los 8 hooks en el user-level — funciona, pero no es portable, no es versionable, y se pierde al formatear / cambiar de equipo.

### `C:\AI\claude-code-notifications.ts` queda como fallback deprecado, no se elimina

**Decisión:** El script en `C:\AI\...` no se elimina en este roadmap. En N2, se documenta como `@deprecated` con fecha de retirada prevista.

**Rationale:** El archivo vive fuera del repo, por lo que el orquestador no tiene jurisdicción para eliminarlo. Un change posterior, fuera del scope de este roadmap, puede ocuparse de la retirada efectiva. Mientras tanto, sirve como fallback si el entry point interno del repo falla.

**Alternativa rechazada:** Eliminar `C:\AI/...` en N2 — fuera de scope (el orquestador solo gobierna el repo, no el sistema de archivos del usuario); requeriría coordinación con procesos que pueden no ser automatizables.

## Risks / Trade-offs

- **R1 — Acoplamiento de fases a un único archivo (`settings.json`)** → Mitigation: el phase gate (Check 5: doc sync) verifica que H1 y N2 no se solapen en líneas concurrentes; el DAG asegura que N2 arranque solo cuando H1 esté archivada.
- **R2 — Comportamiento de toasts puede diferir entre `C:\AI/...` y la versión migrada** → Mitigation: N1 incluye un smoke test que compara comportamiento observable (icono, sonido, duración) entre ambas implementaciones antes de marcar la fase como `validada`.
- **R3 — El handler `AuditHookEventHandler` ya existe, pero la cobertura de tests de los 8 hooks puede ser insuficiente** → Mitigation: H1 incluye tests E2E que verifican la entrega de los 8 eventos del lifecycle al handler; si los tests faltan, se añaden en el L2.
- **R4 — El entry point CLI del repo debe decidir una convención de path y de config (¿`./notifications-config.json`? ¿variable de entorno? ¿constructor explícito?)** → Mitigation: el L2 `claude-n1-migrate-notifications-service` debe documentar la decisión en su propio `design.md`; el orquestador no prejuzga.
- **R5 — `node-notifier` en Windows podría requerir registro de SnoreToast con un AUMID propio en escenarios avanzados** → Mitigation: descartado en v1; `node-notifier` usará su implementación nativa (built-in o `notifu`) sin personalización. Si en el futuro se requiere branding Windows, se introduce en un change posterior sin romper el contrato actual (que ya es mínimo).
- **R6 — El `phase_gate` no reemplaza a `openspec-verify`; los hallazgos del gate se complementan, no se duplican** → Mitigation: el gate delega Check 1 a `openspec-verify` y reutiliza sus findings verbatim, evitando divergencia entre verificación por-cambio y gate de fase.
