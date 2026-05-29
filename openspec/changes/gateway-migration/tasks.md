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

- [ ] Verificar dependencias §43: ninguna (dependencia `—`)
  - _Criterio: no aplica; puede iniciarse en cualquier momento_
- [x] Crear change de segundo nivel `gateway-c1-wire-agent-headers` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-c1-wire-agent-headers/` con `.openspec.yaml` creado_
- [x] El `proposal.md` del change hijo incluye back-reference `Orquestador: gateway-migration | Fase: c1 (C)`
  - _Criterio: línea de back-reference presente en `proposal.md`_
- [x] Actualizar estado de C1 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: todos los tasks.md del change hijo marcados como completados_
- [ ] Gate superado: pruebas de correlación identidad/cabeceras E2E pasan
  - _Criterio: `npm run test:quick` sin errores (lint + typecheck + suite Vitest completa)_
- [ ] Documentación actualizada: `README.md`, `docs/session-audit-model.md`
  - _Criterio: descripción de cabeceras `agent-id` y `resolveAgentContext` reflejada en docs_
- [ ] Legacy retirado: lógica heurística de correlación de agente eliminada o deprecada
  - _Criterio: `npm run lint` pasa sin imports huérfanos; no hay código duplicado_
- [ ] Sync de specs si C1 modifica comportamiento acordado (`openspec-sync`)
  - _Criterio: ejecutado si aplica; no ejecutado si no hay delta de specs_
- [ ] Marcar C1 como `validada` en el registro y archivar el change hijo (`openspec-archive`)
  - _Criterio: columna Estado de C1 = `archivada`; change hijo en `openspec/changes/archive/`_

---

## C2 — Wire: join SSE `tool_use_id` ↔ subagente + fallback legacy

- [ ] Verificar dependencias §43: C1 en estado `validada` o `archivada`
  - _Criterio: columna Estado de C1 = `validada` o `archivada` en el registro_
- [ ] Crear change de segundo nivel `gateway-c2-sse-subagent-join` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-c2-sse-subagent-join/` con `.openspec.yaml` creado_
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de C2 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
- [ ] Gate superado: pruebas de join `tool_use_id`↔subagente + fallback legacy E2E
  - _Criterio: `npm run test` sin errores; cobertura de join out-of-order y fallback sin cabeceras_
- [ ] Documentación actualizada: `docs/session-audit-model.md`
  - _Criterio: correlación plano B (§23) descrita como implementada_
- [ ] Legacy retirado: correlación pending heurística de subagente eliminada o deprecada
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar C2 como `validada` y archivar el change hijo (`openspec-archive`)

---

## C3 — Hooks: endpoint `POST /hooks` + `AuditHookEventHandler`

- [ ] Verificar dependencias §43: C1 en estado `validada` o `archivada`
  - _Criterio: columna Estado de C1 = `validada` o `archivada` en el registro_
- [ ] Crear change de segundo nivel `gateway-c3-hooks-endpoint` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-c3-hooks-endpoint/` con `.openspec.yaml` creado_
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de C3 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
- [ ] Gate superado: pruebas de `POST /hooks` y `AuditHookEventHandler` E2E
  - _Criterio: `npm run test` sin errores; hook `UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse` procesados_
- [ ] Documentación actualizada: `README.md`, `docs/proposals/gateway-design.md`
  - _Criterio: endpoint `POST /hooks` y bus de eventos §28b descritos como implementados_
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar C3 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G1 — Tipos gateway + domain services puros de cierre (`aggregateWorkflowUsage`, `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`; tipos `WorkflowResult/Workflow/Step/ToolUse`)

> Puede iniciarse en paralelo con las fases C (dependencia `—` en §43).

- [ ] Verificar dependencias §43: ninguna (dependencia `—`)
- [ ] Crear change de segundo nivel `gateway-g1-domain-types-services` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/gateway-g1-domain-types-services/` con `.openspec.yaml` creado_
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de G1 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: implementación respeta PKA — nuevos tipos y servicios en capa 1_
- [ ] Domain services de cierre implementados en capa 1: `aggregateWorkflowUsage`, `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`
  - _Criterio: tipos `WorkflowResult`, `Workflow`, `Step`, `ToolUse` definidos; servicios puros sin dependencias de infraestructura_
- [ ] Gate superado: `npm run test:quick` (lint + typecheck + unit) sin errores
- [ ] Documentación actualizada: `docs/proposals/gateway-design.md` §39
  - _Criterio: tipos `Workflow`, `Step`, `ToolUse`, `WorkflowResult` y servicios de cierre descritos como implementados_
