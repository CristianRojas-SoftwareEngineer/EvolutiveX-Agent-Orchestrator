## 1. Módulo compartido de settings

- [x] 1.1 Crear `scripting/lib/claude-settings.ts` con `readClaudeSettings`, `writeClaudeSettings`, tipo `ClaudeSettings` y ruta `CLAUDE_SETTINGS_PATH`
- [x] 1.2 Refactorizar `configure-provider.ts` para importar desde `claude-settings.ts` sin cambiar comportamiento
- [x] 1.3 Verificar: `npm run test:quick` pasa (o al menos typecheck + tests existentes de scripting si los hay)

## 2. Resolución de rutas en router-status

- [x] 2.1 Implementar y exportar `resolveProjectRoot(settingsEnv, cwd?)` con validación de `routing/providers` y fallback
- [x] 2.2 Usar `resolveProjectRoot` en `resolveStatuslinePaths`; prioridad `StatuslineBuildOptions.projectRoot` > ROOT > cwd
- [x] 2.3 Añadir tests en `tests/scripting/` para ROOT válido, inválido, ausente y `projectRoot` inyectado
- [x] 2.4 Verificar: `npx vitest run tests/scripting/router-status-*.test.ts` — todos pasan

## 3. Instalador CLI

- [x] 3.1 Crear `scripting/install-statusline.ts` con flags `--root`, `--dry-run`, `--force`, `--uninstall`
- [x] 3.2 Implementar `buildStatusLineCommand(proxyRoot)` multiplataforma (`npx --prefix` + citado)
- [x] 3.3 Implementar política de sobrescritura y validación de `scripting/router-status.ts` + `routing/providers`
- [x] 3.4 Añadir `"install:statusline": "tsx scripting/install-statusline.ts"` en `package.json`
- [x] 3.5 Crear `tests/scripting/install-statusline.test.ts` (dry-run, force, uninstall, comando generado)
- [x] 3.6 Verificar: `npx vitest run tests/scripting/install-statusline.test.ts` pasa

## 4. Documentación y cierre

- [x] 4.1 Añadir sección breve en `docs/how-to-start.md` (`npm run install:statusline`, reinicio Claude Code, enlace a propuesta de rediseño)
- [x] 4.2 Actualizar §9 de `docs/proposals/router-status-redesign.md` para referenciar el instalador en lugar de JSON manual exclusivo
- [x] 4.3 Verificación final: `npm run test:quick`
