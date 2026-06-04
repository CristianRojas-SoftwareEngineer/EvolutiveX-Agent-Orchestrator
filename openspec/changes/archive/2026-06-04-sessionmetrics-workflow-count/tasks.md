## 1. Tipos de dominio (capa 1-domain)

- [x] 1.1 Añadir `workflow_count: number` a `IModelSessionMetrics` en `src/1-domain/types/gateway/session-metrics.types.ts`
- [x] 1.2 Añadir `total_workflows: number` a `ISessionTotals` en el mismo archivo

## 2. SessionMetricsService (capa 2-services)

- [x] 2.1 Inicializar `workflow_count: 0` en `emptySessionMetrics()` (dentro de `session_totals`) en `src/2-services/session-metrics.service.ts`
- [x] 2.2 Inicializar `workflow_count: 0` en el objeto `existing` por defecto (merge por modelo)
- [x] 2.3 Incrementar `workflow_count: existing.workflow_count + 1` en el merge por modelo
- [x] 2.4 Sumar `total_workflows += m.workflow_count` en `recalcSessionTotals()`
- [x] 2.5 Verificar con `npm run test:quick`

## 3. Tests de SessionMetricsService

- [x] 3.1 Actualizar test `'escribe session-metrics.json con schema §33.2'` en `tests/2-services/session-metrics.service.test.ts` para verificar `workflow_count: 1` y `total_workflows: 1`
- [x] 3.2 Actualizar test `'merge incremental en segunda escritura'` para verificar `workflow_count: 2` y `total_workflows: 2`
- [x] 3.3 Verificar con `npm run test:quick`

## 4. Statusline — interfaces y pipeline (scripting/router-status.ts)

- [x] 4.1 Añadir `workflow_count?: number` a `SessionModelMetricsEntry` (~l.48)
- [x] 4.2 Añadir `workflowCount: number` a `TokenMetrics` (~l.64)
- [x] 4.3 Añadir `workflowCount: number` a `LevelMetricsSnapshot` (~l.412)
- [x] 4.4 Añadir `workflowCount: 0` en `createEmptyMetrics()` (~l.608)
- [x] 4.5 Añadir `levelMetrics.workflowCount += coerceMetricNumber(entry.workflow_count)` en `aggregateSessionMetrics()` (~l.659)
- [x] 4.6 Propagar `workflowCount` en los tres niveles dentro de `writeStatuslineCache()` (~l.1041)
- [x] 4.7 Verificar con `npm run test:quick`

## 5. Statusline — renderTokenTable (scripting/router-status.ts)

- [x] 5.1 Añadir acumulador `let totalWorkflows = 0` junto a `totalCount` en `renderTokenTable` (~l.788)
- [x] 5.2 Acumular `totalWorkflows += m.workflowCount` en el loop de filas
- [x] 5.3 Insertar celda workflows antes de steps en `rows.push([...])`
- [x] 5.4 Actualizar headers: añadir `'# Workflows'` antes de `'# Steps'`
- [x] 5.5 Insertar `'right'` en posición 2 del array de alignments
- [x] 5.6 Definir `w2` para ancho de columna Workflows y renombrar `w2..w7` (Steps→w3, Input→w4, etc.)
- [x] 5.7 Añadir `tcWorkflows` con `totalColor('workflowCount', ...)` para la fila de totales
- [x] 5.8 Añadir celda `w2` en `totalRow` y desplazar el resto
- [x] 5.9 Añadir `B.h.repeat(w2 + 2)` en `botParts` antes del Steps
- [x] 5.10 Verificar con `npm run test:quick`

## 6. Tests del statusline

- [x] 6.1 Añadir test `'lee workflow_count y lo acumula en workflowCount'` en `tests/scripting/router-status-metrics.test.ts` (JSON con `workflow_count: 2`, `standard.workflowCount === 2`)
- [x] 6.2 Añadir test `'workflow_count ausente en JSON → workflowCount === 0'` (campo omitido → coerción a 0)
- [x] 6.3 Verificar con `npm run test:quick`

## 7. Documentación

- [x] 7.1 Actualizar `docs/router-statusline.md` §3.2: añadir `# Workflows` en descripción de columnas de Tabla 2 y fila de fuente `workflow_count → # Workflows`
- [x] 7.2 Actualizar `docs/session-metrics-system.md`: añadir `workflow_count` en ejemplo JSON de modelo y `total_workflows` en `session_totals`; añadir nota sobre semántica de `workflow_count`

## 8. Verificación final

- [x] 8.1 Ejecutar `npm test` y confirmar que todos los tests pasan (incluidos los nuevos)
- [x] 8.2 Ejecutar `npm run typecheck` y confirmar sin errores de tipos
