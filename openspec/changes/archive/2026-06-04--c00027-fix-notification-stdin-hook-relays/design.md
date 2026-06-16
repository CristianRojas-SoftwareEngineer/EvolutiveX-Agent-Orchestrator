## Contexto

El patrón correcto ya existe para `Stop` (`stop-hook-ux.ts`): un proceso lee `stdin` una vez, reenvía al gateway y luego emite el toast. Varios hooks seguían el modelo antiguo de **dos comandos en el mismo array `hooks`**, que Claude Code ejecuta en paralelo. En Windows el pipe de stdin no se multiplexa: el JSON del hook se parte o queda vacío para el segundo proceso.

Los strings en Node ya son Unicode; el fallo observable («tildes mal») era **contenido corrupto o ausente en `prompt` / `questions`**, no un defecto de SnoreToast cuando el mensaje llega bien (como demuestra el relay de `Stop`).

## Objetivos de diseño

1. **Un lector de stdin por evento** que combine gateway + toast cuando ambos son necesarios.
2. **UTF-8 explícito** al decodificar stdin (`Buffer` → `toString('utf-8')`), igual que `post-hook-event.ts` y `stop-hook-ux.ts`.
3. **Mínima superficie**: reutilizar `buildEvent`, `DesktopNotificationAdapter` y `resolveHookNotificationMessage` sin duplicar formatters.

## Decisiones

### 1. `gateway-hook-notify.ts` (UserPromptSubmit, StopFailure)

- Parámetro `--event-type` acotado a un set permitido.
- Secuencia: `readStdinBuffer` → `postHookEvent(body)` → `JSON.parse` → `buildEvent({ stdinJson: true, ... })` → `notify`.
- Sustituye el par `post-hook-event` + `cli --stdin-json` en `configs/hooks.json`.

### 2. `pre-tool-use-hook-ux.ts` (PreToolUse, matcher `*`)

- Siempre `POST /hooks` (correlación de todas las tools).
- Toast solo si `resolveHookNotificationMessage('PreToolUse', payload)` devuelve texto (p. ej. `AskUserQuestion` con `questions`).
- Sustituye la segunda entrada `PreToolUse` / `AskUserQuestion` + el `post-hook-event` del matcher `*`, pasando de **dos bloques** a **uno**.

### 3. CLI `readStdin` alineado

- Sustituir `process.stdin.setEncoding('utf8')` por lectura binaria y `toString('utf-8')` para instalaciones que sigan invocando `cli.ts --stdin-json` directamente (`PermissionRequest`, pruebas manuales).

### 4. Instalador

- Añadir marcadores `gateway-hook-notify` y `pre-tool-use-hook-ux` a `isScpManagedCommand` y `validateScpRoot`.
- Builders opcionales en `gateway-hook-command.ts` para documentación y futuros generadores.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|-------------|-------------------|
| Mutex / archivo temporal compartido entre procesos | Complejidad y carreras en disco |
| Forzar `chcp 65001` en cada hook | No arregla stdin vacío entre procesos paralelos |
| Un solo relay genérico `--event-type` para todos los hooks | `PreToolUse` requiere toast condicional; `Stop` ya tiene relay propio con Haiku |

## Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Usuarios con settings antiguos | `setup:install -- --hooks` (documentado como BREAKING en proposal) |
| Specs decían «14 entradas» con `PreToolUse` duplicado | Delta actualiza inventario a **13 claves** en `settings.hooks` |
| `SubagentStart`/`SubagentStop` aún con doble comando | Aceptado; sin `--stdin-json`; riesgo menor; fuera de alcance |

## Verificación

- `npx vitest run tests/scripting/gateway-hook-notify.test.ts tests/scripting/pre-tool-use-hook-ux.test.ts tests/scripting/hooks-canonical-encoding.test.ts`
- Prueba manual: pipe UTF-8 a `gateway-hook-notify` / `pre-tool-use-hook-ux` y comprobar toast con «sesión», «configuración».
- `openspec validate fix-notification-stdin-hook-relays --strict`
