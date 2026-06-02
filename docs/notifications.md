# Servicio de notificaciones de escritorio

> Servicio migrado al repositorio en la fase N1 del roadmap
> `claude-code-hooks-implementation`. Reemplaza — funcionalmente — al
> script externo `C:\AI\claude-code-notifications.ts`, que queda intacto
> durante N1 como fallback y será marcado `@deprecated` en N2.

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

`C:\AI\claude-code-notifications.ts` queda intacto durante N1 (sigue
siendo el destino de los hooks con doble comando en `.claude/settings.json`
introducidos en H1). En N2 se reapuntarán los hooks al entry point del
repo y se documentará el script externo como `@deprecated` con fecha de
retirada prevista. La eliminación efectiva del script externo está fuera
del scope de este roadmap (vive fuera del repo).

## Spec canónica

`openspec/specs/desktop-notifications-service/spec.md` — fuente de
verdad del contrato del servicio y de las exclusiones de v1.
