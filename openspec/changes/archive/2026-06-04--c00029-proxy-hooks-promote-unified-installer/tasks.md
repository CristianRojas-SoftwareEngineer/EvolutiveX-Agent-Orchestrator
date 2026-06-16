# Tasks: proxy-hooks-promote-unified-installer

## 1. Change OpenSpec

- [ ] 1.1 Crear `openspec/changes/proxy-hooks-promote-unified-installer/proposal.md` con motivación, alcance, no-objetivos y decisiones de diseño.
- [ ] 1.2 Crear `design.md` con la arquitectura objetivo, las 5 garantías S1-S5, el flujo del orquestador y los cambios de firma de `applyStatuslineUninstall`.
- [ ] 1.3 Crear `specs/unified-installer/spec.md` con deltas: REMOVED (Compatibilidad con instaladores individuales), MODIFIED (selección de 3 features, tabla de validación, scenario deep-equal), ADDED (promoción del patrón seguro S1-S5, política de uninstall de statusline, --install/--uninstall mutuamente excluyentes).

## 2. Mover lógica pura a `scripting/features/`

- [ ] 2.1 Crear `scripting/features/hooks.ts` con: `isScpManagedCommand`, `classifyKey`, `mergeHooks`, `unmergeHooks`, `validateScpRoot`, `readCanonicalHooks`, `readCanonicalHooksResolved`, `SMART_CODE_PROXY_ROOT_KEY` re-exportado.
- [ ] 2.2 Crear `scripting/features/statusline.ts` con: `isSmartCodeStatusLine`, `buildStatusLineCommand`, `buildStatusLineBlock`, `shouldOverwriteStatusLine`, `applyStatuslineInstall` (sin cambio de firma), `applyStatuslineUninstall(settings, force)` (firma nueva con preservación de ajeno).
- [ ] 2.3 Crear `scripting/features/voice.ts` con: `applyVoiceInstall`, `applyVoiceUninstall` (sin cambios de firma).

## 3. Orquestador universal

- [ ] 3.1 Refactorizar `scripting/setup.ts`: parsear `--install | --uninstall` (mutuamente excluyentes, default `--install`).
- [ ] 3.2 Parsear features: `--statusline`, `--voice`, `--hooks` (sin flag = las 3). Eliminar `--notifications`.
- [ ] 3.3 Validar exclusividad `--install`/`--uninstall`. Abortar exit 1 si ambos están presentes.
- [ ] 3.4 S1: validar archivos del repo por cada feature activa (`validateProxyRoot` para statusline, `validateScpRoot` para hooks, sin validación para voice).
- [ ] 3.5 S3: `settings = readClaudeSettings()` una sola vez.
- [ ] 3.6 Aplicar transformaciones en cadena (install o uninstall) sobre `settings`.
- [ ] 3.7 Si `--dry-run`: imprimir diff y retornar 0 sin escribir.
- [ ] 3.8 S2: `backup = backupSettings(settings)` una sola vez.
- [ ] 3.9 S3: `writeClaudeSettings(next)` una sola vez.
- [ ] 3.10 Log final con la lista de features aplicadas.

## 4. Eliminar código legacy

- [ ] 4.1 Eliminar `scripting/install-notifications.ts`.
- [ ] 4.2 Eliminar `scripting/install-statusline.ts`.
- [ ] 4.3 Eliminar `scripting/install-voice.ts`.
- [ ] 4.4 Eliminar `scripting/setup-hooks.ts`.

## 5. Tests

