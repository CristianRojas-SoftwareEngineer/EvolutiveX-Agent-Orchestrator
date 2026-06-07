## 1. Script implementation

- [x] 1.1 Crear `scripting/clean-modules.ts` con lógica condicional por plataforma (Windows vs. non-Windows).
- [x] 1.2 Implementar pre-limpieza Windows: matar procesos `node`, `esbuild`, `vitest` via `powershell Stop-Process`, esperar 2s.
- [x] 1.3 Invocar rimraf via `execSync` con timeout de 60s.
- [x] 1.4 Implementar verificación post-borrado: `existsSync(node_modules)` + conteo de items.
- [x] 1.5 Implementar auto-recuperación: si estado corrupto, ejecutar `npm install` y reportar.
- [x] 1.6 Delegar directamente a rimraf en Linux/macOS (sin pre-limpieza).
- [x] 1.7 Terminar con exit code 0 si borrado exitoso, exit code 1 si falló (incluyendo auto-recuperación).

## 2. Package.json update

- [x] 2.1 Actualizar `package.json`: cambiar `"clean:modules": "rimraf node_modules"` por `"clean:modules": "tsx scripting/clean-modules.ts"`.

## 3. Verification

- [x] 3.1 Ejecutar `npm run typecheck` y confirmar que TypeScript compila sin errores.
- [x] 3.2 Ejecutar `npm run verify:package-scripts` y confirmar que el step `clean-modules` pasa (status: pass) y que los pasos 36–40 no se skippean en cascada.
- [x] 3.3 Verificar que `verify-report.json` muestra `missingFromPackageJson: []` y `missingFromConfig: []`.

## 4. End-to-end test

- [ ] 4.1 Ejecutar `npm run clean:modules` en entorno limpio (node_modules completo) y confirmar eliminación exitosa con exit 0.
- [ ] 4.2 Confirmar que `node_modules/` no existe tras la ejecución.
- [ ] 4.3 Ejecutar `npm install` para restaurar entorno y verificar que `npm run typecheck` pasa.