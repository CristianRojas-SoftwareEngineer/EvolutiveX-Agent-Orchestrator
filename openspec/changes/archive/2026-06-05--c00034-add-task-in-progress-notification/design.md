# Design: add-task-in-progress-notification

## Context

El usuario quiere que el ciclo de feedback de las tareas de `TaskList` incluya la transición intermedia `pending → in_progress` (hoy solo se notifica la creación y la finalización). La spec `hooks-lifecycle-correlation` ya tiene una sección de notificaciones UX no-lifecycle con 5 entradas (incluidas `TaskCreated`/`TaskCompleted`); este change añade la 6ª siguiendo el mismo patrón, con un twist: `TaskInProgress` no es un hook nativo de Claude Code, así que se implementa como entrada `PostToolUse[matcher="TaskUpdate"]` con un script relay que filtra `tool_input.status`.

El cambio tiene 4 piezas técnicas distribuidas en 2 capas PKA y 1 área de config:

1. Capa 2 (notifications): perfil nuevo + formatter nuevo (ambas adiciones puras al catálogo y registro de formatters).
2. Capa scripting: nuevo relay `task-in-progress-hook-ux.ts` (paridad estructural con `pre-tool-use-hook-ux.ts`).
3. Configuración: nueva entrada en `configs/hooks.json` + distribución vía `setup --hooks`.

Un intento previo (revertido) demostró 3 problemas que este diseño debe evitar:

- **No duplicar bloques `PostToolUse`**: el actual tiene matcher `*` con `post-hook-event.ts`. El nuevo usa matcher `TaskUpdate`, que es **disjunto** con `*` en la semántica de Claude Code (los hooks se emparejan por matchers, no por cascada). Por tanto coexisten como entradas independientes del array `hooks.PostToolUse`, no como un bloque único.
- **Filtrar `status` en el script, no en el shell**: `--event-type TaskInProgress` no es un evento nativo de Claude Code. El filtrado ocurre en el relay TypeScript leyendo `tool_input.status` del payload JSON.
- **NO crear el PNG sin aprobación**: AGENTS.md §6 prohíbe crear assets sin confirmar. El design Surface A) lo deja como tarea con aprobación explícita antes de generar el archivo; Surface B) lo documenta como dependencia externa (no crear).

## Goals / Non-Goals

**Goals:**

- Añadir el perfil `TaskInProgress` y el formatter `formatTaskInProgressMessage` con paridad semántica con `SubagentStart` (mismo `level: "activity"`, mismo `sound`).
- Implementar el relay `scripting/task-in-progress-hook-ux.ts` con filtrado robusto por `status` (defensa contra payloads ausentes, status distintos a `in_progress`, JSON inválido).
- Registrar la entrada canónica en `configs/hooks.json` como bloque independiente con `matcher: "TaskUpdate"`.
- Cubrir con tests: unit del formatter, integración del relay (4 casos: `in_progress` notifica, `completed`/`pending`/`deleted` descartan, JSON inválido diagnostic sin propagar, stdin vacío termina limpio).

**Non-Goals:**

- No modificar el contrato de `INotificationService`, `DesktopNotificationAdapter`, `cli.ts`, `buildEvent`, ni `register.ts`.
- No introducir throttling/dedupe entre notificaciones consecutivas.
- No añadir un nuevo hook lifecycle nativo (no existe; usar `PostToolUse[matcher=TaskUpdate]`).
- No crear el PNG sin aprobación explícita del usuario (ver Decisión D1).

## Decisions

### D1. Filtrado de `status`: en el script, no en el shell

**Decisión:** el relay parsea el JSON de stdin y compara `tool_input.status === "in_progress"` en TypeScript, no usa el campo `if` del hook en `settings.json` ni invoca el CLI con un flag condicional.

**Rationale:** el contrato de hooks de Claude Code no tiene un evento `TaskInProgress` nativo. El campo `if` del hook soporta patrones simples sobre el payload JSON (`TaskUpdate(in_progress *)`) pero su semántica de matching es opaca y propensa a falsos negativos en distintas versiones del cliente. Hacer el filtro en TypeScript explícito y testeable es más robusto.

**Alternativas consideradas:**

- `if: "TaskUpdate(in_progress *)"` en `settings.json`. Rechazada: el matcher es parte del contrato interno de Claude Code, no documentado como API estable, y no permite distinguir `tool_input.status` de un campo top-level `status` del payload.
- Invocar el CLI con `--event-type` dinámico (`TaskInProgress`/`TaskCompleted`/etc.) según el `status` del payload. Rechazada: requiere lógica de despacho en el relay, y la `eventKey` se desincroniza del catálogo (perfiles huérfanos en el catálogo).
- Múltiples entradas `PostToolUse` con `matcher` específico (uno por `status`). Rechazada: Claude Code matchea por nombre de tool, no por `tool_input.status`.

### D2. Matchers disjuntos: coexistencia de `PostToolUse[matcher="*"]` y `PostToolUse[matcher="TaskUpdate"]`