- [ ] Legacy retirado: tipos `Interaction*` en capa 1 reemplazados
  - _Criterio: `npm run lint` pasa; no hay referencias huérfanas a `Interaction*` en capa 1_
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar G1 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G2 — `IWorkflowRepository` completo con lifecycle de cierre; integra costuras C1/C2/C3

- [ ] Verificar dependencias §43: G1, C2 y C3 en estado `validada` o `archivada`
  - _Criterio: columnas Estado de G1, C2 y C3 = `validada` o `archivada` en el registro_
- [ ] Crear change de segundo nivel `gateway-g2-workflow-repository` (skill `openspec-propose`)
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de G2 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `IWorkflowRepository` en capa 1 (interface); adapter en capa 2_
- [ ] Lifecycle de cierre implementado: `readyToClose`, operaciones `open`/`close` integradas con costuras C1 (cabeceras), C2 (join SSE), C3 (hooks)
  - _Criterio: el repositorio gestiona el ciclo de vida completo del Workflow incluyendo transición `readyToClose` vía hooks_
- [ ] Gate superado: `npm run test:quick` sin errores
- [ ] Documentación actualizada: `docs/session-audit-model.md`
  - _Criterio: `IWorkflowRepository` como estado activo descrito en lugar de `ActiveInteraction`; lifecycle de cierre documentado_
- [ ] Legacy retirado: `ActiveInteraction` en port capa 2 eliminado o deprecado
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar G2 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G3 — Extraer `StepAssembler` desde `audit-sse-response.handler`

- [ ] Verificar dependencias §43: G2 en estado `validada` o `archivada`
- [ ] Crear change de segundo nivel `gateway-g3-step-assembler` (skill `openspec-propose`)
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de G3 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `StepAssembler` extraído como servicio de capa 2; handler delgado_
- [ ] Gate superado: `npm run test:quick` sin errores
- [ ] Documentación actualizada: `docs/session-audit-model.md`
- [ ] Legacy retirado: lógica de ensamblaje incrustada en `audit-sse-response.handler` eliminada
  - _Criterio: `npm run lint` + `npm run typecheck` pasan; no hay duplicación_
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar G3 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G4 — `AuditProjection` explícita; `AuditWorkflowClosureHandler` hook-driven; proyección `WorkflowResult`; aceptación E2E

- [ ] Verificar dependencias §43: G3 en estado `validada` o `archivada`
- [ ] Crear change de segundo nivel `gateway-g4-audit-projection` (skill `openspec-propose`)
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de G4 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `AuditProjection` en capa 2; `InteractionMetadata` derivado de `WorkflowResult`_
- [ ] `AuditWorkflowClosureHandler` hook-driven implementado: des-stub eventos `Stop`, `SubagentStop`, `StopFailure`
  - _Criterio: handler procesa los tres eventos de cierre vía bus de hooks; no usa stub transitorio_
- [ ] Proyección `WorkflowResult` a disco implementada (subset §37b)
  - _Criterio: campos `outcome`, `closedByEvent`, `finalText`, `usage` escritos en `meta.json`_
- [ ] Aceptación E2E (subset §37b): casos de cierre via hooks verificados
  - _Criterio: casos de cierre E2E del checklist §37b verificados; cierre wire-only solo como fallback_
