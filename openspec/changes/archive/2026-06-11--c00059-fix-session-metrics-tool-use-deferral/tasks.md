## 1. Dominio (capa 1)

- [x] 1.1 Eliminar `src/1-domain/services/gateway/is-step-billable-for-session-metrics.ts` (design D1).
- [x] 1.2 Eliminar `tests/1-domain/gateway/is-step-billable-for-session-metrics.test.ts` (design D1).

## 2. Operations (capa 3)

- [x] 2.1 En `src/3-operations/persist-billable-step-metrics.util.ts`: quitar el import de `isStepBillableForSessionMetrics`, la guarda `if (!isStepBillableForSessionMetrics(stopReason)) return` y el parámetro `stopReason` de la firma; conservar las guardas G16′ (`workflow.kind`) y `step.usage == null` (design D3).
- [x] 2.2 Actualizar el call site en `src/3-operations/audit-sse-response.handler.ts` (~línea 271): invocar `persistBillableStepMetricsIfNeeded(this.sessionMetrics, this.auditBaseDir, workflow, wireStep)` sin `assembled.stopReason`.
- [x] 2.3 Actualizar el call site en `src/3-operations/audit-standard-response.handler.ts` (~línea 166): invocar el util sin el argumento `stopReason`, conservando la condición `if (bodyUsage)` existente.

## 3. Tests

- [x] 3.1 En `tests/3-operations/persist-billable-step-metrics.util.test.ts`: reescribir el caso `main + tool_use → updateFromStep no llamado` (líneas 57–67) como `main + tool_use + usage → updateFromStep llamado`; actualizar todas las invocaciones del util a la firma sin `stopReason`.
- [x] 3.2 Verificar que `tests/3-operations/audit-standard-response.handler.test.ts` (`no invoca updateFromStep sin usage`, líneas 278–302) sigue verde sin cambios (la exclusión por ausencia de `usage` no depende del gate eliminado).

## 4. Docs

- [x] 4.1 En `docs/session-metrics-system.md` §`Escritura (SessionMetricsService)`: eliminar el calificador "stop terminal" de la fila `updateFromStep` (línea 56: condición pasa a "main o subagent + `usage`") y actualizar la fila del componente `persist-billable-step-metrics.util.ts` (línea 67) que cita `isStepBillableForSessionMetrics`.

## 5. Verificación y cierre

- [x] 5.1 Ejecutar `npm run test:quick` — suite verde (lint + typecheck + unit).
- [x] 5.2 Ejecutar `openspec verify fix-session-metrics-tool-use-deferral` sin CRITICALs.
