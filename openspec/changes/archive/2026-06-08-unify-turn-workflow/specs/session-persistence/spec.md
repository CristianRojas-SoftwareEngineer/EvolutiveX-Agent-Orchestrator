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

En `workflow_start`, `meta.json` SHALL incluir `workflowKind` (estructural: `main` | `subagent`) y `interactionType` (semántico: `agentic` | `side-request`, desde payload `workflowKind` del correlador). Los valores `session-shell` y `client-preflight` SHALL NOT persistirse como `interactionType`.

Los índices `NN`, `MM`, `KK` en rutas de disco SHALL ser **base 1** (`01`, `02`, …), alineados con `layoutIndex`, `stepIndex` y `toolIndex` de los eventos sin offset oculto.

`workflow-sequence.json` SHALL registrar **una** fila por turno de usuario (un `workflow_start` de turno por ciclo `UserPromptSubmit` → `Stop`).

El evento `step_request` emitido por handlers L3 SHALL transportar el body HTTP parseado completo y `stepKind` cuando aplique. El correlador (`registerStep`) NO SHALL emitir `step_request` con `inferenceRequest` sintético (`messages: []`).

Para un hop HTTP completo, `step_request` y `step_response` del mismo hop SHALL compartir el mismo `stepIndex`, produciendo `steps/MM/request/` y `steps/MM/response/` bajo el mismo directorio `MM` según `docs/session-audit-model.md`.

`SessionPersistence` SHALL NOT mantener un contador `nextWorkflowIndex` independiente del correlador salvo fallback defensivo inicializado en `1` y resincronizado tras `workflow_start` con `layoutIndex` explícito.

#### Scenario: Hop unificado en disco base 1

- **GIVEN** ingress emitió `step_request` con `stepIndex: 1` y egress emitió `step_response` con `stepIndex: 1`
- **WHEN** `SessionPersistence` proyecta ambos eventos
- **THEN** SHALL existir `steps/01/request/body.json` y `steps/01/response/body.json`
- **AND** NO SHALL existir `steps/02/response/` solo para la response de ese hop

#### Scenario: workflow_start persiste interactionType agentic para turno

- **GIVEN** un evento `workflow_start` con `kind: 'main'` y `workflowKind: 'agentic'` (turno de usuario)
- **WHEN** `SessionPersistence` procesa el evento
- **THEN** `meta.json` SHALL contener `workflowKind: 'main'` y `interactionType: 'agentic'`
- **AND** la carpeta SHALL ser `workflows/01/` para el primer turno de la sesión

#### Scenario: workflow-sequence una fila por turno

- **GIVEN** un turno con side-request + agentic fresh + continuation bajo un único workflow
- **WHEN** el turno cierra con `workflow_complete`
- **THEN** `workflow-sequence.json` SHALL contener una sola entrada para ese `layoutIndex`
- **AND** `workflowIndex` SHALL ser base 1

#### Scenario: step_request persiste stepKind

- **GIVEN** un evento `step_request` con `stepKind: 'side-request'`
- **WHEN** `SessionPersistence` escribe el meta del step
- **THEN** el meta del step SHALL incluir `stepKind: 'side-request'`

#### Scenario: step_request de continuación preserva messages con tool_result

- **GIVEN** un handler L3 que emite `step_request` con `request.messages` conteniendo bloques `tool_result`
- **WHEN** `SessionPersistence` escribe `steps/MM/request/body.json`
- **THEN** el archivo SHALL contener el array `messages` completo del body HTTP
- **AND** NO SHALL quedar `messages: []` cuando el body upstream incluye historial

## REMOVED Requirements

### Requirement: SessionPersistence — escenarios shell y side-request como workflow

Los escenarios que persistían `interactionType: 'session-shell'` o abrían workflows hermanos por `side-request` quedan obsoletos.

**Reason**: Fusión de turno en un único workflow; `side-request` es `stepKind` bajo el turno.

**Migration**: Consultar `stepKind` en meta del step; filtrar workflows por `interactionType: agentic` a nivel turno.