- [ ] Legacy retirado: cierre wire-only como ruta principal eliminado o deprecado; `InteractionMetadata` generado directamente reemplazado
- [ ] Gate superado: `npm run test:quick` sin errores (si toca persistencia, `npm run test`)
- [ ] Documentación actualizada: `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §40
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar G4 como `validada` y archivar el change hijo (`openspec-archive`)

---

## G5 — `ProviderCatalog` desde `routing/providers/`

> Puede iniciarse en paralelo con las fases C y G1 (dependencia `—` en §43).

- [ ] Verificar dependencias §43: ninguna (dependencia `—`)
- [ ] Crear change de segundo nivel `gateway-g5-provider-catalog` (skill `openspec-propose`)
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de G5 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
  - _Criterio: `ProviderCatalog` como entidad de capa 1; cargado desde `routing/providers/`_
- [ ] Gate superado: `npm run test:quick` sin errores
- [ ] Documentación actualizada: `docs/proposals/gateway-design.md` §39
- [ ] Legacy retirado: `ProviderCatalog` inline en `routing/` eliminado o consolidado
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar G5 como `validada` y archivar el change hijo (`openspec-archive`)

---

## P0 — Spike: diff layout SCP actual vs `causal-workflows-v1` + coste migración

- [ ] Verificar dependencias §43: G4 en estado `validada` o `archivada`
- [ ] Crear change de segundo nivel `gateway-p0-layout-diff-spike` (skill `openspec-propose`)
  - _Criterio: spike documentado; no requiere gate de tests_
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de P0 a `en-curso` en el registro del orquestador
- [ ] Spike completado: diff entre layout actual y `causal-workflows-v1` documentado
  - _Criterio: documento de spike en `docs/` describe rutas actuales vs objetivo, coste de migración y estrategia_
- [ ] Documentación actualizada: `docs/proposals/gateway-design.md` §29–§37 refleja el estado real
- [ ] Marcar P0 como `validada` y archivar el change hijo (`openspec-archive`)
  - _Criterio: no requiere gate técnico; validación = spike documentado y revisado_

---

## P1 — Migración estructura directorios (`workflows/NN/`, `tools/KK/`)

- [ ] Verificar dependencias §43: P0 y G4 en estado `validada` o `archivada`
  - _Criterio: columnas Estado de P0 y G4 = `validada` o `archivada`_
- [ ] Crear change de segundo nivel `gateway-p1-directory-migration` (skill `openspec-propose`)
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de P1 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
- [ ] Gate superado: `npm run test` + subconjunto del checklist §37b (casos 1–7, 15, 16, 19)
  - _Criterio: todos los casos del subconjunto verificados manualmente o por test suite_
- [ ] Documentación actualizada: `docs/session-audit-model.md`, `README.md`, `docs/proposals/gateway-design.md` §30
  - _Criterio: nueva estructura `workflows/NN/`, `tools/KK/` descrita como implementada_
- [ ] Legacy retirado: layout flat `sessions/{session}/{interaction}/` eliminado
  - _Criterio: no quedan rutas de escritura al layout antiguo en `src/`_
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar P1 como `validada` y archivar el change hijo (`openspec-archive`)

---

## P2 — Artefactos nuevos (`events.ndjson`, `workflow-sequence.json`, `streaming/*.ndjson`)

- [ ] Verificar dependencias §43: P1 en estado `validada` o `archivada`
- [ ] Crear change de segundo nivel `gateway-p2-new-artifacts` (skill `openspec-propose`)
- [ ] El `proposal.md` del change hijo incluye back-reference al orquestador
- [ ] Actualizar estado de P2 a `en-curso` en el registro del orquestador
- [ ] Seguimiento de implementación del change hijo (`openspec-apply`)
- [ ] Gate superado: `npm run test` + checklist [§37b](../../../docs/proposals/gateway-design.md#37b-checklist-de-aceptación-e2e-del-layout) completo (20 casos)
  - _Criterio: los 20 casos de §37b verificados; `npm run test` sin errores_
- [ ] Documentación actualizada: `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §33
  - _Criterio: `events.ndjson`, `workflow-sequence.json`, `streaming/*.ndjson` descritos como implementados_
- [ ] Legacy retirado: artefactos de persistencia obsoletos eliminados
- [ ] Sync de specs si aplica (`openspec-sync`)
- [ ] Marcar P2 como `validada` y archivar el change hijo (`openspec-archive`)

---

## Cierre de migración

- [ ] Verificar que todas las fases (C1–C3, G1–G5, P0–P2) tienen estado `archivada` en el registro
  - _Criterio: tabla del registro sin ningún estado `pendiente`, `en-curso` o `validada`_
- [ ] Verificación E2E global: checklist [§37b](../../../docs/proposals/gateway-design.md#37b-checklist-de-aceptación-e2e-del-layout) completo (20 casos) pasado
  - _Criterio: todos los casos verificados con el sistema final_
- [ ] Confirmar ausencia total de código y documentación zombie/legacy
  - _Criterio: `npm run lint` + `npm run typecheck` pasan; búsqueda manual de referencias a `Interaction*`, `ActiveInteraction`, layout flat — sin resultados activos_
- [ ] `README.md`, `docs/session-audit-model.md` y `docs/proposals/gateway-design.md` reflejan el estado final del sistema objetivo
  - _Criterio: comparativa §44 refleja que todas las columnas "Objetivo" están implementadas_
- [ ] Archivar el propio change orquestador (`openspec-archive`)
  - _Criterio: `openspec/changes/gateway-migration/` movido a `openspec/changes/archive/`_
