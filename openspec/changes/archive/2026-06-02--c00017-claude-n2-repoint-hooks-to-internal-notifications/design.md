# Design: reapuntar los hooks al entry point del servicio interno

> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** n2 (N)

## Decisiones de diseño

### 1. Path del 2º comando en `.claude/settings.json`

El 2º comando de los 5 hooks con doble comando se reescribe con paths
**relativos** a la raíz del proyecto. Se usa `node
"./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts"`
seguido de los flags acordados. Esto evita acoplarse a la unidad
`C:\` (que cambia entre máquinas) y a un valor hardcodeado de
`$ANTHROPIC_BASE_URL` para el ejecutor de TypeScript.

Patrón (un comando por hook, idéntico salvo `--event-type` y, según el
caso, `--stdin-json`):

```text
node "./node_modules/tsx/dist/cli.mjs" "./src/2-services/notifications/cli.ts" --event-type <EventName> [--stdin-json]
```

Mapeo por hook:

| Hook | Event name pasado al CLI | `--stdin-json` |
|---|---|---|
| `UserPromptSubmit` | `UserPromptSubmit` | no (compat con H1) |
| `PreToolUse` | `PreToolUse` | sí (deriva título del payload) |
| `PostToolUse` | `PostToolUse` | sí |
| `Stop` | `Stop` | no |
| `StopFailure` | `StopFailure` | sí |

Nota: H1 ya pasó `--event-type UserPrompt` y `--event-type TurnIdle`
para `UserPromptSubmit` y `Stop` respectivamente (valores heredados del
script externo, no del lifecycle oficial). N2 los alinea con el nombre
real del evento del lifecycle porque el CLI ahora deriva el título de
`--event-type` cuando no se usa `--stdin-json` y eso da un toast más
informativo.

### 2. Hooks de 1 comando intactos

Los 3 hooks de 1 comando (`PostToolUseFailure`, `SubagentStart`,
`SubagentStop`) **no se tocan**. N1 nunca les añadió segundo comando y
N2 no introduce notificación para ellos (la correlación se cubre vía
`POST /hooks`).

### 3. Actualización de `docs/notifications.md`

La sección "Estado del script externo" se reescribe de:

- "queda intacto durante N1 (sigue siendo el destino de los hooks con
  doble comando en `.claude/settings.json` introducidos en H1). En N2
  se reapuntarán los hooks al entry point del repo y se documentará el
  script externo como `@deprecated` con fecha de retirada prevista."

a:

- `C:\AI\claude-code-notifications.ts` queda marcado como
  **`@deprecated`** con fecha de retirada prevista **2026-09-01**.
- A partir de N2, los hooks han dejado de invocarlo: el 2º comando de
  los 5 hooks con doble comando apunta al entry point del repo
  (`src/2-services/notifications/cli.ts`).
- La ruta final del CLI queda explícita y relativa a la raíz del
  proyecto: `./node_modules/tsx/dist/cli.mjs`
  `./src/2-services/notifications/cli.ts`.
- La eliminación efectiva del script externo está fuera del scope
  (vive fuera del repo).

### 4. Limpieza de `README.md`

- "Configuración de hooks": describe los comandos del entry point del
  repo, sin mencionar `C:\AI/...`.
- "Notifications": no menciona el path externo `C:\AI/...`; enlaza a
  `docs/notifications.md`.

### 5. Sync de `openspec/specs/hooks-lifecycle-correlation/spec.md`

La requirement "Doble comando en los 5 hooks con notificación previa" y
su scenario "Los 5 hooks con notificación disparan dos comandos en
orden" se modifican en bloque `MODIFIED`:

- Donde decía `C:\AI\claude-code-notifications.ts` ahora dice
  `src/2-services/notifications/cli.ts` (entry point del servicio
  migrado en el repo).
- La frase "el segundo comando que invoca el notificador externo
  `C:\AI\claude-code-notifications.ts`" pasa a "el segundo comando que
  invoca el entry point CLI del servicio de notificaciones migrado al
  repositorio (`src/2-services/notifications/cli.ts`)".
- El scenario "Los 5 hooks con notificación disparan dos comandos en
  orden" actualiza la consecuencia del 2º comando: SHALL ejecutarse el
  segundo comando que invoca el entry point del repo (no el script
  externo).

### 6. Política de paths relativos

Todos los paths del 2º comando se expresan relativos a la raíz del
proyecto (donde se ubica `.claude/settings.json`). Esto garantiza que el
reapuntamiento funciona independientemente de:

- La unidad donde se clone el repo (`C:\`, `D:\`, WSL, etc.).
- El sistema operativo (Windows, macOS, Linux) — `node` y `tsx`
  resuelven paths con forward slashes consistentemente.

### 7. Política de cableado al composition root

NO se cablea `DesktopNotificationAdapter` al composition root de
Fastify (`src/4-api/`) en N2. Justificación: el adaptador se creó en N1
sin consumidor real; cablearlo en N2 lo dejaría en una rama muerta
(módulo instanciado pero no usado). Queda para un change futuro con
consumidor real (p. ej. `audit-workflow.handler` o un nuevo servicio
que emita notificaciones de eventos del proxy).

## Archivos afectados

| Archivo | Tipo de cambio | Entra al commit |
|---|---|---|
| `.claude/settings.json` | 5 entradas (2º comando reescrito) | NO (`.gitignore` línea 29) |
| `openspec/specs/hooks-lifecycle-correlation/spec.md` | 1 requirement + 1 scenario modificados | SÍ (delta merge) |
| `docs/notifications.md` | Sección "Estado del script externo" reescrita | SÍ |
| `README.md` | 2 secciones revisadas | SÍ |
| `openspec/changes/claude-code-hooks-implementation/design.md` | Fila N2: `en curso` → `archivada` | SÍ |
| `openspec/changes/claude-code-hooks-implementation/tasks.md` | Tasks 3.1–3.10 marcadas [x] | SÍ |

## Validación

- `grep -F 'C:\AI' .claude/settings.json` retorna cero coincidencias.
- `npm run test:quick` verde.
- Smoke test manual: ejecutar Claude Code, disparar `UserPromptSubmit`+
  `Stop`, comprobar toast con título del evento y mensaje derivado del
  payload.
- `openspec validate claude-n2-repoint-hooks-to-internal-notifications`
  → success.
- `openspec validate --all` → success.
- phase_gate (skill `openspec-roadmap-manager`,
  args=`gate claude-n2-repoint-hooks-to-internal-notifications`) → PASS.
