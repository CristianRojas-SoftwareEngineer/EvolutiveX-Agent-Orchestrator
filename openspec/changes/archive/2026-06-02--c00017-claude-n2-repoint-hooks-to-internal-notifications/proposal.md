# Proposal: reapuntar los hooks al entry point del servicio de notificaciones interno

> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** n2 (N)

## Why

En H1 se registraron las 8 entradas del lifecycle de hooks en
`.claude/settings.json` del proyecto y, para los 5 hooks con notificación
previa (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
`StopFailure`), se añadió un segundo comando apuntando al script externo
`C:\AI\claude-code-notifications.ts`. En N1 ese sistema de notificaciones
se migró al repositorio bajo `src/2-services/notifications/`. Los hooks
siguen apuntando a la ruta absoluta externa, lo que deja al sistema con
dos implementaciones en paralelo y al proxy desconectado de su propio
servicio. Esta fase reapunta los 5 segundos comandos al entry point
interno, completa el ciclo de configuración y deja el script externo
explícitamente `@deprecated`.

## What Changes

- Reemplazar el 2º comando de los 5 hooks con doble comando
  (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
  `StopFailure`) en `.claude/settings.json` por el entry point CLI del
  servicio migrado, resuelto con paths **relativos** a la raíz del
  proyecto.
- Actualizar la spec canónica `hooks-lifecycle-correlation`: la
  requirement "Doble comando en los 5 hooks con notificación previa" y
  su scenario pasan a nombrar el entry point del repo, no
  `C:\AI\claude-code-notifications.ts`.
- Documentar `C:\AI\claude-code-notifications.ts` como `@deprecated` con
  fecha de retirada prevista 2026-09-01 en `docs/notifications.md`.
- Limpiar las menciones residuales a `C:\AI/...` en `README.md`
  (sección "Configuración de hooks" describe los comandos del repo;
  sección "Notifications" deja de nombrar el path externo).
- Sin tocar `src/` (N2 es config + docs + spec).

## Capabilities

### New Capabilities
- (ninguna)

### Modified Capabilities
- `hooks-lifecycle-correlation`: la requirement "Doble comando en los 5
  hooks con notificación previa" y su scenario dejan de nombrar
  `C:\AI\claude-code-notifications.ts` y pasan a nombrar el entry point
  CLI del servicio migrado (`src/2-services/notifications/cli.ts`),
  invocado con paths relativos a la raíz del proyecto.

## Impact

- `.claude/settings.json` (5 entradas modificadas, 3 intactas). El
  archivo está en `.gitignore` (línea 29), por lo que el cambio no entra
  al commit; queda solo en el working tree del usuario.
- `openspec/specs/hooks-lifecycle-correlation/spec.md` (1 requirement
  + 1 scenario actualizados).
- `docs/notifications.md` (sección "Estado del script externo"
  reescrita).
- `README.md` (sección "Configuración de hooks" y "Notifications"
  revisadas).
- `openspec/changes/claude-code-hooks-implementation/design.md` y
  `tasks.md` (N2 marcado como `en curso` → `archivada`; tasks 3.1–3.10
  marcadas [x]).
- `C:\AI\claude-code-notifications.ts`: intacto, no se elimina (vive
  fuera del repo y la eliminación efectiva queda fuera de scope).
- PKA: no se toca código PKA (cambio de configuración, spec y docs).

## No objetivos

- No cablear `DesktopNotificationAdapter` al composition root de Fastify
  (queda para un change futuro con consumidor real).
- No eliminar `C:\AI\claude-code-notifications.ts` (queda como
  `@deprecated` con fecha; la eliminación efectiva está fuera del scope
  del roadmap).
- No introducir nuevos hooks ni modificar los matchers de
  `PreToolUse`/`PostToolUse` (siguen en `*` desde H1).
- No añadir nuevos adaptadores de notificación (Slack, email) — el
  alcance se mantiene en `Desktop`.
- No tocar `src/2-services/notifications/` (N2 es config + docs + spec).