- [ ] 5.1 Extender `tests/scripting/helpers/proxy-root-fixture.ts`: `createValidProxyRoot` incluye `configs/hooks.json` + `scripting/post-hook-event.ts` + `scripting/stop-hook-ux.ts` por defecto.
- [ ] 5.2 Crear `tests/scripting/features/statusline.test.ts`: cobertura de las funciones puras, incluyendo la nueva política de uninstall (preserva ajeno sin `--force`, borra ajeno con `--force`).
- [ ] 5.3 Crear `tests/scripting/features/voice.test.ts`: cobertura de install/uninstall.
- [ ] 5.4 Crear `tests/scripting/features/hooks.test.ts`: cobertura de las funciones puras (reemplaza el actual `setup-hooks.test.ts`).
- [ ] 5.5 Crear `tests/scripting/setup.test.ts`: cobertura del orquestador (S1-S5 + combinaciones de flags + --install/--uninstall exclusivos).
- [ ] 5.6 Eliminar `tests/scripting/install-notifications.test.ts`.
- [ ] 5.7 Eliminar `tests/scripting/install-statusline.test.ts`.
- [ ] 5.8 Eliminar `tests/scripting/install-voice.test.ts`.
- [ ] 5.9 Eliminar `tests/scripting/setup-hooks.test.ts`.

## 6. Fachadas npm y discovery

- [ ] 6.1 Actualizar `package.json`: eliminar `install:statusline`, `install:notifications`, `setup:hooks`. Agregar `setup:install` y `setup:uninstall`. Mantener `setup`.
- [ ] 6.2 Actualizar `scripting/help.ts`: actualizar descripción de `setup`; agregar `setup:install` y `setup:uninstall`; eliminar entradas legacy.

## 7. Documentación

- [ ] 7.1 Actualizar `README.md` § Configuración de hooks: documentar indivisibilidad de `--hooks` (cubre gateway + stop UX + notificaciones), los nuevos comandos, las 5 garantías S1-S5.
- [ ] 7.2 Actualizar `README.md` § Notifications: reemplazar `install:notifications` por `setup:install -- --hooks` o `setup:install` (cubre las 3 features).
- [ ] 7.3 Actualizar `docs/notifications.md` § Instalación global: única vía es `setup:install` o `setup:install -- --hooks`.

## 8. Sincronización de spec

- [ ] 8.1 Sincronizar `openspec/specs/unified-installer/spec.md` con los deltas del change: REMOVED (Compatibilidad con instaladores individuales), MODIFIED (3 features, tabla de validación, deep-equal), ADDED (S1-S5, política de uninstall, --install/--uninstall).

## 9. Verificación

- [ ] 9.1 `npm run test:quick`: lint + typecheck + todos los tests verdes.
- [ ] 9.2 Smoke test 1: `npm run setup:install -- --dry-run` no escribe.
- [ ] 9.3 Smoke test 2: `npm run setup:install` escribe las 3 features y crea backup timestamped.
- [ ] 9.4 Smoke test 3: `npm run setup:uninstall` borra las 3 features.
- [ ] 9.5 Smoke test 4: `npm run setup:install -- --hooks` solo hooks, statusline/voice intactas.
- [ ] 9.6 Smoke test 5: `npm run setup:uninstall -- --hooks` solo hooks.
- [ ] 9.7 Smoke test 6: con `statusLine` ajeno, `setup:install -- --statusline --force` sobrescribe; `setup:uninstall -- --statusline` preserva ajeno; con `--force` lo borra.
- [ ] 9.8 Smoke test 7: `setup -- --install --uninstall` aborta exit 1.
- [ ] 9.9 `ls -la ~/.claude/settings-backup-*.json` muestra al menos un backup creado por el orquestador.
- [ ] 9.10 `openspec validate proxy-hooks-promote-unified-installer` y `openspec validate --all`.

## 10. Cierre

- [ ] 10.1 Commit con mensaje en español describiendo: promoción del instalador universal, las 5 garantías S1-S5 promovidas, archivos eliminados, nuevos scripts npm.
- [ ] 10.2 `openspec archive proxy-hooks-promote-unified-installer --yes`.
- [ ] 10.3 Verificar que el change queda en `openspec/changes/archive/2026-06-04--c00029-proxy-hooks-promote-unified-installer/` y que la spec principal está sincronizada.
