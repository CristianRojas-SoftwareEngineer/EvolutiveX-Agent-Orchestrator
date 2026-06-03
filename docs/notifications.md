# Servicio de notificaciones de escritorio

> Servicio migrado al repositorio en la fase N1 del roadmap
> `claude-code-hooks-implementation`. Reemplaza — funcionalmente — al
> script externo `C:\AI\claude-code-notifications.ts`, que queda intacto
> durante N1 como fallback y será marcado `@deprecated` en N2. La
> cobertura actual de `.claude/settings.json` (14 entradas) usa este
> servicio para todas las notificaciones de UX desde el repositorio.

## Propósito

Permitir que un hook de Claude Code (u otro llamante del repo) emita un
toast nativo del sistema operativo (Windows, macOS, Linux) con un título y
un mensaje, opcionalmente con sonido. La primera versión (`v1`) es
deliberadamente mínima: no admite personalización visual, no carga
configuración externa, y no introduce dependencias Windows-specific.

## Componentes

| Archivo (en `src/2-services/notifications/`) | Capa PKA | Rol |
|---|---|---|
| `types.ts` | 1 (tipos puros) | `NotificationEvent`, `EventType` |
| `INotificationService.ts` | 1 (puerto) | Interfaz del servicio (un único método `notify`) |
| `DesktopNotificationAdapter.ts` | 2 (adaptador concreto) | Implementa el puerto delegando en `node-notifier.notify()` |
| `index.ts` | 2 (exports) | Re-exports públicos del paquete |
| `cli.ts` | 4 (composition root standalone) | Entry point CLI invocable desde hooks de Claude Code |

## Puerto: `INotificationService`

```ts
interface INotificationService {
  notify(event: NotificationEvent): Promise<void> | void;
}

interface NotificationEvent {
  title: string;
  message: string;
  sound?: boolean;   // default: false
  silent?: boolean;  // default: false; si true, fuerza sound=false
}
```

El puerto no expone `icon`, `image`, `appId`, `subtitle`, `category`,
`urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`, ni
`heroImage`. Cualquier extensión futura al contrato del puerto se
realizará en un change posterior.

## Adaptador: `DesktopNotificationAdapter`

Delegación en `node-notifier.notify()` con el siguiente subset exacto de
opciones:

```ts
nodeNotifier.notify({
  title: event.title,
  message: event.message,
  sound: event.silent === true ? false : event.sound ?? false,
  wait: false,
});
```

El adaptador **NO** pasa `icon`, `contentImage`, `appId`, `appIdPath`,
`subtitle`, `category`, `urgency`, `actions`, `open`, `closeLabel`,
`timeout` personalizados, `heroImage`, `defaultIcon`, ni `brandTitle`.
Tampoco invoca `SnoreToast`, no accede a archivos `.lnk` y no registra
AUMID.

## Entry point CLI

El CLI (`src/2-services/notifications/cli.ts`) acepta los siguientes
flags (vía `commander`):

| Flag | Descripción |
|---|---|
| `--event-type <type>` | Tipo de evento del lifecycle (`UserPromptSubmit`, `PreToolUse`, …) |
| `--message <msg>` | Cuerpo del toast |
| `--title <title>` | Título del toast (opcional; por defecto, igual a `--event-type`) |
| `--sound` | Reproducir sonido del SO |
| `--silent` | Silenciar el toast (contradice `--sound`) |
| `--stdin-json` | Leer payload JSON de `stdin`; derivar `title` de `hook_event_name` |

### Ejemplos

```bash
# Toast directo con tipo y mensaje
node src/2-services/notifications/cli.ts --event-type Stop --message "Listo"

# Toast desde payload de hook por stdin
echo '{"hook_event_name":"PostToolUse","session_id":"abc"}' \
  | node src/2-services/notifications/cli.ts --stdin-json

# Toast silencioso
node src/2-services/notifications/cli.ts --event-type UserPromptSubmit --message "Hola" --silent
```

### Códigos de salida

| Código | Significado |
|---|---|
| `0` | Toast emitido correctamente |
| `1` | Error: payload inválido, falta de flags requeridos, fallo de `node-notifier`, etc. |

Los errores se imprimen en `stderr`.

## Exclusiones explícitas de v1

La primera versión **NO** incluye ninguno de los siguientes elementos del
sistema externo `C:\AI\claude-code-notifications.ts` (decisión tomada en
exploración previa al L1 y formalizada en la spec
`desktop-notifications-service`):

- **`config.ts`** ni carga de `JSON` externo (p. ej.
  `notifications-config.json`). La configuración es por código.
- **`builders.ts`** (sin lógica de construcción de payload específica
  por tipo de evento).
- **Subdirectorio `sound/`** ni perfiles de sonido OS-specific
  (`resolve.ts`, `token-to-profile.ts`, `windows.ts`, `darwin.ts`,
  `linux.ts`).
- **`windows-toast.ts`** (sin registro de SnoreToast, sin AUMID, sin
  `.lnk`, sin `heroImage`).
