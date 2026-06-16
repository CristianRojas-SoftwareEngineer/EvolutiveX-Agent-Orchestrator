## Why

Los scripts `install:statusline` e `install:notifications` son independientes y no existe un punto de entrada único para configurar el entorno de Claude Code al clonar el repo. Además, la voz de Claude Code requiere configuración manual directa en `~/.claude/settings.json` sin ningún script de soporte. Se necesita un instalador unificado que cubra las tres características con una interfaz coherente y selectiva.

## What Changes

- Nuevo script `setup` (`scripting/setup.ts`) que unifica install/uninstall de statusline, notificaciones y voz en una sola ejecución
- Nueva función `applyVoiceInstall` / `applyVoiceUninstall` en `scripting/` para gestionar `voiceEnabled` y `voice.*` en `~/.claude/settings.json`
- Nueva entrada `setup` en `package.json` (scripts)
- Los instaladores individuales (`install:statusline`, `install:notifications`) se conservan sin cambios

## Capabilities

### New Capabilities

- `unified-installer`: Script CLI flag-based que instala o desinstala selectivamente statusline, notificaciones y voz de Claude Code en `~/.claude/settings.json`. Sin flags de feature → opera sobre las tres. Con flags explícitos (`--statusline`, `--notifications`, `--voice`) → opera solo sobre las seleccionadas. El flag `--uninstall` cambia la dirección de la operación; los feature flags cambian el alcance.

### Modified Capabilities

_(ninguna)_

## Impact

- **Archivos nuevos**: `scripting/setup.ts`
- **Archivos modificados**: `package.json` (nuevo script `setup`)
- **Reutiliza sin modificar**: `applyStatuslineInstall/Uninstall`, `applyNotificationsInstall/Uninstall`, `readClaudeSettings`, `writeClaudeSettings`
- **Capas PKA**: fuera de la capa de aplicación — scripts de tooling en `scripting/`
- **Dependencias externas**: ninguna nueva (ya usa `commander`, `chalk`)
- **Efectos en disco**: solo `~/.claude/settings.json` del usuario