**Decisión:** el cambio añade una **segunda entrada** en el array `hooks.PostToolUse` con `matcher: "TaskUpdate"`, manteniendo la entrada existente con `matcher: "*"` (que ejecuta `post-hook-event.ts` para el correlador del gateway).

**Rationale:** los matchers en Claude Code se evalúan independientemente por cada tool invocada. Una invocación de `TaskUpdate` empareja **ambas** entradas (porque la tool name coincide con `*` y con `TaskUpdate`), así que se ejecutan los dos comandos — pero son scripts distintos con propósitos distintos: el primero correlaciona el `TaskUpdate` en el gateway (`POST /hooks`), el segundo filtra por `status` y notifica.

**Trade-off aceptado:** se duplica el trabajo para `TaskUpdate` específicamente (cada `TaskUpdate` ejecuta dos comandos), pero el costo es despreciable (los relays son subprocesos `tsx` de ~100 ms cada uno, y `TaskUpdate` se invoca en ráfagas durante planificación activa).

**Alternativa considerada:** un solo relay que combine correlación del gateway + notificación condicional. Rechazada: rompe la separación de concerns del requisito `hooks-lifecycle-correlation` § 3.2 (el correlador solo procesa los 8 eventos del lifecycle, no `TaskUpdate`); forzar a `POST /hooks` a procesar `TaskUpdate` lo añadiría al conjunto de eventos del correlador sin justificación.

### D3. Naming y mensaje del perfil: `TaskInProgress` con `message: "Tarea iniciada"`

**Decisión:** clave de catálogo `TaskInProgress` (PascalCase, paridad con `TaskCreated`/`TaskCompleted`). `message` fijo del catálogo: `"Tarea iniciada"`. El formatter antepone `"Tarea iniciada: "` al `subject` truncado.

**Rationale:** paridad con los perfiles existentes de Task* (los tres comparten el prefijo `Tarea` en español, lo cual es consistente con `SubagentStart` → `Subagente iniciado`). La doble forma (catálogo "Tarea iniciada" vs. formatter "Tarea iniciada: X") cubre dos casos: payload con subject (dinámico, personalizado) y payload sin subject (fallback genérico).

**Alternativa considerada:** usar solo el formatter (sin `message` en catálogo). Rechazada: la spec `desktop-notifications-service` § 4 («Resolución de `message` en `buildEvent`») exige un fallback de catálogo cuando el formatter devuelve `null`. Sin `message` en el catálogo, la resolución degradaría a cadena vacía (lo que rompe el requirement «CLI con payload inválido → error en stderr y exit 1»).

### D4. Creación del PNG `task-in-progress.png`

**Decisión:** Surface A) **documentar la creación del PNG como tarea explícita que requiere aprobación del usuario** antes de generar el archivo. El relay y los tests NO dependerán de la presencia del PNG; el spec exige el archivo (catalogo + asset) pero la implementación puede completarse sin él (el CLI degrada con gracia: si el PNG no existe, omite `icon`).

**Rationale:** AGENTS.md §6 prohíbe crear nuevos archivos bajo `assets/` sin aprobación explícita. La creación del PNG no es trivial (requiere 256×256, 32-bit RGBA, fondo transparente) y se beneficia de la curaduría manual o del pipeline de mantenimiento `writeAllEventNotificationImages` (capa 2, módulo de mantenimiento, no cableado al CLI). El spec del change lo declara; las tasks lo separan como una tarea discreta con verificación visual.

**Alternativas consideradas:**

- Surface B) reutilizar `task-created.png` con un fallback de mensaje. Rechazada: la spec del catálogo exige que `image` apunte a un archivo distinto por evento (cada perfil tiene su propio PNG). Compartir el PNG entre `TaskCreated` y `TaskInProgress` violaría la invariante de 1:1 perfil↔asset.
- Surface C) generar el PNG automáticamente con `writeAllEventNotificationImages` durante el change. Rechazada: ese módulo es de mantenimiento y sobrescribe assets existentes (ver spec `desktop-notifications-service` § 6); crear un asset nuevo sin curaduría visual explícita generaría un PNG de baja calidad.
- Surface D) saltarse el PNG y degradar con `image: undefined`. Rechazada: la spec `desktop-notifications-service` § «Resolución de ruta de imagen por evento» ya implementa el fallback a `ai-assistant.png`; sin la entrada en el catálogo, el evento usaría el icono genérico de la app, perdiendo la señal visual diferenciada.

### D5. Distribución de hooks: user-level como default, plantilla canónica versionada

**Decisión:** el cambio se distribuye en `~/.claude/settings.json` (user-level) por defecto, según la spec `hooks-lifecycle-correlation` § «Modelo de instalación user-level por defecto». La plantilla canónica se actualiza en `configs/hooks.json` con la nueva entrada `PostToolUse[matcher=TaskUpdate]`. El instalador `setup --hooks` se actualiza para reconocer `task-in-progress-hook-ux` como comando de SCP (marcador adicional en la lista de path-matching).