- **Personalización visual** (sin `icon`, sin `appId`, sin
  `defaultIcon`, sin `brandTitle`).
- **Acceso a `C:\AI/`** desde el servicio.

Si en el futuro se necesita alguna de estas capacidades, se introducirá
en un change posterior sin romper el contrato actual del puerto.

## Estado del script externo

`C:\AI\claude-code-notifications.ts` está marcado como **`@deprecated`**
con fecha de retirada prevista **2026-09-01**. A partir de la fase N2
del roadmap `claude-code-hooks-implementation`, los hooks con doble
comando en `.claude/settings.json` han dejado de invocarlo: el 2º
comando de los **5 hooks de lifecycle con notificación**
(`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`,
`StopFailure`) apunta al entry point CLI del servicio migrado al
repositorio, no al script externo. Las notificaciones de UX restantes
(`SessionStart`, `SessionEnd`, `PermissionRequest`,
`PreToolUse:AskUserQuestion`, `TaskCreated`, `TaskCompleted`) también
apuntan al servicio migrado (ver "Notificaciones de UX no-lifecycle"
más abajo).

**Ruta final del CLI** (relativa a la raíz del proyecto):

```text
./node_modules/tsx/dist/cli.mjs ./src/2-services/notifications/cli.ts
```

**Comando canónico por hook (14 entradas: 8 del lifecycle + 6 de UX):**

