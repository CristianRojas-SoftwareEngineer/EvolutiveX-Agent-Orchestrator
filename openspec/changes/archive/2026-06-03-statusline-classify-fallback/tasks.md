# Tasks: Fallback heurístico en classifyModelWithEnv

## Checklist de implementación

- [x] Añadir bloque fallback en `classifyModelWithEnv` (`scripting/router-status.ts`)
- [x] Actualizar test existente `'devuelve null si las variables ANTHROPIC_DEFAULT_* están vacías'` en `router-status-classify.test.ts`
- [x] Añadir bloque `describe('fallback heurístico (vars ausentes)')` con 6 tests en `router-status-classify.test.ts`
- [x] Añadir test e2e de fallback en `router-status-metrics.test.ts`
- [x] Actualizar `docs/router-statusline.md` §5 con párrafo de fallback heurístico
- [x] Actualizar `docs/router-statusline.md` §10 con fila de tabla para vars ausentes
- [x] Actualizar `openspec/specs/statusline-runtime/spec.md` con escenarios de fallback
- [x] Ejecutar `npm test` y `npm run typecheck` sin errores
- [x] Commit con mensaje descriptivo
