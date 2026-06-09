## MODIFIED Requirements

### Requirement: SessionPersistence — suscripción al bus y proyección a disco

El sistema SHALL proveer `SessionPersistence` en `src/2-services/session-persistence.service.ts` como suscriptor del `EventBus` que, al recibir eventos del correlador y handlers, proyecta la estructura de directorios y archivos del layout `causal-workflows-v1` bajo `sessions/`.

`SessionPersistence` SHALL suscribirse a los siguientes eventos en su constructor:

| Evento | Acción |
|---|---|
| `workflow_start` | Crear `workflows/NN/`; escribir `meta.json` inicial (status: `running`). Si `request` presente, escribir `request/body.json`. Actualizar `workflows/workflow-sequence.json`. |
| `workflow_spawn` | Crear `workflows/NN/tools/KK-sub-agent/sub-agent/workflow/`; escribir `meta.json` del sub-workflow |
| `step_request` | Crear `steps/MM/`; si `request` presente, escribir `request/body.json` |
| `step_response` | Escribir `response/body.json`, `response/headers.json`, `response/parsed.md` según campos presentes en payload |
| `tool_call` | Crear `tools/KK-slug/`; escribir `input.json` y `meta.json` |
| `tool_result` | Escribir `result.json` en `tools/KK-slug/`; actualizar `meta.json` del tool |
| `workflow_complete` | Actualizar `meta.json` (status: `completed`); escribir `output/result.json` + `output/result.parsed.md`; actualizar `workflow-sequence.json` |
| `workflow_cancel` | Actualizar `meta.json` (status: `cancelled`, `cancellationReason`); actualizar `workflow-sequence.json` |
| `stream_chunk` | Escribir `steps/MM/response/streaming/NNNN-chunk.ndjson`; al cierre del step con `coalescedDelegationStepIndex`, generar `body.coalesced.json` y `body.coalesced.parsed.md` |
| `*` (wildcard) | Append-only a `sessions/<sessionId>/events.ndjson` por cada evento recibido |

En `workflow_start`, `meta.json` SHALL incluir `workflowKind` (estructural: `main` | `subagent`) y `interactionType` (semántico: `agentic` | `side-request` | `client-preflight`, desde payload `workflowKind` del correlador).

El evento `step_request` emitido por handlers L3 SHALL transportar el body HTTP parseado completo. El correlador (`registerStep`) NO SHALL emitir `step_request` con `inferenceRequest` sintético (`messages: []`).

Para un hop HTTP completo, `step_request` y `step_response` del mismo hop SHALL compartir el mismo `stepIndex`, produciendo `steps/MM/request/` y `steps/MM/response/` bajo el mismo directorio `MM` según `docs/session-audit-model.md`.

#### Scenario: Hop unificado en disco

- **GIVEN** ingress emitió `step_request` con `stepIndex: 0` y egress emitió `step_response` con `stepIndex: 0`
- **WHEN** `SessionPersistence` proyecta ambos eventos
- **THEN** SHALL existir `steps/00/request/body.json` y `steps/00/response/body.json`
- **AND** NO SHALL existir `steps/01/response/` solo para la response de ese hop

#### Scenario: workflow_start persiste interactionType semántico

- **GIVEN** un evento `workflow_start` con `kind: 'main'` y `workflowKind: 'side-request'`
- **WHEN** `SessionPersistence` procesa el evento
- **THEN** `meta.json` SHALL contener `workflowKind: 'main'` y `interactionType: 'side-request'`

#### Scenario: step_request de continuación preserva messages con tool_result

- **GIVEN** un handler L3 que emite `step_request` con `request.messages` conteniendo bloques `tool_result`
- **WHEN** `SessionPersistence` escribe `steps/MM/request/body.json`
- **THEN** el archivo SHALL contener el array `messages` completo del body HTTP
- **AND** NO SHALL quedar `messages: []` cuando el body upstream incluye historial
