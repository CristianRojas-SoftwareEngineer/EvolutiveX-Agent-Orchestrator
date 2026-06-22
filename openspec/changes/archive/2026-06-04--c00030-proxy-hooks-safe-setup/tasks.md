# Tasks: proxy-hooks-safe-setup

## 1. Plantilla canónica de hooks

- [ ] 1.1 Crear `configs/hooks.json` con las 14 entradas de hooks (8 lifecycle + 6 UX)
- [ ] 1.2 Usar `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` como placeholder en todos los paths de comandos
- [ ] 1.3 Verificar que cada entrada tenga los comandos correctos según el contrato de `hooks-lifecycle-correlation`

## 2. Script setup-hooks.ts

- [ ] 2.1 Crear `scripting/setup-hooks.ts` con CLI (commander)
- [ ] 2.2 Implementar `readClaudeSettings` / `writeClaudeSettings` (reutilizar de `shared/claude-settings.ts`)
- [ ] 2.3 Implementar `resolveScpRoot()`: lee `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` de `settings.env` o `--root`
- [ ] 2.4 Implementar `isScpManagedCommand(command: string): boolean` — detecta comandos de SCP
- [ ] 2.5 Implementar `readCanonicalHooks()` — lee y parsea `configs/hooks.json`, reemplaza placeholders
- [ ] 2.6 Implementar `classifyKey(commands: string[]): 'scp-only' | 'user-only' | 'mixed'` — clasifica cada clave
- [ ] 2.7 Implementar `mergeHooks(settings: ClaudeSettings, canonical: HooksBlock): ClaudeSettings` — merge selectivo
- [ ] 2.8 Implementar `backupSettings(settings: ClaudeSettings): string` — escribe backup con timestamp
- [ ] 2.9 Implementar `runInstall(hooks: HooksBlock, options: SetupHooksOptions): number`
- [ ] 2.10 Implementar `runUninstall(hooks: HooksBlock, options: SetupHooksOptions): number`
- [ ] 2.11 Soportar flags `--dry-run`, `--uninstall`, `--force`, `--root`
- [ ] 2.12 Validar archivos SCP antes de cualquier operación

## 3. Integración con setup.ts

- [ ] 3.1 Modificar `scripting/setup.ts` para agregar `--hooks` como fourth feature flag
- [ ] 3.2 Refactorizar lógica de feature flags para compartir entre statusline/notifications/voice/hooks
- [ ] 3.3 Agregar validación de archivos SCP cuando `--hooks` esté presente (antes de invocar setup-hooks.ts)
- [ ] 3.4 Propagar `--dry-run`, `--force`, `--uninstall`, `--root` a setup-hooks.ts
- [ ] 3.5 Verificar que `npm run setup -- --hooks` funcione correctamente

## 4. package.json

- [ ] 4.1 Agregar script `"setup:hooks": "tsx scripting/setup-hooks.ts"`
- [ ] 4.2 Verificar que `npm run help` muestre el nuevo script en la sección local

## 5. Documentación

- [ ] 5.1 Actualizar `README.md` § Configuración de hooks: documentar `npm run setup -- --hooks`
- [ ] 5.2 Actualizar `docs/notifications.md` § Instalación global para indicar `setup --hooks` como método de instalación

## 6. Tests

- [ ] 6.1 Crear `tests/scripting/setup-hooks.test.ts`
- [ ] 6.2 Tests para `isScpManagedCommand`: detecta correctamente comandos SCP vs ajenos
- [ ] 6.3 Tests para `classifyKey`: 'scp-only', 'user-only', 'mixed'
- [ ] 6.4 Tests para merge selectivo: config vacía, config con hooks ajenos, config mixta
- [ ] 6.5 Tests para `--dry-run`: no modifica settings.json
- [ ] 6.6 Tests para `--uninstall`: elimina solo comandos SCP
- [ ] 6.7 Tests para backup: verifica que se crea el archivo de backup
- [ ] 6.8 Tests para validación de archivos: falla si falta alguno

## 7. Verificación

- [ ] 7.1 `npm run test:quick` pasa (lint + typecheck + unit)
- [ ] 7.2 Smoke test manual: `npm run setup -- --hooks --dry-run` muestra diff correcto
- [ ] 7.3 Smoke test manual: `npm run setup -- --hooks` escribe settings.json correctamente
- [ ] 7.4 Smoke test manual: `npm run setup -- --hooks --uninstall` elimina solo comandos SCP