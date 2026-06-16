<!-- Checklist de GOBERNANZA. Cada tarea tiene criterio de aceptación explícito.
     Para implementación de código, abrir el change de segundo nivel correspondiente. -->

## C0 — Diseño objetivo documentado

> Fase sin change hijo. Se considera validada al completar los artefactos del orquestador.

- [x] Artefactos del orquestador (`proposal.md`, `specs/`, `design.md`, `tasks.md`) completos y revisados
  - _Criterio: `openspec status --change gateway-migration` reporta todos los artefactos como `done`_
- [x] Registro de fases en `design.md` refleja las 12 fases de §43 con sus dependencias
  - _Criterio: tabla del registro contiene C0–C3, G1–G5, P0–P2_
- [x] Fase C0 marcada como `validada` en el registro
  - _Criterio: columna Estado de C0 = `validada`_

---

## C1 — Wire: cabeceras `agent-id` + `resolveAgentContext` + `IWorkflowRepository` mínimo

- [x] Verificar dependencias §43: ninguna (dependencia `—`)
  - _Criterio: no aplica; puede iniciarse en cualquier momento_
- [x] Crear change de segundo nivel `gateway-c1-wire-agent-headers` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-c1-wire-agent-headers/` con `.openspec.yaml` creado_
- [x] El `proposal.md` del change hijo incluye back-reference `Orquestador: gateway-migration | Fase: c1 (C)`
  - _Criterio: línea de back-reference presente en `proposal.md`_
- [x] Actualizar estado de C1 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: todos los tasks.md del change hijo marcados como completados_
- [x] Gate superado: pruebas de correlación identidad/cabeceras E2E pasan
  - _Criterio: `npm run test:quick` sin errores (lint + typecheck + suite Vitest completa)_
- [x] Documentación actualizada: `README.md`, `docs/session-audit-model.md`
  - _Criterio: descripción de cabeceras `agent-id` y `resolveAgentContext` reflejada en docs_
- [x] Legacy retirado: lógica heurística de correlación de agente eliminada o deprecada
  - _Criterio: `npm run lint` pasa sin imports huérfanos; no hay código duplicado_
- [x] Sync de specs si C1 modifica comportamiento acordado (`openspec-sync`)
  - _Criterio: ejecutado si aplica; no ejecutado si no hay delta de specs_
- [x] Marcar C1 como `validada` en el registro y archivar el change hijo (`openspec-archive`)
  - _Criterio: columna Estado de C1 = `archivada`; change hijo en `openspec/changes/archive/`_

---

## C2 — Wire: join SSE `tool_use_id` ↔ subagente + fallback legacy

- [x] Verificar dependencias §43: C1 en estado `validada` o `archivada`
  - _Criterio: columna Estado de C1 = `validada` o `archivada` en el registro_
- [x] Crear change de segundo nivel `gateway-c2-sse-subagent-join` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-c2-sse-subagent-join/` con `.openspec.yaml` creado_
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de C2 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
- [x] Gate superado: pruebas de join `tool_use_id`↔subagente + fallback legacy E2E
  - _Criterio: `npm run test` sin errores; cobertura de join out-of-order y fallback sin cabeceras_
- [x] Documentación actualizada: `docs/session-audit-model.md`
  - _Criterio: correlación plano B (§23) descrita como implementada_
- [x] Legacy retirado: correlación pending heurística de subagente eliminada o deprecada
- [x] Sync de specs si aplica (`openspec-sync`)
- [x] Marcar C2 como `validada` y archivar el change hijo (`openspec-archive`)

---

## C3 — Hooks: endpoint `POST /hooks` + `AuditHookEventHandler`

- [x] Verificar dependencias §43: C1 en estado `validada` o `archivada`
  - _Criterio: columna Estado de C1 = `validada` o `archivada` en el registro_
