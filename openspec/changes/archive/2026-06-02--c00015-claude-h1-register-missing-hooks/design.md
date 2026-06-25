## Context

El gateway HTTP (`src/`) procesa hoy el tráfico `wire` (plano A/B) y mantiene un correlador de workflows en `src/3-operations/audit-workflow.handler.ts`. La spec canónica `openspec/specs/hooks-lifecycle-correlation/spec.md` describe el endpoint `POST /hooks`, el parsing puro del evento (`parseHookEvent` en capa 1) y el despacho al `AuditHookEventHandler` (capa 3), pero los hooks que disparan ese endpoint **no están configurados en `.claude/settings.json`** del proyecto. El archivo del proyecto está vacío (`{}`) y el de usuario (`C:\Users\user\.claude\settings.json`) tiene notificaciones para 5 eventos pero ningún enrutamiento a `POST /hooks`. Resultado: el `AuditHookEventHandler` recibe solo los eventos que disparan los hooks del user-level (que no llegan al gateway porque no invocan `POST /hooks`), por lo que la heurística de correlación queda incompleta y `audit-workflow.handler.ts:604` emite el warning `[audit] No se encontró workflow padre para continuation` recurrentemente (256 ocurrencias acumuladas en `server/logs.jsonl`).

H1 cierra la primera mitad del problema: registra las 8 entradas del lifecycle en `.claude/settings.json` del proyecto, sobrescribiendo el user-level para esas claves, y enrutando cada evento al endpoint `POST /hooks` del proxy. La segunda mitad (migrar el notificador al repo y reapuntar los hooks) la cubren N1 y N2.

## Goals / Non-Goals

**Goals:**

