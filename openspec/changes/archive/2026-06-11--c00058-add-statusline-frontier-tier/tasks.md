## 1. Provider config y catálogo anthropic

- [x] 1.1 Añadir `ANTHROPIC_DEFAULT_FABLE_MODEL` a `ProviderConfig` y `MANAGED_ENV_VARS` en `scripting/shared/provider-config.ts` (orden: haiku, sonnet, opus, fable, subagent)
- [x] 1.2 Añadir `ANTHROPIC_DEFAULT_FABLE_MODEL` a `routing/providers/anthropic/config.json` (ruta `models/claude-fable-5`, misma convención que los otros modelos)
- [x] 1.3 Crear `routing/providers/anthropic/models/claude-fable-5/metadata.json` (`modelId: "claude-fable-5"`, `displayName: "Fable 5"`)
- [x] 1.4 Verificar que `configure-provider --show-current` y `configure-provider anthropic` listan/aplican Fable sin cambios ad hoc en el CLI

## 2. Statusline — clasificación y agregación

- [x] 2.1 Extender `ReasoningLevel` con `'frontier'` y actualizar tipos/estructuras (`TokenMetrics`, `AggregatedSessionMetrics`, `MetricsSnapshot`, `LevelMetricsSnapshot`)
- [x] 2.2 Implementar clasificación Frontier en `classifyModelWithEnv` (orden: haiku → fable → opus → sonnet; sin keyword `mythos`)
- [x] 2.3 Extender `createEmptyMetrics` y `aggregateSessionMetrics` para bucket `frontier`; suma de `finalizedRuns` en totales: `lite + standard + reasoning + frontier`
- [x] 2.4 Actualizar `writeStatuslineCache` / lectura de `metricsSnapshot` con campo `frontier`
- [x] 2.5 Extender `cellColor` y `totalColor` para incluir nivel `frontier` en union types y loops de diff

## 3. Statusline — render y paleta

- [x] 3.1 Añadir color `C.frontier` (blanco bold) y reescalar `C.standard` → gris, `C.reasoning` → blanco sin bold
- [x] 3.2 Añadir cuarta fila `Frontier` en `renderTokenTable` y helpers que iteran niveles (`levels` array, snapshots de diff)
- [x] 3.3 Ajustar tests de conteo de líneas de Tabla 2 (7 líneas de contenido: cabecera + 4 filas + separador + totales)

## 4. Headless harness

- [x] 4.1 Confirmar que `buildIsolatedProviderEnv` propaga `ANTHROPIC_DEFAULT_FABLE_MODEL` vía loop `MANAGED_ENV_VARS` en `claudeEnv`; añadir fixture/assert en `headless-tts-provider-env.test.ts` si la cobertura actual no lo ejercita

## 5. Tests

- [x] 5.1 `router-status-classify.test.ts`: casos Fable configurado, fallback `fable`, Mythos → `null`, orden fable antes de opus
- [x] 5.2 `router-status-metrics.test.ts`: agregación con `modelId` Fable en fila `frontier`; totales `# Workflows` = suma de cuatro filas
- [x] 5.3 `router-status-output.test.ts`: presencia de etiqueta `Frontier`, colores ANSI, cuatro filas fijas; escenario main Frontier + subagent Standard
- [x] 5.4 Ejecutar `npm run test:quick` — todos los tests del statusline y provider-config en verde

## 6. Documentación y skills

- [x] 6.1 Actualizar `docs/router-statusline.md` §2 (tabla fuentes de datos: cuarta variable Fable), §3.2 (ejemplo 4 filas), §5 (mapeo Frontier), §4.4 (`metricsSnapshot.frontier`)
- [x] 6.2 Actualizar `docs/session-metrics-system.md` bloque «Mapeo Tabla 2» y totales (cuatro niveles; suma incluye `frontier`)
- [x] 6.3 Actualizar `.claude/skills/statusline-system/SKILL.md` (`<slots>`, `<table2_composition>`, tabla de env vars, paleta de colores)

## 7. Cierre

- [x] 7.1 Ejecutar `openspec verify add-statusline-frontier-tier` tras implementación
- [x] 7.2 Post-deploy: documentar en PR/commit que usuarios con `configure-provider anthropic` previo deben re-ejecutar el comando para obtener `ANTHROPIC_DEFAULT_FABLE_MODEL`
- [x] 7.3 Al archivar: `openspec sync` de deltas a `openspec/specs/` (`statusline-runtime`, `provider-env-config`, `gateway-session-metrics`)
