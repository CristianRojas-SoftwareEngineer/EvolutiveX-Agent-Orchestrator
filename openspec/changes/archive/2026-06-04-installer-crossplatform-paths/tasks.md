## 1. Template de hooks (config)

- [x] 1.1 En `configs/hooks.json`, reemplazar `${CLAUDE_PROJECT_DIR}` (×2) por `${SMART_CODE_PROXY_ROOT}` en el bloque `Stop`

## 2. Orquestador (setup.ts)

- [x] 2.1 En `scripting/setup.ts`, importar `resolvePosixAbsolutePath` desde `./shared/npx-tsx-command.js`
- [x] 2.2 En `scripting/setup.ts:48`, cambiar `resolve(options.root)` → `resolvePosixAbsolutePath(options.root)` y eliminar el import de `resolve` si queda sin uso

## 3. Feature statusline (normalización env var)

- [x] 3.1 En `scripting/features/statusline.ts:63`, cambiar `const root = resolve(proxyRoot)` → `const root = resolvePosixAbsolutePath(proxyRoot)`
- [x] 3.2 Verificar que `resolvePosixAbsolutePath` ya está importado (viene de `../shared/npx-tsx-command.js`); añadir al import si falta

## 4. Stop hook UX (continuidad siempre en SCP)

- [x] 4.1 En `scripting/stop-hook-ux.ts`, importar `dirname` desde `node:path` (además del `resolve as resolvePath` que ya usa el entry-point check)
- [x] 4.2 En `scripting/stop-hook-ux.ts:14`, derivar `scpRoot` de `import.meta.url`:
      `const scpRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');`
      y pasar `scpRoot` en lugar de `process.env.CLAUDE_PROJECT_DIR ?? ''`

## 5. Tests

- [x] 5.1 En `tests/scripting/setup.test.ts` (test "resultado deep-equal", línea 183), cambiar `resolve(proxyRoot)` → `resolvePosixAbsolutePath(proxyRoot)` en la reconstrucción manual; añadir import si falta
- [x] 5.2 En `tests/scripting/setup.test.ts`, añadir aserción: tras install de hooks, ningún `command` de los hooks contiene `\` ni `${CLAUDE_PROJECT_DIR}`
- [x] 5.3 En `tests/scripting/stop-hook-ux.test.ts`, reescribir los tests que verifican `CLAUDE_PROJECT_DIR` para verificar en cambio que `runContinuityNotification` recibe una ruta absoluta a SCP (derivada del script, no de la env var)
- [x] 5.4 Ejecutar `npm run test:quick` — debe pasar sin errores

## 6. Documentación

- [x] 6.1 En `docs/notifications.md:67`, actualizar el snippet del hook `Stop`: `${CLAUDE_PROJECT_DIR}` → `${SMART_CODE_PROXY_ROOT}` (×2) con comillas dobles preservadas
- [x] 6.2 En `docs/notifications.md:76`, actualizar la nota: ya no se depende de `${CLAUDE_PROJECT_DIR}`; el script deriva su raíz de `import.meta.url`
- [x] 6.3 En `docs/notifications.md:82,90,96`, quitar el prefijo `CLAUDE_PROJECT_DIR=.` de los comandos de prueba manual

## 7. Verificación final

- [x] 7.1 Ejecutar `npm test` — suite completa verde
- [x] 7.2 Dry-run: `npx tsx scripting/setup.ts --dry-run --root .` y confirmar que en el JSON no aparece ningún backslash ni `${CLAUDE_PROJECT_DIR}` en las rutas
