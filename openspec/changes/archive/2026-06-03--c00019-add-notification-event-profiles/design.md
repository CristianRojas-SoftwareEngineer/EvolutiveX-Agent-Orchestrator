## Context

El servicio `desktop-notifications-service` (ver `openspec/specs/desktop-notifications-service/`) expone un CLI invocado desde 11 hooks en `.claude/settings.json`. Tras `add-notifications-branding`:

- El **header** del toast en Windows depende de `register --install` (`ai-assistant.ico`, AUMID `AIAssistant.Proxy`).
- El **cuerpo** del toast usa el campo `icon` del evento, que hoy siempre resuelve a `ai-assistant.png` (o copia en `%LOCALAPPDATA%\AIAssistant\`).

Existen 11 PNG en `assets/notifications/events/` (uno por tipo de evento con notificación). El usuario quiere imagen y sonido distintos por evento sin duplicar rutas en cada hook.

Restricciones heredadas:

- PKA: el puerto no conoce rutas ni perfiles; el composition root del CLI ensambla el `NotificationEvent`.
- Windows: SnoreToast `-p` exige rutas locales ASCII-only (ver `asset-paths.ts` y `docs/notifications.md`).
- v1 del servicio excluyó `builders.ts` y JSON externo; este change mantiene esa línea con un catálogo tipado en TypeScript.

### Paridad con legacy (`claude-notifications-enhanced.ps1`)

El script legacy (BurntToast, solo Windows) define sonidos en `$DefaultEventConfig`. Mapeo a los `--event-type` actuales del repo:

| `--event-type` (repo) | Tipo legacy | Sonido legacy (BurntToast) | Notas |
|----------------------|-------------|---------------------------|--------|
| `SessionStart` | `SessionStart` | `Default` | Paridad directa |
| `SessionEnd` | `SessionEnd` | `Default` | Paridad directa |
| `UserPromptSubmit` | `UserPrompt` | `Reminder` | Hook renombrado |
| `Stop` | `TurnIdle` (`Waiting` alias) | `IM` | Fin de turno |
| `StopFailure` | `StopFailure` | `LoopingAlarm7` | Legacy usa toast corto con audio looping; SnoreToast puede no replicar el loop — aceptar `LoopingAlarm7` o `true` como string y documentar diferencia |
| `PermissionRequest` | `PermissionRequest` | `SMS` | Paridad directa |
| `PreToolUse` | `AskUserQuestion` | `SMS` | Solo matcher `AskUserQuestion` en settings |
| `TaskCompleted` | `ToolComplete` | `Default` | Hook renombrado |
| `SubagentStart` | — | `IM` | **Nuevo:** mismo tono que turno activo (spawn) |
| `SubagentStop` | — | `Default` | **Nuevo:** cierre neutro (análogo a `ToolComplete`) |
| `TaskCreated` | — | `Reminder` | **Nuevo:** análogo a inicio de trabajo (`UserPrompt`) |

Eventos legacy **sin** hook equivalente en settings actual (`Error` → `LoopingAlarm`, `Warning` → `SMS`, `Info` → `Default`): no entran al catálogo salvo como referencia futura.

## Goals / Non-Goals

**Goals:**

- Resolver imagen de cuerpo y sonido por `--event-type` (clave primaria) desde un único catálogo.
- Mantener overrides `--icon`, `--sound`, `--silent` y degradación con gracia (fallback a `ai-assistant.png`, sonido mudo si no hay perfil).
- Copiar PNGs de `events/` al cache ASCII en `register --install`.
- Tests unitarios del catálogo, resolución de rutas y ensamblado en `buildEvent`.

**Non-Goals:**

- `builders.ts` con lógica distinta de mensaje/título por evento.
- Archivos de sonido `.wav` versionados o subdirectorio `sound/`.
- Cambios en hooks de Claude Code o en el gateway.
- Separar `contentImage` de `icon` en el adaptador.
- Replicar en Linux tokens BurntToast (`SMS`, `LoopingAlarm7`) como strings ni el loop corto custom del script PowerShell.

**Goals (multiplataforma):**

- Misma imagen PNG por evento en los tres SO.
- Misma **intención** de sonido por evento (ver niveles semánticos en D4); implementación distinta por SO.

## Decisions

### D1. Catálogo tipado, no JSON ni `builders.ts`

Un único módulo `event-notification-profile.ts` exporta `EVENT_NOTIFICATION_PROFILES: Record<string, EventNotificationProfile>` con 11 entradas alineadas a los hooks que notifican.

- **Alternativa A (rechazada):** `--icon` y `--sound` en cada línea de `settings.json` — 11 duplicaciones, frágil en Windows.
- **Alternativa B (rechazada):** `builders.ts` con 11 funciones — sobredimensionado; mensajes ya vienen de flags/stdin.
- **Decisión:** catálogo + `buildEvent` ampliado; una función `getProfileForEvent(eventKey)`.

### D2. Clave de evento: `--event-type` primero, `hook_event_name` como respaldo

`resolveEventKey(options, stdinPayload)` devuelve `options.eventType` si está presente; si no, `stdinPayload.hook_event_name`.

Todos los hooks actuales pasan `--event-type`; el respaldo cubre invocaciones manuales o futuras sin flag.

`PreToolUse` en settings solo notifica con matcher `AskUserQuestion`; el perfil usa `pre-tool-use-ask.png` bajo la clave `PreToolUse`.

### D3. Resolución de imagen en dos niveles

`resolveEventImagePath(filename)`:

1. `%LOCALAPPDATA%\AIAssistant\events\<filename>` si existe.
2. `<repo-root>/assets/notifications/events/<filename>` si existe.
3. `undefined` → `resolveBranding` cae a `ai-assistant.png` (comportamiento actual).

Prioridad de `icon` en el evento:

1. `--icon` explícito.
2. PNG del perfil del evento (pasos 1–2).
3. `ai-assistant.png` estable o repo.

### D4. Sonido: perfil por plataforma, tipo `boolean | string`

`NotificationSoundProfile` define opciones por `darwin` / `win32` / `linux`. `resolveNotificationSound(profile, process.platform)` devuelve lo que `node-notifier` acepta.

**Windows (`win32`):** el campo del catálogo SHALL usar el **mismo token string** que el legacy BurntToast (`Default`, `Reminder`, `IM`, `SMS`, `LoopingAlarm7`, …) y pasarlo a `node-notifier.notify({ sound: '<token>' })` cuando el perfil no sea `false`. Esto maximiza paridad auditiva con `claude-notifications-enhanced.ps1` sin reimplementar BurntToast ni `LoopingAlarm` custom.

**macOS (`darwin`):** BurntToast no aplica; el catálogo define nombres del sistema de `node-notifier` (`Pop`, `Ping`, `Glass`, `Basso`, `Submarine`, `Tink`, …) **equivalentes semánticos** al token Windows:

| Token legacy (win32) | `darwin` propuesto |
|---------------------|-------------------|
| `Default` | `Tink` |
| `Reminder` | `Submarine` |
| `IM` | `Ping` |
| `SMS` | `Hero` |
| `LoopingAlarm7` | `Basso` |

**Linux (`linux`):** `node-notifier` delega en `notify-send`; no hay API portable equivalente a tokens BurntToast ni a nombres macOS. El catálogo SHALL usar solo **`true` o `false`** en `sound.linux`:

- `true` → el adaptador pasa `sound: true` a `node-notifier` (mejor esfuerzo: el entorno de escritorio reproduce el sonido de notificación por defecto si está configurado).
- `false` → mudo explícito (p. ej. override futuro o eventos diseñados sin audio).

**Paridad semántica con Windows/macOS:** todo evento cuyo legacy tenía sonido audible (`Silent = $false` en `$DefaultEventConfig`) SHALL tener `linux: true`, salvo decisión explícita de silencio. Los cinco niveles semánticos guían la consistencia:

| Nivel | Eventos (ejemplos) | win32 (token) | darwin | linux |
|-------|-------------------|---------------|--------|-------|
| `neutral` | `SessionStart`, `SessionEnd`, `SubagentStop`, `TaskCompleted` | `Default` | `Tink` | `true` |
| `message` | `UserPromptSubmit`, `TaskCreated` | `Reminder` | `Submarine` | `true` |
| `activity` | `Stop`, `SubagentStart` | `IM` | `Ping` | `true` |
| `attention` | `PreToolUse`, `PermissionRequest` | `SMS` | `Hero` | `true` |
| `alarm` | `StopFailure` | `LoopingAlarm7` | `Basso` | `true` |

`resolveNotificationSound` en `linux` SHALL devolver únicamente `boolean`; SHALL ignorar strings del perfil `win32`/`darwin` si se pasaran por error.

**Limitación aceptada:** en Linux el sonido depende del DE (GNOME, KDE, etc.) y de la configuración del usuario; `true` no garantiza audio audible, pero mantiene la misma *intención* que en Windows/macOS. No hay loop de alarma ni timbre distinto por token: `StopFailure` suena como notificación genérica si el DE lo permite.

Orden en `buildEvent`:

1. `--silent` → `sound: false`.
2. `--sound` explícito → `sound: true` (comportamiento legacy de flag booleano).
3. Perfil del evento vía resolvedor.
4. Si no hay perfil → `false` (mudo, como default actual).

El adaptador reenvía `sound` sin transformar salvo `silent: true` → `false`.

### D5. Inventario de módulos actualizado

Se añaden al directorio del servicio: `event-notification-profile.ts`, `event-image-paths.ts`, `resolve-notification-sound.ts`.

Se mantiene la exclusión de `builders.ts`, `config.ts` y `sound/` como subdirectorio de archivos de audio.

### D6. `register --install` copia el directorio `events/`

Reutilizar `copyFileIfChanged` (SHA-256) por cada `*.png` en `assets/notifications/events/` hacia `STABLE_EVENTS_DIR` (`%LOCALAPPDATA%\AIAssistant\events\`).

La idempotencia de `--install` SHALL considerar también el hash de los PNG en `events/` (además de `ai-assistant.ico` / `ai-assistant.png`): si un PNG del repo cambió, SHALL recopiarse.

No se copian sonidos (no hay archivos de audio en v1).

## Risks / Trade-offs

- **[R1] Linux: sonido best-effort** → Catálogo usa `linux: true` donde hay intención audible; documentar que `notify-send` no distingue `SMS` vs `Default`; smoke test opcional en entorno con audio de notificaciones habilitado.
- **[R2] `--sound` ya no significa “sonido del perfil”** → `--sound` fuerza `true` genérico; el perfil aplica solo sin flags de sonido. Documentar en docs.
- **[R3] Evento sin entrada en catálogo** → Fallback imagen `ai-assistant.png` y sonido mudo; no fallar el CLI.
- **[R4] PNG ausente en disco** → Mismo fallback que hoy para icono global.
- **[R5] Usuario no re-ejecuta `register --install` tras añadir PNGs** → Rutas del repo funcionan en Mac/Linux; en Windows con «ó» en la ruta del repo, conviene reinstalar o documentar el paso.

## Migration Plan

1. Implementar módulos y cambios en CLI/adaptador/register.
2. Los 11 PNG ya están en `assets/notifications/events/`; no hay migración de datos.
3. En Windows, tras desplegar: `npm run notifications:register -- --install` (recopia `events/` si cambió el hash).
4. **Rollback:** revertir commit; hooks sin cambios siguen funcionando con imagen/sonido global anterior.

## Open Questions

- Si SnoreToast ignora `LoopingAlarm7` como string, documentar fallback `sound: true` solo para `StopFailure` tras smoke test Windows.
- ¿Incluir `Stop` con `--stdin-json` en settings en una iteración futura? Fuera de scope; la clave de evento sigue siendo `--event-type Stop`.
