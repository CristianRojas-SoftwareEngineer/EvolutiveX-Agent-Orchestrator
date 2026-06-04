## 1. Dominio y contrato de step contable

- [x] 1.1 Documentar en código (comentario breve en dominio o tipos) qué step es contable para métricas (terminal + `closeStep`, decisión D4 del design)
- [x] 1.2 Añadir helper puro si hace falta (p. ej. `isStepBillableForSessionMetrics(step)`) con tests unitarios en `tests/1-domain`

## 2. SessionMetricsService — per-step e idempotencia

- [x] 2.1 Implementar `updateFromStep(sessionDir, step)` con merge de tokens/`count`, `cache_efficiency`, `session_totals`, sin tocar `workflow_count`
- [x] 2.2 Implementar registro idempotente por `step.id` (sidecar o mecanismo acordado en design §D2)
- [x] 2.3 Refactorizar `updateFromWorkflow` / añadir `finalizeWorkflowMetrics` para cierre main: solo `workflow_count` + reconciliación sin duplicar steps ya aplicados
- [x] 2.4 Extender `tests/2-services/session-metrics.service.test.ts`: per-step, idempotencia, cierre sin doble conteo

## 3. Operations — wire y hooks

- [x] 3.1 Enganchar `updateFromStep` tras step main contable en `gateway-wire-step.util.ts` (o handler wire que lo invoque), con `sessionDir` resuelto
- [x] 3.2 Ajustar `AuditHookEventHandler.delegateClosure` al path de cierre (solo `workflow_count` / sin re-merge de tokens)
- [x] 3.3 Actualizar `tests/3-operations/audit-hook-event.handler.test.ts` y tests wire relacionados

## 4. Composition root

- [x] 4.1 Inyectar dependencias necesarias en handlers wire ( `SessionMetricsService`, `auditBaseDir` / resolución de sesión) en `composition-root.ts`
- [x] 4.2 Verificar que workflows `subagent` no invocan métricas de sesión (G16)

## 5. Statusline y documentación

- [x] 5.1 Añadir escenario de integración o test en `tests/scripting/router-status-output.test.ts` con `session-metrics.json` actualizado mid-session (lectura refleja incremento)
- [x] 5.2 Actualizar `docs/session-metrics-system.md` y nota breve en `docs/router-statusline.md` (cadencia proxy vs refresh Claude)

## 6. Verificación final

- [x] 6.1 `npm run test:quick` en verde
- [x] 6.2 `openspec validate session-metrics-per-step --strict` en verde