- [x] Crear change de segundo nivel `gateway-c3-hooks-endpoint` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-c3-hooks-endpoint/` con `.openspec.yaml` creado_
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de C3 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
- [x] Gate superado: pruebas de `POST /hooks` y `AuditHookEventHandler` E2E
  - _Criterio: `npm run test` sin errores; hook `UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse` procesados_
- [x] Documentación actualizada: `README.md`, `docs/proposals/gateway-design.md`
  - _Criterio: endpoint `POST /hooks` y bus de eventos §28b descritos como implementados_
- [x] Sync de specs si aplica (`openspec-sync`)
- [x] Marcar C3 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G1 — Tipos gateway + domain services puros de cierre (`aggregateWorkflowUsage`, `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`; tipos `WorkflowResult/Workflow/Step/ToolUse`)

> Puede iniciarse en paralelo con las fases C (dependencia `—` en §43).

- [x] Verificar dependencias §43: ninguna (dependencia `—`)
- [x] Crear change de segundo nivel `gateway-g1-domain-types-services` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-g1-domain-types-services/` con `.openspec.yaml` creado_
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de G1 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: implementación respeta PKA — nuevos tipos y servicios en capa 1_
- [x] Domain services de cierre implementados en capa 1: `aggregateWorkflowUsage`, `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`
  - _Criterio: tipos `WorkflowResult`, `Workflow`, `Step`, `ToolUse` definidos; servicios puros sin dependencias de infraestructura_
- [x] Gate superado: `npm run test:quick` (lint + typecheck + unit) sin errores
- [x] Documentación actualizada: `docs/proposals/gateway-design.md` §39
  - _Criterio: tipos `Workflow`, `Step`, `ToolUse`, `WorkflowResult` y servicios de cierre descritos como implementados_
- [x] Legacy retirado: tipos `Interaction*` en capa 1 reemplazados
  - _Criterio: `npm run lint` pasa; no hay referencias huérfanas a `Interaction*` en capa 1_
  - _Nota (diferido G1): `InteractionType`, `InteractionOutcome`, `InteractionMetadata`,
    `ActiveInteraction`, `InteractionState`, `AuditInteractionContext` marcados `@deprecated`
    en `audit.types.ts` (2026-05-29). Eliminación efectiva diferida a la fase que migre el último
    consumidor en capas 2-5 (G4 o P, a confirmar al implementar G4)._
- [x] Sync de specs si aplica (`openspec-sync`)
- [x] Marcar G1 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G2 — `IWorkflowRepository` completo con lifecycle de cierre; integra costuras C1/C2/C3

- [x] Verificar dependencias §43: G1, C2 y C3 en estado `validada` o `archivada`
  - _Criterio: columnas Estado de G1, C2 y C3 = `validada` o `archivada` en el registro_
- [x] Crear change de segundo nivel `gateway-g2-workflow-repository` (skill `openspec-propose`)
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de G2 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `IWorkflowRepository` en capa 1 (interface); adapter en capa 2_
- [x] Lifecycle de cierre implementado: `readyToClose`, operaciones `open`/`close` integradas con costuras C1 (cabeceras), C2 (join SSE), C3 (hooks)
  - _Criterio: el repositorio gestiona el ciclo de vida completo del Workflow incluyendo transición `readyToClose` vía hooks_
- [x] Gate superado: `npm run test:quick` sin errores
- [x] Documentación actualizada: `docs/session-audit-model.md`
  - _Criterio: `IWorkflowRepository` como estado activo descrito en lugar de `ActiveInteraction`; lifecycle de cierre documentado_
- [x] Legacy retirado: `ActiveInteraction` en port capa 2 eliminado o deprecado
- [x] Sync de specs si aplica (`openspec-sync`)
- [x] Marcar G2 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G3 — Extraer `StepAssembler` desde `audit-sse-response.handler`

- [x] Verificar dependencias §43: G2 en estado `validada` o `archivada`
  - _Criterio: columna Estado de G2 = `archivada` en el registro_
- [x] Crear change de segundo nivel `gateway-g3-step-assembler` (skill `openspec-propose`)
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de G3 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `StepAssembler` extraído como servicio de capa 2; handler delgado_
- [x] Gate superado: `npm run test:quick` sin errores
- [x] Documentación actualizada: `docs/session-audit-model.md`
- [x] Legacy retirado: lógica de ensamblaje incrustada en `audit-sse-response.handler` eliminada
  - _Criterio: `npm run lint` + `npm run typecheck` pasan; no hay duplicación_
