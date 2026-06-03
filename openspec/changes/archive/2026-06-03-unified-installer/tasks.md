## 1. Módulo de voz (`scripting/install-voice.ts`)

- [x] 1.1 Crear `scripting/install-voice.ts` exportando `applyVoiceInstall(settings, opts) → ClaudeSettings` que escriba `voiceEnabled`, `voice.enabled`, `voice.mode` y `voice.autoSubmit`
- [x] 1.2 Crear `applyVoiceUninstall(settings) → ClaudeSettings` que elimine `voiceEnabled` y `voice` sin tocar otras claves
- [x] 1.3 Escribir tests unitarios en `tests/scripting/install-voice.test.ts` cubriendo install (hold/tap, autoSubmit on/off) y uninstall

## 2. Script unificado (`scripting/setup.ts`)

- [x] 2.1 Crear `scripting/setup.ts` con CLI Commander que acepte `--statusline`, `--notifications`, `--voice`, `--voice-mode hold|tap`, `--no-voice-auto-submit`, `--uninstall`, `--dry-run`, `--force`, `--root`
- [x] 2.2 Implementar lógica de selección: sin flags de feature → opera sobre las tres; con flags → solo sobre las seleccionadas
- [x] 2.3 Implementar flujo de una sola lectura/escritura: `readClaudeSettings()` → cadena de `apply*` → `writeClaudeSettings()`
- [x] 2.4 Implementar validación previa selectiva: validar solo las features de install que requieren archivos en disco; abortar sin escribir si falla alguna
- [x] 2.5 Implementar output de confirmación: listar qué features se instalaron/desinstalaron, mostrar ruta de `settings.json` afectada
- [x] 2.6 Asegurar que `setup.ts` delega en `buildNpxTsxCommand` de `scripting/shared/` para generar comandos de statusline y notificaciones; no duplicar lógica de plataforma ni comillas de ruta

## 3. Registro en `package.json`

- [x] 3.1 Agregar script `"setup": "tsx scripting/setup.ts"` en `package.json`
- [x] 3.2 Actualizar `scripting/help.ts` para incluir `setup` en la categoría `local` con descripción del comando

## 4. Tests de integración del script unificado

- [x] 4.1 Escribir tests en `tests/scripting/setup.test.ts` usando `setClaudeSettingsPathForTests` para verificar: install total, install selectivo, uninstall total, uninstall selectivo, dry-run, force, e install con `--root <ruta-alternativa-válida>`
- [x] 4.2 Verificar con `vi.spyOn` que `readClaudeSettings` y `writeClaudeSettings` se invocan exactamente una vez por ejecución de `setup`, independientemente del número de features seleccionadas
- [x] 4.3 Verificar que install total produce resultado deep-equal (mismas claves y valores, independiente del orden de serialización JSON) al encadenamiento de `applyStatuslineInstall` + `applyNotificationsInstall` + `applyVoiceInstall` aplicados sobre el mismo settings inicial

## 5. Validación final

- [x] 5.1 Ejecutar `npm run test:quick` y confirmar que lint, typecheck y unit tests pasan
- [x] 5.2 Ejecutar `npm run setup -- --dry-run` en el entorno local y verificar output esperado
- [ ] 5.3 Ejecutar `npm run setup` y confirmar las tres features en `~/.claude/settings.json`
- [ ] 5.4 Ejecutar `npm run setup -- --uninstall` y confirmar que se eliminan correctamente