| Hook | Matcher | Comando(s) |
|---|---|---|
| `UserPromptSubmit` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type UserPromptSubmit --stdin-json` |
| `PreToolUse` | `*` | `POST /hooks` (sin notificación; ver justificación abajo) |
| `PreToolUse` | `AskUserQuestion` | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type PreToolUse --stdin-json` |
| `PostToolUse` | `*` | `POST /hooks` (sin notificación; ver justificación abajo) |
| `PostToolUseFailure` | — | `POST /hooks` |
| `SubagentStart` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SubagentStart --message "Subagente iniciado"` |
| `SubagentStop` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SubagentStop --message "Subagente terminado"` |
| `Stop` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type Stop --stdin-json` |
| `StopFailure` | — | `POST /hooks` + `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type StopFailure --stdin-json` |
| `SessionStart` | `startup|resume` | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SessionStart --message "Sesión iniciada"` |
| `SessionEnd` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type SessionEnd --message "Sesión finalizada"` |
| `PermissionRequest` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type PermissionRequest --stdin-json` |
| `TaskCreated` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type TaskCreated --message "Tarea creada"` |
| `TaskCompleted` | — | `node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type TaskCompleted --message "Tarea completada"` |

**Justificación de `PreToolUse` / `PostToolUse` sin notificación:** los
eventos de tool tienen frecuencia alta (5–50 invocaciones por turno en
sesiones largas). El gateway necesita `matcher: "*"` para correlacionar
todas las tools, pero un toast por cada invocación es ruido de UX, no
señal. La notificación se mantiene en las claves de lifecycle
(`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`,
`StopFailure`), donde un único toast por evento aporta valor (inicio
del turno, spawn de subagente, cierre de subagente, cierre del turno,
error de cierre). Para una notificación restringida a `PreToolUse:AskUserQuestion`
se declara una **segunda entrada** bajo la misma clave `PreToolUse` con
matcher específico (mecanismo nativo de Claude Code: una misma clave
admite múltiples entradas con matchers distintos).

### Notificaciones de UX no-lifecycle

Las 6 entradas `SessionStart`, `SessionEnd`, `PermissionRequest`,
`PreToolUse:AskUserQuestion`, `TaskCreated` y `TaskCompleted` **no
invocan** `POST /hooks`: el `AuditHookEventHandler` solo procesa los 8
`eventName` del lifecycle (`UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`,
`Stop`, `StopFailure`); el resto cae en `default:` y se descarta.
Enviar `POST /hooks` desde estas claves sería ancho de banda
desperdiciado.

> **Nota sobre `TaskCreated` / `TaskCompleted`:** son hooks nativos de
> Claude Code confirmados en
> [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
> (parte del catálogo de eventos del lifecycle). El `AuditHookEventHandler`
> del gateway no los procesa (su `switch` solo cubre los 8 del lifecycle
> de correlación), por lo que son puramente UX, ortogonales al gateway.
> Estos hooks no admiten campo `matcher` (la documentación oficial indica
> que se ignora silenciosamente para estos eventos); las entradas omiten
> el campo. En v1 se usa texto fijo `--message "<fijo>"`. En sesiones con
> planificación activa (p. ej. `/openspec-new`, `/openspec-apply`),
> `TaskCreate` y `TaskUpdate(status=completed)` disparan múltiples toasts
> por turno; el usuario asume este trade-off a cambio de feedback
> explícito del avance de tareas. Si el ruido resulta excesivo, la única
> mitigación nativa es retirar las entradas (no hay filtrado parcial sin
> throttling/dedupe en el CLI).

### Uso de `--stdin-json` por entrada

| Entrada | `--stdin-json` | Justificación |
|---|---|---|
| `UserPromptSubmit` | Sí | El payload trae `session_id` y `prompt`; el CLI deriva un `message` informativo. |
| `SubagentStart` | No | Texto fijo `--message "Subagente iniciado"`; el payload no aporta `agent_type`/`agent_id` útil para derivar un `message` diferenciado en v1. |
| `SubagentStop` | No | Texto fijo `--message "Subagente terminado"`; mismo razonamiento que `SubagentStart`. |
| `PreToolUse` (matcher `AskUserQuestion`) | Sí | El payload trae `session_id`. |
| `Stop` | No | El `eventName` viene del flag; el `--message` se omite y se deriva del payload por defecto cuando no hay flag. |
| `StopFailure` | Sí | Útil para incluir contexto del error en el `message`. |
| `SessionStart` | No | El `eventName` viene del flag; se pasa `--message "Sesión iniciada"` como texto fijo (el CLI exige `--message` cuando no se usa `--stdin-json`). |
| `SessionEnd` | No | Igual que `SessionStart`; texto fijo `--message "Sesión finalizada"`. |
| `PermissionRequest` | Sí | El payload trae `tool_name` y `tool_input`. |
| `TaskCreated` | No | Texto fijo `--message "Tarea creada"`; los hooks `TaskCreated`/`TaskCompleted` no soportan matcher y el payload no se aprovecha en v1. |
| `TaskCompleted` | No | Texto fijo `--message "Tarea completada"`. |

> **Nota:** `Stop` se invoca sin `--stdin-json` en la configuración
> actual del proyecto. Si en el futuro se desea derivar el `message`
> desde el payload (p. ej. con `last_assistant_message`), añadir el
> flag en `.claude/settings.json` y verificar que `--event-type Stop`
> sigue presente para preservar el título del toast.

### Override del user-level

Las 6 entradas de UX (`SessionStart`, `SessionEnd`, `PermissionRequest`,
`PreToolUse:AskUserQuestion`, `TaskCreated`, `TaskCompleted`) declaradas
en `.claude/settings.json` del proyecto **sobrescriben** las entradas
equivalentes del user-level (`C:\Users\Cristian\.claude\settings.json`)
para esas claves. Es la regla nativa de merge de Claude Code:
project-level sobrescribe user-level por clave completa, no por comandos
dentro de la clave.

Implicaciones operativas dentro de este repositorio:

1. Las notificaciones de UX pasan a ser responsabilidad del proyecto;
   las del user-level **no se ejecutan** cuando Claude Code corre
   bajo este directorio.
2. La cobertura del ciclo de vida completo de una sesión (arranque,
   permission prompt, AskUserQuestion, spawn/cierre de subagente,
   creación/completado de tareas, cierre) queda servida desde el
   servicio migrado al repo, sin depender de `C:\AI\claude-code-notifications.ts`.
3. Cuando el script externo se retire el **2026-09-01**, el proyecto
   no pierde notificaciones: ya está autosuficiente. Otros directorios
   del usuario sí dependerán del reemplazo definitivo del user-level
   (fuera del scope de este repo).

El hook `SubagentStart` / `SubagentStop` también pasa a ser
responsabilidad del proyecto (el user-level podría tener un comando de
notificación que ahora se descarta); al pasar de "solo `POST /hooks`" a
"`POST /hooks` + notificación", el proyecto absorbe la responsabilidad
completa del spawn/cierre de subagentes en este directorio.

El hook `PostToolUseFailure` y los 2 hooks de tool (`PreToolUse`
matcher `*`, `PostToolUse` matcher `*`) conservan únicamente el comando
`POST /hooks` (sin segundo comando de notificación).

El script externo `C:\AI\claude-code-notifications.ts` se mantiene
intacto en el sistema de archivos del usuario; la eliminación efectiva
queda fuera del scope de este roadmap (vive fuera del repositorio y no
es versionable aquí). El plazo de deprecación de **3 meses** desde N2
(2026-06-02 → 2026-09-01) da margen para migrar cualquier llamante
externo que aún dependa del script.

## Restricción operativa: `.claude/` está en `.gitignore`

El archivo `.claude/settings.json` del proyecto **no entra en commits**
(línea 29 del `.gitignore`). Esto significa que:

- El archivo se mantiene por instalación local; quien clone el repo
  no recibe la configuración de hooks automáticamente.
- La materialización local debe reproducir el contrato descrito en
  esta página y en la spec `hooks-lifecycle-correlation`.
- Cualquier cambio a la cobertura (añadir/quitar entradas, cambiar
  matchers) se documenta primero en spec y docs; el archivo local
  se sincroniza después.

## Spec canónica

`openspec/specs/desktop-notifications-service/spec.md` — fuente de
verdad del contrato del servicio y de las exclusiones de v1.

`openspec/specs/hooks-lifecycle-correlation/spec.md` — fuente de
verdad del contrato del `.claude/settings.json` del proyecto
(8 entradas del lifecycle + 6 entradas de UX no-lifecycle = 14 entradas
totales).