- Configurar las 8 entradas del lifecycle en `.claude/settings.json` del proyecto de forma que cada una dispare un `POST $ANTHROPIC_BASE_URL/hooks` con el payload JSON del evento por stdin.
- Sobrescribir las 5 entradas que el user-level tiene configuradas (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`), conservando el segundo comando de notificación apuntando a `C:\AI\claude-code-notifications.ts` para no romper la UX actual hasta N2.
- Ampliar los matchers de `PreToolUse` y `PostToolUse` a `*` para que el gateway reciba los eventos de todas las tools.
- Documentar la nueva config en `README.md` §setup.
- Alinear `docs/gateway-architecture.md` §18 (si documenta config de hooks) con el estado real.
- Verificar con un smoke test operacional que `server/logs.jsonl` deja de contener el warning de correlación durante una sesión que dispare los 8 eventos.

**Non-Goals:**

- No implementa el servicio de notificaciones en el repo (eso es N1).
- No reapunta los 5 comandos de notificación al entry point del repo (eso es N2).
- No elimina `C:\AI\claude-code-notifications.ts`.
- No crea `src/`, `tests/` ni nuevos archivos de spec canónica; H1 solo modifica deltas en `openspec/specs/hooks-lifecycle-correlation/`.
- No añade dependencias a `package.json` (H1 no requiere `node-notifier`, `commander` ni nada nuevo; usa `curl`, presente en Windows 10+ y macOS/Linux).

## Decisions

### Comando del hook: `curl` con `$ANTHROPIC_BASE_URL`

**Decisión:** Cada hook invoca `curl -sS -X POST $ANTHROPIC_BASE_URL/hooks -H 'Content-Type: application/json' --data-binary @-`.

**Rationale:** `curl` está disponible en Windows 10+, macOS y Linux sin instalación adicional. La URL del proxy se resuelve vía `$ANTHROPIC_BASE_URL` (variable ya presente en el user-level `settings.json` con valor `http://127.0.0.1:8787`) para no acoplar el comando a un host:puerto literal. `--data-binary @-` lee el payload JSON del hook desde stdin (Claude Code lo pasa por stdin al comando del hook), preservando los caracteres Unicode sin alteraciones de parsing.

**Alternativa rechazada:** PowerShell `Invoke-RestMethod` — solo funciona en Windows; rompe cross-platform. `node` con `fetch` — añade dependencia y complejidad; innecesario para un POST JSON simple.

### Las 8 entradas a nivel de proyecto sobrescriben el user-level

**Decisión:** Las 8 entradas se registran en `.claude/settings.json` del proyecto, no en `C:\Users\user\.claude\settings.json`. Las entradas del proyecto tienen precedencia sobre el user-level para las claves presentes (mecanismo de merge de Claude Code).

**Rationale:** El proyecto debe ser self-contained y versionable. La config de hooks es una decisión del proyecto, no del usuario. Las 5 entradas con notificación previa en user-level se reescriben a nivel de proyecto con el contrato ampliado: cada una lleva un comando `POST /hooks` (nuevo) más el comando de notificación al `C:\AI\...` (conservado del user-level).

**Consecuencia deliberada:** el user-level deja de ser la fuente de config de hooks para Smart Code Proxy. Esto es aceptable porque el proyecto define su propio contrato y versiona la config.

### 5 entradas con doble comando (POST /hooks + notificación externa)

**Decisión:** `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure` llevan un array `hooks` con dos comandos. Los otros 3 (`SubagentStart`, `SubagentStop`, `PostToolUseFailure`) llevan un array con un único comando `POST /hooks`.

**Rationale:** Los 5 hooks con doble comando son los que el user-level ya tenía configurados con notificación. Mantener esa notificación evita un cambio de UX (el usuario dejaba de recibir toasts) durante H1; el reapuntamiento al servicio del repo se delega a N2. Los 3 hooks nuevos no llevan notificación porque ningún user-level la tenía definida y la primera versión del servicio (N1) se enfoca en la migración, no en ampliar la cobertura de notificaciones.

### Matchers `*` en `PreToolUse` y `PostToolUse`

**Decisión:** `"matcher": "*"` en ambas entradas.

**Rationale:** El user-level tiene matchers estrechos (`AskUserQuestion` en `PreToolUse`, `Write|Edit` en `PostToolUse`) que filtran qué tools disparan el hook. Para que el gateway correlacione el 100% de las invocaciones de tools (no solo `AskUserQuestion` o `Write|Edit`), los matchers deben ser `*`. Esto es coherente con la spec canónica, cuyo contrato dice que el handler debe recibir los eventos de todas las tools.

**Alternativa rechazada:** mantener los matchers del user-level — dejaría al gateway sin visibilidad sobre la mayoría de las tools, perpetuando el problema de correlación incompleta.

### Sin tocar `src/` en H1

**Decisión:** H1 no crea ni modifica archivos en `src/`, `tests/` ni `sessions/`. Solo edita `.claude/settings.json` y `docs/`.

**Rationale:** La implementación del handler (`AuditHookEventHandler`, `parseHookEvent`) ya existe y está validada por el roadmap archivado `gateway-migration` (fases C3 y G2). H1 solo cubre la capa de configuración que dispara el handler. Mantener H1 sin código PKA reduce el riesgo y el scope del gate.

## Risks / Trade-offs

- **R1 — El user-level podría tener matchers distintos que entren en conflicto** → Mitigation: el merge de Claude Code toma el del proyecto para las claves presentes; los matchers del user-level se ignoran para `PreToolUse` y `PostToolUse` mientras H1 esté en efecto. Si el operador quiere los matchers estrechos, debe editar el proyecto.
- **R2 — El `phase_gate` requiere un smoke test operacional con sesión de Claude Code** → Mitigation: el smoke test es manual; el criterio es que `server/logs.jsonl` no acumule el warning durante una sesión representativa. Si el smoke test no es ejecutable en el entorno actual, se documenta en `docs/h1-smoke-test-log.md` con la sesión realizada.
- **R3 — Los 5 hooks con doble comando disparan dos procesos por evento** → Mitigation: aceptable a corto plazo; N2 elimina el segundo comando. La latencia añadida es despreciable (notificación en background).
- **R4 — `curl` no está en el PATH en algunas instalaciones mínimas de Windows** → Mitigation: Windows 10+ incluye `curl.exe` por defecto; las builds de Windows 11 que usa el operador lo tienen. Si en el futuro algún entorno carece de `curl`, el comando puede sustituirse por PowerShell `Invoke-RestMethod` con sintaxis cross-platform o por un binario en el repo.
- **R5 — El DTO del payload que Claude Code pasa al hook no es 100% estable** → Mitigation: el handler `parseHookEvent` (capa 1) ya valida y normaliza el payload en `gateway-migration` fase C3. H1 no introduce schema nuevo; reutiliza el contrato existente de `hooks-lifecycle-correlation`.
