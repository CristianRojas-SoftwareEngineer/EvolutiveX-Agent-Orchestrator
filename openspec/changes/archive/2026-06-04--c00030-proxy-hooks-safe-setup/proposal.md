# proxy-hooks-safe-setup

## Why

Los hooks de Claude Code (14 entradas: 8 lifecycle + 6 UX) actualmente requieren configuración manual y edición directa de `.claude/settings.json`. El proyecto `.claude/settings.json` del repo tiene un **drift** respecto al contrato especificado en `hooks-lifecycle-correlation`: faltan segundos comandos de notificación y 6 entradas de UX. Además, la instalación en user-level (`~/.claude/settings.json`) no existe como opción automática, lo que impide que los hooks de SCP se hereden en todos los proyectos del usuario sin copiar y pegar configuración. Los usuarios con hooks de otras herramientas no tienen protección ante sobreescritura accidental.

## What Changes

- **Nuevo script `scripting/setup-hooks.ts`** — instalador/uninstaller de hooks con merge selectivo que preserva configs ajenas a SCP.
- **Nuevo archivo `configs/hooks.json`** — plantilla canónica versionada con las 14 entradas completas de hooks, placeholder `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` resuelto en runtime.
- **`setup.ts` unificado** — refactorizar para agregar `--hooks` como fourth feature flag (junto a `--statusline`, `--notifications`, `--voice`).
- **Merge selectivo seguro** — nunca se borran ni reemplazan configs del usuario ajenas a SCP; solo se tocan las 14 entradas managed by SCP.
- **Backup automático** — antes de escribir `~/.claude/settings.json`, se crea backup con timestamp.
- **Flags `--dry-run`, `--uninstall`, `--force`** — previsualizar cambios, desinstalar selectivamente, forzar sobre hooks ajenos.

## Capabilities

### New Capabilities

- **`proxy-hooks-distribution`**: Script `setup --hooks` que instala las 14 entradas de hooks de SCP en `~/.claude/settings.json` (user-level) con merge selectivo seguro. La plantilla canónica vive en `configs/hooks.json` (versionada). Detecta comandos "de SCP" (`post-hook-event`, `stop-hook-ux`, `notifications/cli.ts`, ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`). Uninstall elimina solo los comandos de SCP, preserva configs ajenas del usuario.

### Modified Capabilities

- **`hooks-lifecycle-correlation`**: Aclarar que el modelo default de instalación es user-level (`~/.claude/settings.json`), no project-level. Project-level es un override opcional. Agregar requirement para la distribución de hooks via `setup --hooks` con merge selectivo.
- **`unified-installer`**: Extender `setup.ts` para admitir `--hooks` como feature flag adicional. Indicar que los hooks se instalan en `~/.claude/settings.json`. Validación de archivos SCP antes de invocar `setup-hooks.ts`.

## Impact

- **Archivos nuevos**: `configs/hooks.json`, `scripting/setup-hooks.ts`, `openspec/specs/proxy-hooks-distribution/spec.md`
- **Archivos modificados**: `scripting/setup.ts` (refactor), `package.json` (script `setup:hooks`), `README.md`, `docs/notifications.md`
- **Specs modificadas**: `hooks-lifecycle-correlation/spec.md`, `unified-installer/spec.md`
- **Capa PKA**: scripting/ (herramienta, fuera de las capas applicativas)
- **Dependencias externas**: ninguna nueva (reutiliza `commander`, `chalk`, `readClaudeSettings`, `writeClaudeSettings`, `buildNpxTsxCommand`)
- **Efecto en disco**: solo `~/.claude/settings.json` del usuario (con backup automático)