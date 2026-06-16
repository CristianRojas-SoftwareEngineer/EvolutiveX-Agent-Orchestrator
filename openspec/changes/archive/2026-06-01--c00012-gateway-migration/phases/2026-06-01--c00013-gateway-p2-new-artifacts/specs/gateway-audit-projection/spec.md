## MODIFIED Requirements

### Requirement: Retiro de componentes legacy (P1)

El sistema SHALL retirar `SessionStoreService`, `WorkflowResultProjector`, el puerto `ISessionStore` y el puerto `IAuditWriter`. Los handlers L3 SHALL usar `IWorkflowRepository` + `EventBus`. La forensia SSE SHALL materializarse vía eventos `stream_chunk` y proyección en `SessionPersistence`; NO SHALL usar `ISseAuditWriter`, `AuditWriterService` ni `response/sse.jsonl` en código de producción tras P2.

#### Scenario: Sesiones nuevas usan layout causal-workflows-v1

- **GIVEN** un proxy con P1 implementado
- **WHEN** se procesa una solicitud completa (workflow + steps + tools)
- **THEN** los archivos de sesión SHALL crearse bajo `sessions/<id>/workflows/NN/steps/MM/tools/KK/`
- **AND** NO SHALL crearse archivos bajo el layout flat (`main-agent/interactions/`)

#### Scenario: No existen referencias a ISessionStore en producción

- **WHEN** se ejecuta `npm run typecheck`
- **THEN** NO SHALL existir referencias a `ISessionStore` ni `SessionStoreService` en `src/`

## ADDED Requirements

### Requirement: Retiro del shim ISseAuditWriter (P2)

Tras P2, el sistema SHALL NOT exponer ni usar `ISseAuditWriter` ni `AuditWriterService` en código de producción. `AuditSseResponseHandler` SHALL publicar eventos `stream_chunk` al `EventBus` y SHALL NOT escribir `sse.jsonl`, `sse.txt` ni artefactos SSE inline en disco.

#### Scenario: Handler SSE sin escritura directa

- **GIVEN** P2 implementado
- **WHEN** `AuditSseResponseHandler` procesa un stream SSE
- **THEN** SHALL publicar `stream_chunk` al bus por cada evento relevante
- **AND** SHALL NOT invocar métodos de escritura SSE en disco

#### Scenario: Sin sse.jsonl en producción

- **WHEN** se buscan referencias a `sse.jsonl` bajo `src/`
- **THEN** NO SHALL existir rutas de escritura de producción que creen `response/sse.jsonl`