- [x] Sync de specs si aplica (`openspec-sync`)
  - _Criterio: `openspec/specs/gateway-step-assembly/spec.md` creado; delta G3 en `gateway-workflow-lifecycle`_
- [x] Marcar G3 como `validada` y archivar el change hijo (`openspec-archive`)
  - _Archivo: `openspec/changes/archive/2026-06-01--c00012-gateway-migration/phases/2026-05-29--c00007-gateway-g3-step-assembler/`; registro G3 = `archivada`_

---

## G4 — `AuditProjection` explícita; `AuditWorkflowClosureHandler` hook-driven; proyección `WorkflowResult`; aceptación E2E

- [x] Verificar dependencias §43: G3 en estado `validada` o `archivada`
  - _Criterio: columna Estado de G3 = `archivada` en el registro_
- [x] Crear change de segundo nivel `gateway-g4-audit-projection` (skill `openspec-propose`)
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de G4 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `AuditProjection` en capa 2; `InteractionMetadata` derivado de `WorkflowResult`_
- [x] `AuditWorkflowClosureHandler` hook-driven implementado: des-stub eventos `Stop`, `SubagentStop`, `StopFailure`
  - _Criterio: handler procesa los tres eventos de cierre vía bus de hooks; no usa stub transitorio_
- [x] Proyección `WorkflowResult` a disco implementada (subset §37b)
  - _Criterio: campos `outcome`, `closedByEvent`, `finalText`, `usage` escritos en `meta.json`_
- [x] Aceptación E2E (subset §37b): casos de cierre via hooks verificados
  - _Criterio: casos de cierre E2E del checklist §37b verificados; cierre wire-only solo como fallback_
