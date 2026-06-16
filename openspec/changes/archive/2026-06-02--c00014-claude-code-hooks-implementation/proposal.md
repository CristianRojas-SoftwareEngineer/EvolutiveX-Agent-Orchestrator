## Why

`server/logs.jsonl` acumula 256 warnings recurrentes originados en `src/3-operations/audit-workflow.handler.ts:604` (`[audit] No se encontró workflow padre para continuation — creando workflow standalone`) porque los hooks `SubagentStart`, `SubagentStop` y `PostToolUseFailure` nunca se disparan: el `AuditHookEventHandler` está preparado para recibirlos (ver `openspec/specs/hooks-lifecycle-correlation/spec.md`), pero `.claude/settings.json` del proyecto está vacío y `C:\Users\Cristian\.claude\settings.json` no los registra. En paralelo, el sistema de notificaciones de escritorio (`C:\AI\claude-code-notifications.ts` + `C:\AI\src/notifications/*`) vive fuera del versionado del repo, sin cobertura de tests y sin integración PKA, con riesgo de deriva. Ambos problemas comparten contención en `.claude/settings.json` y deben resolverse de forma coordinada para evitar estados intermedios inconsistentes.

## What Changes

- Introduce el marco de gobernanza que divide la solución en **3 fases iterativas-validadas** (H1, N1, N2) con DAG explícito y phase registry.
- Crea la capability `claude-code-hooks-implementation-governance` que define las reglas Given/When/Then que el roadmap SHALL cumplir.
- No implementa código de ninguna fase; cada fase se materializa en su propio L2 change (`claude-h1-register-missing-hooks`, `claude-n1-migrate-notifications-service`, `claude-n2-repoint-hooks-to-internal-notifications`).
- Reutiliza el patrón ya instituido por el orquestador archivado `gateway-migration` (2026-06-01): convención `claude-<phaseid>-<slug>`, back-reference en `proposal.md` de cada L2, phase registry en `design.md`, tasks de gobernanza en `tasks.md`.

## Capabilities

### New Capabilities

- `claude-code-hooks-implementation-governance`: marco normativo que regula cómo se ejecuta el alineamiento entre configuración de hooks y migración de notificaciones — división en fases, materialización por L2 change, Definition of Done por fase, gate de dependencias, registro de estados, política de reducción de legacy/zombie, contrato de hooks y contrato del servicio de notificaciones.

### Modified Capabilities

_(ninguna — este orquestador no modifica comportamiento acordado existente en `openspec/specs/`. Los deltas de comportamiento sobre `hooks-lifecycle-correlation` (contrato de configuración de hooks) y los deltas sobre una eventual spec `desktop-notifications` (contrato del servicio) se materializarán en los L2 `claude-h1-register-missing-hooks` y `claude-n1-migrate-notifications-service` respectivamente.)_

## Impact

- `openspec/changes/claude-code-hooks-implementation/phases/`: tres L2 changes (`claude-h1-…`, `claude-n1-…`, `claude-n2-…`) creados de forma incremental al iniciar cada fase; el registro los enumera pero los directorios no existen hasta su turno.
- `.claude/settings.json` del proyecto: registrado por H1 con las 8 entradas del lifecycle (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`), sobrescribiendo el user-level config para esas claves. Cada entrada incluye `POST /hooks`; los 5 hooks que tenían notificación en user-level (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`) conservan el comando de notificación apuntando a `C:\AI\claude-code-notifications.ts` hasta N2. Los matchers de `PreToolUse` y `PostToolUse` se amplían a `*` para que el gateway reciba los eventos de todas las tools. Modificado de nuevo por N2 (reapunta los comandos de notificación al entry point del servicio migrado).
- `src/2-services/notifications/`: nuevo directorio creado por N1, conteniendo en su primera versión simplificada: `INotificationService.ts` (capa 1), `DesktopNotificationAdapter.ts` (capa 2), `types.ts`, `index.ts` y entry point CLI. **Sin** `config.ts` (sin JSON externo), **sin** `builders.ts` (sin construcción específica por evento), **sin** `sound/` (sin perfiles OS-specific), **sin** `windows-toast.ts` (sin SnoreToast/AUMID/.lnk) — la primera versión descarta intencionalmente la lógica de personalización de imagen, icono, título y las dependencias Windows-specific de la implementación previa en `C:\AI\`.
- `package.json`: N1 añade `commander` y `node-notifier` como dependencias (ya presentes en `C:\AI/package.json`).
- `docs/`:
  - H1 actualiza `README.md` §setup y `docs/gateway-architecture.md` §18 (si documenta config de hooks).
  - N1 crea `docs/notifications.md` con la API del servicio, entry point CLI y contrato del puerto.
  - N2 actualiza `docs/notifications.md` con la ruta final del entry point.
- **`server/logs.jsonl`**: H1 elimina la recurrencia de los 256 warnings de correlación incompleta durante una sesión de prueba, al recibir el gateway el lifecycle completo (los 8 eventos con correlación determinista de workflows, steps, tools, agentes y subagentes).
- **PKA por bloque:**
  - H1: ningún código PKA (cambio de configuración).
  - N1: capa 1 (puerto `INotificationService`) → capa 2 (`DesktopNotificationAdapter`) → capa 4 (composition root + entry point CLI). Componentes `config`, `builders`, `sound/` y toda la capa Windows-specific (SnoreToast, AUMID, `.lnk`, `heroImage`) quedan descartados en v1 por decisión de scope.
  - N2: ningún código PKA (cambio de configuración).
- **`C:\AI\claude-code-notifications.ts`**: queda intacto durante H1 y N1; N2 lo marca como deprecado con fecha de retirada. No se elimina en este roadmap.

## No objetivos

- No implementa código de ninguna fase (gobernanza pura).
- No elimina `C:\AI\claude-code-notifications.ts` ni sus dependencias; queda como fallback deprecado al cierre del roadmap, con retirada efectiva diferida a un change posterior.
- No configura hooks adicionales no relacionados con la correlación (p. ej. matchers para `PreToolUse` en otros tools, `PostToolUse` con `matcher` distinto a `Write|Edit`).
- No crea adaptadores de notificación alternativos (`SlackNotificationAdapter`, `EmailNotificationAdapter`); el prefijo `Desktop` deja la puerta abierta pero su implementación queda fuera de alcance.
- No modifica el handler `AuditHookEventHandler` ni el endpoint `POST /hooks`; la implementación de correlación ya está en sitio (fases C3 y G2 del roadmap `gateway-migration` archivado). El orquestador solo cubre la capa de configuración que dispara el handler.
- No toca `src/`, `tests/` ni `sessions/` como parte del orquestador.
- No crea los 3 L2 changes de antemano; el registro los enumera y se materializan al iniciar cada fase.
