<!-- Implementación ordenada según dependencias PKA: dominio → servicios → operations → api → UI.
     Cada tarea tiene criterio de aceptación explícito. Gate final: npm run test:quick. -->

## 1. Dominio — tipos y servicio puro

- [x] 1.1 Añadir `'agent-headers'` a `CorrelationMethod` en `src/1-domain/types/audit.types.ts` (:260)
  - _Criterio: `npm run typecheck` pasa; no hay errores de tipo en los usos existentes de `CorrelationMethod`_
- [x] 1.2 Crear `src/1-domain/services/resolve-agent-context.service.ts` con `resolveAgentContext(headers)` → `AgentContext` (case-insensitive lookup de `X-Claude-Code-Agent-Id` y `X-Claude-Code-Parent-Agent-Id`)
  - _Criterio: función pura, sin imports de I/O; `npm run typecheck` pasa_
- [x] 1.3 Crear `src/1-domain/repositories/IWorkflowRepository.ts` con interface mínima: `openSubagentFromWire(sessionId, agentCtx)` y `getWorkflowByAgentId(agentId)`
  - _Criterio: interface definida en capa 1, sin dependencias de capas externas; typecheck pasa_
- [x] 1.4 Crear `tests/1-domain/resolve-agent-context.test.ts` cubriendo: cabeceras presentes, solo `Agent-Id`, sin cabeceras, case-insensitive (patrón de `tests/1-domain/session-resolver.test.ts`)
  - _Criterio: `npm run test:quick` pasa con todos los escenarios de la spec cubiertos_

## 2. Servicios — adapter en memoria

- [x] 2.1 Crear `src/2-services/workflow-repository.service.ts` implementando `IWorkflowRepository` con `Map<agentId, ...>` en memoria (`openSubagentFromWire`, `getWorkflowByAgentId`)
  - _Criterio: implementa la interface de capa 1; `npm run typecheck` pasa_
- [x] 2.2 Crear `tests/2-services/workflow-repository.test.ts` cubriendo: apertura de subagente y recuperación por `agentId`, caso `agentId` desconocido devuelve `undefined`
  - _Criterio: `npm run test:quick` pasa_

## 3. Operations — integración en AuditInteractionHandler

- [x] 3.1 Inyectar `IWorkflowRepository` como dependencia en `AuditInteractionHandler` (constructor, `src/3-operations/audit-interaction.handler.ts`)
  - _Criterio: typecheck pasa; `makeSessionStore` en tests no se rompe (ajustar `makeWorkflowRepo` si hace falta)_
- [x] 3.2 Añadir llamada a `resolveAgentContext(headers)` en el flujo de `handle()`, antes de derivar a `handleFresh` / `handleSubagent`
  - _Criterio: el contexto de agente está disponible en la rama fresh_
- [x] 3.3 Implementar la rama `isSubagentRequest`: si `true` → `workflowRepo.openSubagentFromWire` con `correlationMethod: 'agent-headers'`; si `false` → fallback heurístico actual
  - _Criterio: la rama de cabeceras ejecuta `openSubagentFromWire` y NO invoca `resolvePendingByPrompt`_
- [x] 3.4 Degradar la ruta heurística (`resolvePendingByPrompt` / `unique-pending`) con comentario `@deprecated-fallback` indicando fase G2 y fecha planificada de retirada
  - _Criterio: comentario presente; comportamiento del fallback sin cambios funcionales_
- [x] 3.5 Ampliar `tests/3-operations/audit-interaction.handler.test.ts`:
  - Escenario: request fresh con `X-Claude-Code-Parent-Agent-Id` → `correlationMethod: 'agent-headers'`; `resolvePendingByPrompt` no invocado.
  - Escenario: request fresh sin cabeceras → fallback heurístico operativo (`correlationMethod: 'prompt'` / `'unique-pending'`).
  - _Criterio: `npm run test:quick` pasa; escenarios Given/When/Then de la spec cubiertos_

## 4. API — cableado en composition root

- [x] 4.1 Instanciar `WorkflowRepositoryService` en `src/4-api/composition-root.ts` y pasarlo al constructor de `AuditInteractionHandler`
  - _Criterio: `npm run typecheck` pasa; el servidor arranca sin error con `npm run dev` (verificación manual)_

## 5. UI / E2E — test de integración Fastify

- [x] 5.1 Crear test E2E en `tests/5-user-interfaces/agent-headers-correlation.test.ts` (patrón `gzip-decompression.test.ts`): levantar proxy + upstream falso, inyectar request con `X-Claude-Code-Agent-Id` + `X-Claude-Code-Parent-Agent-Id`, verificar que el flujo no se rompe y se crea la sesión en disco (E2E ligero, decisión 2).
  - _Criterio: test pasa; sesión creada en disco_
- [x] 5.2 Verificación determinista de `'agent-headers'` y fallback concentrada en `tests/3-operations/audit-interaction.handler.test.ts` con helper `makeWorkflowRepo` y dos escenarios (decisión 2).
  - _Criterio: los dos escenarios pasan_

## 6. Gate de fase

- [x] 6.1 Ejecutar el gate completo: `npm run test:quick` (lint + typecheck + toda la suite Vitest)
  - _Criterio: salida `0` en los tres pasos; sin warnings de lint ni errores de tipo_

## 7. Documentación

- [x] 7.1 Actualizar `README.md`: añadir sección o párrafo sobre plano A de correlación, cabeceras soportadas (`X-Claude-Code-Agent-Id`, `X-Claude-Code-Parent-Agent-Id`) y `correlationMethod: 'agent-headers'`
  - _Criterio: README describe la feature como implementada; no afirma nada sobre C2–C4 como hecho_
- [x] 7.2 Actualizar `docs/session-audit-model.md`: describir la correlación por cabeceras como método de mayor autoridad (§21), valores de `CorrelationMethod` actualizados, fallback heurístico documentado como legacy
  - _Criterio: documento refleja el estado real; sin referencias al plano A como "futuro"_

## 8. Legacy

- [x] 8.1 Confirmar que el comentario `@deprecated-fallback` está presente en la ruta heurística de `audit-interaction.handler.ts` (tarea 3.4)
  - _Criterio: comentario visible con motivo, fase de retirada (G2) y fecha planificada_
- [x] 8.2 `npm run lint` pasa sin imports huérfanos generados por este change
  - _Criterio: 0 errores de lint_

## 9. Gobernanza

- [ ] 9.1 Ejecutar `openspec validate --changes gateway-c1-wire-agent-headers` → passed
  - _Criterio: 1 passed, 0 failed_
- [ ] 9.2 Ejecutar `migration-phase-gate` sobre este change antes de archivar
  - _Criterio: veredicto PASS_
- [ ] 9.3 Actualizar estado de C1 a `validada` en el registro de `openspec/changes/gateway-migration/design.md`
  - _Criterio: columna Estado de C1 = `validada`_
- [ ] 9.4 Si este change modifica comportamiento acordado en `openspec/specs/`, ejecutar `openspec-sync`
  - _Criterio: ejecutado si aplica; no ejecutado si no hay delta de specs existentes_
- [ ] 9.5 Archivar este change: `openspec-archive`
  - _Criterio: directorio movido a `openspec/changes/archive/`; estado de C1 en el registro = `archivada`_
