# Tasks: reapuntar los hooks al entry point del servicio interno

> **Orquestador:** `claude-code-hooks-implementation` | **Fase:** n2 (N)

## 1. Reapuntamiento de los 5 segundos comandos en `.claude/settings.json`

- [ ] 1.1 Reescribir el 2º comando de `UserPromptSubmit` con paths
  relativos al entry point CLI del repo y `--event-type
  UserPromptSubmit` (alineado con el nombre real del lifecycle; en H1
  se había quedado en `UserPrompt` por compatibilidad con el script
  externo).
- [ ] 1.2 Reescribir el 2º comando de `PreToolUse` con paths relativos
  y `--event-type PreToolUse --stdin-json`.
- [ ] 1.3 Reescribir el 2º comando de `PostToolUse` con paths relativos
  y `--event-type PostToolUse --stdin-json`.
- [ ] 1.4 Reescribir el 2º comando de `Stop` con paths relativos y
  `--event-type Stop` (en H1 era `TurnIdle`; N2 lo alinea con el
  lifecycle oficial).
- [ ] 1.5 Reescribir el 2º comando de `StopFailure` con paths relativos
  y `--event-type StopFailure --stdin-json`.
- [ ] 1.6 NO tocar los 3 hooks de 1 comando (`PostToolUseFailure`,
  `SubagentStart`, `SubagentStop`): conservan su único comando
  `POST /hooks` introducido en H1.
- [ ] 1.7 Verificar `grep -F 'C:\AI' .claude/settings.json` retorna
  cero coincidencias.

## 2. Documentación

- [ ] 2.1 `docs/notifications.md`: reescribir la sección "Estado del
  script externo" para declarar `C:\AI\claude-code-notifications.ts`
  como `@deprecated` con fecha de retirada prevista 2026-09-01; indicar
  que los hooks han dejado de invocarlo desde N2; explicitar la ruta
  final del CLI (relativa a la raíz del proyecto).
- [ ] 2.2 `README.md`: revisar la sección "Configuración de hooks"
  para que describa los comandos del entry point del repo, sin nombrar
  `C:\AI/...`. Revisar la sección "Notifications" para que no mencione
  el path externo y enlace a `docs/notifications.md`.

## 3. Sync de spec canónica

- [ ] 3.1 Modificar la requirement "Doble comando en los 5 hooks con
  notificación previa" en
  `openspec/specs/hooks-lifecycle-correlation/spec.md`: el 2º comando
  pasa a nombrar `src/2-services/notifications/cli.ts` (entry point
  del servicio migrado), no `C:\AI\claude-code-notifications.ts`.
- [ ] 3.2 Modificar el scenario "Los 5 hooks con notificación disparan
  dos comandos en orden": la consecuencia del 2º comando pasa a ser la
  invocación del entry point del repo con `--event-type
  UserPromptSubmit`.
- [ ] 3.3 Confirmar que el resto de la spec
  (`hooks-lifecycle-correlation`) no requiere más cambios.

## 4. Validación

- [ ] 4.1 `openspec validate
  claude-n2-repoint-hooks-to-internal-notifications` → success.
- [ ] 4.2 `openspec validate --all` → success.
- [ ] 4.3 `npm run test:quick` (lint + typecheck + unit) verde.
- [ ] 4.4 `grep -F 'C:\AI' .claude/settings.json` retorna cero
  coincidencias.
- [ ] 4.5 `C:\AI\claude-code-notifications.ts` intacto (no se elimina
  en este roadmap).

## 5. Gate de fase y archivado

- [ ] 5.1 Ejecutar `phase_gate` (skill `openspec-roadmap-manager`,
  args=`gate claude-n2-repoint-hooks-to-internal-notifications`) →
  PASS (6 checks).
- [ ] 5.2 Actualizar la fila N2 del phase registry en
  `openspec/changes/claude-code-hooks-implementation/design.md` de
  `en curso` → `archivada`.
- [ ] 5.3 Marcar las tasks 3.1–3.10 del L1
  (`openspec/changes/claude-code-hooks-implementation/tasks.md`) como
  [x].
- [ ] 5.4 `openspec-archive` sobre el L2 (con `--skip-specs` si la spec
  ya quedó mergeada por el sync manual previo).
- [ ] 5.5 Commit en español con
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
  El cambio en `.claude/settings.json` NO entra al commit (está
  ignorado por `.gitignore` línea 29); el commit cubre: L2 archivado,
  L1 actualizado, delta de spec, docs.
- [ ] 5.6 Reportar resultado del goal: gate (tabla 6 checks), validate
  individual y `--all`, archivos modificados (+/-), hash del commit,
  ✓/✗ de los 13 criterios, comando textual para verificar toasts
  (ejecutar Claude Code, disparar `UserPromptSubmit`+`Stop`, comprobar
  toast con título del evento y mensaje derivado del payload),
  esperar confirmación antes del cierre del L1.