- [x] Legacy retirado: cierre wire-only como ruta principal eliminado o deprecado; `InteractionMetadata` generado directamente reemplazado
- [x] Gate superado: `npm run test:quick` sin errores (si toca persistencia, `npm run test`)
- [x] Documentación actualizada: `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §40
- [x] Sync de specs si aplica (`openspec-sync`)
- [x] Marcar G4 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G5 — `ProviderCatalog` desde `routing/providers/`

> Puede iniciarse en paralelo con las fases C y G1 (dependencia `—` en §43).

- [x] Verificar dependencias §43: ninguna (dependencia `—`)
- [x] Crear change de segundo nivel `gateway-g5-provider-catalog` (skill `openspec-propose`)
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de G5 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `IProviderCatalog` en capa 1; `ProviderCatalogService` en capa 2; cableado en composition root_
- [x] Gate superado: `npm run test:quick` sin errores (37 archivos, 367 tests — 2026-05-30)
- [x] Documentación actualizada: `docs/proposals/gateway-design.md` §39 — bloque Estado G5 añadido
- [x] Legacy retirado: no existía `ProviderCatalog` inline en `src/`; item diferido a P0+ (anotado en registro)
- [x] Sync de specs si aplica (`openspec-sync`) — no aplica (comportamiento nuevo, no modifica specs existentes)
- [x] Marcar G5 como `validada` y archivar el change hijo (`openspec-archive`)

---

## P0 — Spike: confirmar inventario de integración del bus (Opción A ratificada)

> Las sesiones anteriores se eliminan antes del corte; no hay migración de datos en reposo.
> La Opción A (EventBus + SessionPersistence, §28b/§40) está ratificada. Este spike no decide entre A y B; produce el inventario que P1 ejecuta.
> **El diseño del layout objetivo ya está fijado** (naming `output/result.json`, fusión
> `state.json`→`meta.json`, schemas de §33.3 y §33.4b, decisiones D1/D2/D3 del orquestador).
> P0 solo confirma las preguntas de implementación: ubicaciones de código en `src/`,
> puntos de emisión, timer y composition root.

- [x] Verificar dependencias §43: G4 en estado `validada` o `archivada`
- [x] Crear change de segundo nivel `gateway-p0-layout-diff-spike` (skill `openspec-propose`)
  - _Criterio: spike documentado; no requiere gate de tests_
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de P0 a `validada` en el registro del orquestador
- [x] Spike completado: los cinco entregables del documento de spike están cubiertos
  - _Criterio 1 — Inventario de componentes:_ documento en `docs/` lista cada componente de §28b/§40 con su archivo destino propuesto en `src/` y su fase (P1 o P2)
  - _Criterio 2 — Puntos de emisión del correlador:_ para cada método de mutación de `WorkflowRepositoryService` se especifica qué evento de §28b.3 emite (`openWorkflow → workflow_start`, `openSubagentWorkflow → workflow_spawn`, `registerStep → step_request`, `registerToolUse → tool_call`, `completeToolUse → tool_result`, `close → workflow_complete | workflow_cancel`)
  - _Criterio 3 — Ownership del timer:_ confirmado que el timer de timeout permanece en el correlador (§24.1/G19); `SessionPersistence` no implementa timer propio
  - _Criterio 4 — Composition root:_ estrategia de cableado (dónde crear `EventBus`, inyectarlo en el correlador y en `SessionPersistence`) documentada para capa 4 (§42)
  - _Criterio 5 — Corte limpio:_ estrategia de eliminación de `sessions/` anterior especificada
- [x] Documentación actualizada: `docs/proposals/gateway-design.md` §28b, §40, §42 refleja el estado real
- [x] Marcar P0 como `validada` y archivar el change hijo (`openspec-archive`)
  - _Criterio: no requiere gate técnico; validación = spike documentado y revisado_
  - _Archivo: `openspec/changes/archive/2026-06-01--c00012-gateway-migration/phases/2026-05-30--c00010-gateway-p0-layout-diff-spike/`; registro P0 = `archivada`_

---

## P1 — Reescribir proyección: bus + estructura de directorios `causal-workflows-v1`

> Objetivo: crear la pila `IEventBus` → `EventBus` → `SessionPersistence`, conectar el correlador al bus y que las sesiones nuevas produzcan el árbol `causal-workflows-v1`. Retirar el layout flat completo. No se transforman sesiones anteriores.

- [x] Verificar dependencias §43: P0 y G4 en estado `validada` o `archivada`
  - _Criterio: columnas Estado de P0 y G4 = `validada` o `archivada`_
- [x] Crear change de segundo nivel `gateway-p1-new-session-layout` (skill `openspec-propose`)
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
- [x] Actualizar estado de P1 a `en-curso` en el registro del orquestador
- [x] Seguimiento de implementación del change hijo (`openspec-apply`)
- [x] Componentes de infraestructura creados (capa 1):
  - _`IEventBus` port en `src/1-domain/repositories/IEventBus.ts`_
  - _Tipos de telemetría (`TelemetryEvent`, `EventCallback`, `SubscriptionRef`) en `src/1-domain/types/telemetry.types.ts`_
  - _Matcher de patrones (`*`, `prefix_*`, `*_suffix`) en `src/1-domain/services/gateway/`_
- [x] Componentes de infraestructura creados (capa 2):
  - _`EventBus` adapter (pub/sub async in-process, fire-and-forget) en `src/2-services/event-bus.service.ts`_
  - _Funciones de rutas de sesión (`getWorkflowDir`, `getStepDir`, `getToolsDir`) para layout `causal-workflows-v1`_
  - _Utilidades de aislamiento async (`fireAndForget`, `withTimeout`) en `src/2-services/utils/`_
  - _`SessionPersistence` (parte estructural): suscriptores `session_start`, `workflow_start`, `workflow_spawn`, `workflow_complete`, `workflow_cancel`, `step_request`, `tool_call`, `tool_result` → escribe `meta.json` (estado fusionado, sin `state.json`), `output/result.json` + `output/result.parsed.md` (en `workflow_complete`), `request/body.json`, `tools/NN-name/{input,result,meta}.json` en `src/2-services/session-persistence.service.ts`_
- [x] Correlador conectado al bus:
  - _`WorkflowRepositoryService` recibe `IEventBus` en constructor y emite el evento correspondiente (§28b.3) en cada método de mutación de estado_
  - _Criterio: los seis puntos de emisión del mapa de adaptación están implementados_
- [x] Composition root cableado: `EventBus` creado e inyectado en correlador y `SessionPersistence` (capa 4, §42)
- [x] Gate superado: `npm run test` + subconjunto estructural del checklist §37b (casos 3–7, 16, 19)
  - _Criterio: nuevas sesiones generadas en tests adoptan la estructura `workflows/NN/`, `steps/MM/`, `tools/KK/`; todos los casos del subconjunto verificados. Casos 1 y 15 excluidos (artefactos nuevos, pertenecen a P2); caso 2 excluido (ya verde en G4)_
- [x] Documentación actualizada: `docs/session-audit-model.md`, `README.md`, `docs/proposals/gateway-design.md` §29, §30, §33, §37b, §40, §46.4
  - _Criterio: estructura `workflows/NN/`, `tools/KK/`, `output/result.json` descrita como el layout vigente para sesiones nuevas_
- [x] Legacy retirado:
  - _`session-store.service.ts` y `workflow-result-projector.service.ts` eliminados; `ISessionStore` / `IAuditWriter` retirados_
  - _`AuditWriterService` reducido a shim `ISseAuditWriter` (`@deprecated-p2`)_
  - _Constantes flat no usadas eliminadas de `audit-paths.ts`; `ActiveInteraction` eliminado_
  - _Handlers L3 sin `fs.write*` directos salvo SSE inline_
  - _Criterio: `npm run lint`, `npm run typecheck` y `npm run test` pasan_
- [x] Sync de specs (`openspec-sync` → `openspec/specs/event-bus`, `session-persistence`, `session-routing`, `gateway-audit-projection`)
- [x] Marcar P1 como `validada` y archivar el change hijo (`openspec-archive`)
  - _Archivado 2026-05-30 → `openspec/changes/archive/2026-06-01--c00012-gateway-migration/phases/2026-05-30--c00011-gateway-p1-new-session-layout`; documentación causal reescrita_

---

## P2 — Completar proyección: artefactos nuevos como suscripciones de `SessionPersistence`

> Objetivo: con la pila de bus existente (P1), añadir suscripciones que materializan **§33.1** (`events.ndjson`), **streaming forense** (`stream_chunk` → `streaming/`) y **§33.5** (`workflow-sequence.json`), y retirar el shim SSE. Tras P2, las sesiones nuevas cumplen **persistencia y forensia SSE** del layout objetivo; enriquecimientos de correlador del §37b marcados «fuera v1» en §45 no son requisito de P2.

- [x] Verificar dependencias §43: P1 en estado `validada` o `archivada`
  - _P1 archivada 2026-05-30 ✓_
- [x] Crear change de segundo nivel `gateway-p2-new-artifacts` (skill `openspec-propose`)
  - _Criterio: `openspec/changes/gateway-p2-new-artifacts/` con `proposal.md`, `design.md`, `specs/`, `tasks.md`; `openspec validate gateway-p2-new-artifacts` verde (2026-05-30)_
- [x] El `proposal.md` del change hijo incluye back-reference al orquestador
  - _Back-reference en `proposal.md` línea 3: «**Orquestador:** `gateway-migration` | **Fase:** p2 (P)» ✓_
- [x] Actualizar estado de P2 a `en-curso` en el registro del orquestador → `validada` (implementación completa)
- [x] Seguimiento de implementación del change hijo (`openspec-apply`) según P2-a…P2-h del `design.md` del change hijo
  - _P2-a…P2-h completados en commit 2026-06-01_
- [x] Suscripciones y emisión SSE implementadas (resumen; detalle en change hijo):
  - _Wildcard `*` → `sessions/<id>/events.ndjson` (§33.1) ✓_
  - _`stream_chunk` → `streaming/NNNN-chunk.ndjson`; `body.coalesced.json` al cierre del step coalesced ✓_
  - _`AuditSseResponseHandler` publica `stream_chunk` al bus (sin `sse.jsonl` inline) ✓_
  - _`workflow-sequence.json` en `workflow_start` / `workflow_complete` / `workflow_cancel` ✓_
  - _Coalesced (§37b #18): chunks por bus; `body.coalesced.json` / `.parsed.md` vía `SessionPersistence` (Opción A) ✓_
- [x] **P2-core — Gate para archivar P2**
  - _`npm run test` 321/321 sin errores ✓_
  - _Casos §37b verificados: **1, 12, 13, 14, 15, 18** — tests unitarios verdes ✓_
  - _Tareas P2-a…P2-h completadas ✓_
  - _`rg sse\.jsonl src/` → sin resultados; `rg ISseAuditWriter src/` → sin resultados ✓_
- [x] Documentación actualizada al estado post-P2 implementado
  - _`docs/session-audit-model.md`: tabla EventBus actualizada con P2 artefactos ✓_
  - _`docs/proposals/gateway-design.md` §37b: casos 1, 12–15, 18 → `implementado` ✓_
  - _`docs/proposals/gateway-design.md` §44 Layout disco: actualizado (sin «hasta P2») ✓_
  - _`docs/how-sse-reconstruction-works.md`: fuente P2+ descrita como `streaming/*.ndjson` ✓_
- [x] Legacy retirado: `ISseAuditWriter`, `AuditWriterService`, `sse.jsonl`, escrituras SSE inline en handler
  - _`rg sse\.jsonl src/` → sin resultados ✓_
  - _`rg ISseAuditWriter src/` → sin resultados ✓_
  - _`rg "appendSseLine|appendSseRawChunk" src/` → sin resultados ✓_
- [x] Sync de specs si aplica (`openspec-sync`) ✓
- [x] Marcar P2 como `validada` en el registro (línea 40 del `design.md` del orquestador) ✓
- [x] Archivar el change hijo (`openspec-archive gateway-p2-new-artifacts`) ✓

---

## Cierre de migración

- [x] Verificar que todas las fases (C1–C3, G1–G5, P0–P2) tienen estado `archivada` en el registro ✓
  - _Criterio: tabla del registro sin ningún estado `pendiente`, `en-curso` o `validada`_
  - _C0–P2 todas `archivada` en `design.md` ✓_
- [x] Verificación E2E global: matriz §37b — todos los casos con fase asignada verificados o marcados «fuera v1» en §45 ✓
  - _Criterio: casos P2-core (1, 12–15, 18) verdes; casos G4/P1 ya archivados; casos fuera v1 documentados en §45, no bloquean cierre_
  - _P1: 3,4,5,6,7,11,16p,19 implementados; G4: 2 implementado; P2: 1,12,13,14,15,18 implementados; fuera v1 (§45): 8,9t,10,16o,17,20 documentados — cobertura completa ✓_
- [x] Confirmar ausencia total de código y documentación zombie/legacy ✓
  - _Criterio: `npm run lint` + `npm run typecheck` pasan; búsqueda manual de referencias a `Interaction*`, `ActiveInteraction`, layout flat — sin resultados activos_
  - _`ISseAuditWriter`, `AuditWriterService`, `appendSseLine|appendSseRawChunk`, `InteractionMetadata`, `ActiveInteraction`, `main-agent/interactions` → 0 resultados en `src/` ✓_
  - _`npm run test` → 321/321 verde; lint+typecheck limpios ✓_
- [x] `README.md`, `docs/session-audit-model.md` y `docs/proposals/gateway-design.md` reflejan el estado final del sistema objetivo ✓
  - _Criterio: comparativa §44 refleja que todas las columnas "Objetivo" están implementadas_
  - _Ajuste documental quirúrgico aplicado (2026-06-01): §44 Tokens turno convergido, §8.2 shim retirado, §8.3 handler actualizado, §39 InteractionMetadata, referencias sse.jsonl actualizadas ✓_
- [x] Archivar el propio change orquestador (`openspec-archive`) ✓
  - _Criterio: `openspec/changes/gateway-migration/` movido a `openspec/changes/archive/`_