**Rationale:** paridad exacta con el mecanismo de distribución de las 13 entradas existentes. El instalador ya hace merge selectivo; añadir una entrada nueva se reduce a (1) crear la entrada en la plantilla, (2) añadir `task-in-progress-hook-ux` a la lista de marcadores, (3) actualizar los count tests si los hay.

## Risks / Trade-offs

- **[Riesgo: matcher doble para `TaskUpdate` dispara dos comandos]** → Mitigación: documentado explícitamente en `docs/notifications.md` que `TaskUpdate` ejecuta `post-hook-event.ts` (correlador) + `task-in-progress-hook-ux.ts` (notificación). El costo de doble ejecución es despreciable (~100 ms por subproceso `tsx`).
- **[Riesgo: el filtrado por `status` deja pasar `status` con valor inesperado]** → Mitigación: comparación estricta con `===`; cualquier valor distinto de `"in_progress"` se descarta silenciosamente (incluidos `undefined`, `null`, `""`).
- **[Riesgo: el PNG no existe al instalar y la notificación sale sin icono]** → Mitigación: el helper `register.ts --install` copia los PNG del catálogo a `%LOCALAPPDATA%\AIAssistant\events\`; si el PNG falta en `assets/notifications/events/`, el helper lo ignora y la notificación usa el fallback `ai-assistant.png`. La degradación es visual (icono genérico), no funcional (el toast sigue sonando).
- **[Riesgo: cambio en el contrato de `tool_input.subject` en futuras versiones de Claude Code]** → Mitigación: el formatter cae a `payload.subject` como fallback (campo top-level). Si ambos fallan, devuelve `null` y se usa el `message` del catálogo. Tres niveles de defensa.
- **[Trade-off: no throttling]** → Múltiples `TaskUpdate(in_progress)` consecutivos generan múltiples toasts. Documentado en spec `hooks-lifecycle-correlation` § «Notificaciones de UX no-lifecycle». Aceptado por el usuario; mitigación futura fuera del scope.
- **[Trade-off: tests del formatter requieren mocks del catálogo de eventos]** → Mitigación: el formatter es función pura sin I/O; los tests no necesitan `node-notifier` mockeado (el catálogo solo se consulta en `buildEvent`, no en `resolveHookNotificationMessage`).
- **[Trade-off: no actualizar `assets/notifications/events/task-in-progress.png` en este change sin aprobación]** → Mitigación: la tarea de creación del PNG está bloqueada hasta confirmación explícita del usuario. El resto del change (código, tests, config) es funcional sin él.

## Open Questions

- **Q1: ¿El usuario aprueba la creación del PNG `task-in-progress.png`?** Si la respuesta es sí, se desbloquea la tarea de generación. Si la respuesta es no, se documenta como dependencia externa y el change se cierra con la nota de que `image` apunta a un archivo que el operador del repo debe crear.
- **Q2: ¿El cambio se cierra y archiva antes de generar el PNG, o se espera a que el PNG exista?** Recomendación: archivar tras completar código + tests + config; el PNG es asset visual y puede entregarse en un change posterior. Esto evita que un activo gráfico bloquee el flujo end-to-end.
- **Q3: ¿La entrada en `configs/hooks.json` debe incluir la nueva entrada `PostToolUse[matcher=TaskUpdate]` en el mismo bloque que la existente, o como bloque nuevo?** Claude Code soporta ambas formas (array de entradas); este diseño usa **bloque nuevo** (entrada independiente con su propio matcher) por claridad y para preservar el orden de evaluación. Confirmar si el instalador ya soporta este patrón (verificar `scripting/setup-hooks.ts` o equivalente).

## Migration Plan

1. **Pre-change:** ninguna acción requerida. El change es aditivo puro.
2. **Deploy:** merge del PR → instalación local con `npm run setup -- --hooks` → verificación manual con `TaskUpdate(in_progress)` → confirmación de toast.
3. **Rollback:** revertir el PR elimina el perfil del catálogo (los consumidores que dependan del perfil vuelven a `undefined` → `resolveEventImagePath` degrada a `ai-assistant.png`); eliminar la entrada `PostToolUse[matcher=TaskUpdate]` de `~/.claude/settings.json` con `npm run setup -- --hooks --uninstall` (reconoce el comando SCP por su path).
4. **Data migration:** ninguna.

## Verification

- `npm run test:quick` (lint + typecheck + unit tests del formatter) → verde.
- `npm run test` (integration tests del relay con casos `in_progress`/`completed`/`pending`/`deleted`/JSON-inválido/stdin-vacío) → verde.
- Smoke test manual: ejecutar `TaskUpdate` con cada `status` desde una sesión de Claude Code → confirmar que solo `in_progress` produce toast.
- Verificación visual del toast: título `TaskInProgress`, cuerpo `"Tarea iniciada: <subject>"` o `"Tarea iniciada"` (fallback).
- `npm run setup -- --hooks --dry-run` para confirmar que la nueva entrada se añade correctamente sin tocar entradas ajenas.
- `npm run notifications:register -- --install` para copiar el PNG a `%LOCALAPPDATA%\AIAssistant\events\` (si se creó el asset).
