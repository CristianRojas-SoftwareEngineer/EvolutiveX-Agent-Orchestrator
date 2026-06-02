## Context

El ensamblaje de la respuesta de inferencia está incrustado en el bucle `stream.on('data')` de `AuditSseResponseHandler` (`src/3-operations/audit-sse-response.handler.ts`). Ese bucle mezcla tres responsabilidades:

1. **Ensamblaje (objetivo de extracción):** acumular `usage` (con fallback de `message_delta`), `stopReason`, `anthropicMessageId`, `model`, bloques `thinking` y `tool_use` (incluido el JSON parcial de inputs de `Agent`).
2. **Persistencia de borde:** `sse.txt` (raw acotado por `MAX_AUDIT_BYTES`) y `sse.jsonl` (línea a línea, síncrono).
3. **Correlación legacy:** `ISessionStore.registerToolUseId`, `registerPendingAgentToolUse`, `registerPendingWebSearchToolUse`, `registerPendingWebFetchToolUse`.

El diseño objetivo ([§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo)) ubica el ensamblaje en un componente de infraestructura de capa 2 — `StepAssembler` (StepBuffer §26) — con responsabilidad única: RAM SSE → `assistantMessage`, `usage`, `stopReason`. Por separado, `IWorkflow.languageModelId` existe desde G1 pero nunca se asigna; el registro del orquestador (fase G3) exige propagarlo como prerequisito de `SessionMetricsService` (G4).

**Decisión de alcance (confirmada):** G3 es una **extracción behavior-preserving** + **propagación de modelo**. No cablea `registerStep`/`closeStep` desde el wire ni abre workflows/steps en `AuditInteractionHandler`; todo el registro de Steps en el correlador y la proyección a disco se difieren a G4.

## Goals / Non-Goals

**Goals:**
- Extraer el estado de ensamblaje SSE de `AuditSseResponseHandler` a un servicio `StepAssembler` (capa 2) con port `IStepAssembler`.
- El handler delega el ensamblaje y lee el resultado al cierre del stream, sin cambio de comportamiento observable (disco + side-effects legacy idénticos).
- Añadir `setWorkflowModel(workflowId, modelId)` al port `IWorkflowRepository` (capa 1) y su implementación (capa 2): primer modelo observado, idempotente, no-op si el workflow no existe.
- Propagar el modelo del request al correlador al completar la inferencia (capa 3), defensivamente.

**Non-Goals:**
- `registerStep`/`closeStep` desde la ruta wire (G4).
- Apertura de workflow/step en `AuditInteractionHandler` (§41) (G4).
- Proyección de `Step`/`WorkflowResult` a disco, `EventBus`, `AuditWorkflowClosureHandler` (G4).
- `aggregateWorkflowUsageByModel`, `SessionMetricsService` (G4).
- Retiro de `ActiveInteraction`, `InteractionMetadata`, cierre wire-only (G4).
- Migración de los side-effects de correlación legacy al bus de eventos (G4).

## Decisions

### 1. `StepAssembler` consume eventos ya parseados; el handler conserva el bucle de stream

El handler mantiene la propiedad del stream (parseo de líneas SSE, `sse.txt`, `sse.jsonl`, decoder). Por cada línea `data:` que ya parsea, invoca `assembler.onEvent(evt)`. El `StepAssembler` no toca disco ni `ISessionStore`: solo acumula estado de ensamblaje. Al `stream.on('end')`, el handler lee `assembler.result()` para construir `StepMeta` y la metadata, en lugar de las variables locales `stepUsage`/`stopReason`/`anthropicMessageId`/`thinkingBlocks`.

**Rationale:** un único parseo (en el handler) evita duplicar el bucle; el `StepAssembler` queda como acumulador puro de RAM, fiel a §26. Preserva el orden y la sincronía de las escrituras a disco existentes.

**Alternativa descartada:** que el `StepAssembler` reciba los `Buffer` crudos y haga su propio parseo/split de líneas. Rechazada: duplicaría el manejo de `StringDecoder`/`lineBuffer` y arriesgaría divergencia con la captura `sse.jsonl`.

### 2. Los side-effects de correlación legacy permanecen en el handler

`registerToolUseId` y los `registerPending*` siguen disparándose desde el bucle del handler, con el mismo timing (durante el stream, en `content_block_start`/`content_block_stop`). El `StepAssembler` expone los bloques `tool_use` ensamblados (con `subagent_type`/`description`/`prompt` parseados) para que el handler los use, pero la decisión de registrar pending sigue siendo del handler.

**Rationale:** mover estos side-effects al correlador/bus es trabajo de G4. Mantenerlos en su sitio garantiza el comportamiento behavior-preserving exigido por el gate de regresión.

### 3. `setWorkflowModel`: primer modelo observado, idempotente, no-op si ausente

Semántica alineada con el registro del orquestador ("primer modelo observado"). El adapter en memoria fija `languageModelId` solo si está `undefined`; un `workflowId` inexistente no lanza (el correlador nuevo corre en paralelo y puede no tener el workflow si los hooks no lo abrieron).

**Alternativa descartada:** sobrescribir siempre con el último modelo. Rechazada: en un workflow main multi-step el modelo puede variar por step; el desglose por modelo de G4 se hace por `Step.usage`, no por el campo de workflow. El campo `languageModelId` representa el modelo principal/primero del workflow.

### 4. Fuente del modelo: el modelo del request (no el de la respuesta)

§43 exige propagar `step.inferenceRequest.model`. Como G3 no registra Steps, el equivalente disponible es el modelo del request que el handler ya resuelve (`activeInteraction.modelId`). Se usa esa fuente. El `StepAssembler` también captura `message.model` (de la respuesta) para el resultado ensamblado, pero la propagación al workflow usa el modelo del request por fidelidad a §43.

### 5. Resolución del workflow en el correlador desde el handler SSE

Se inyecta `IWorkflowRepository` en `AuditSseResponseHandler` (nueva dependencia, cableada en composition root). El handler resuelve el `workflowId` con las claves ya disponibles: `sessionId` para el workflow main, `agentId` (vía `getWorkflowByAgentId`/contexto) para subagente. La propagación ocurre al detectar el cierre de inferencia (rama terminal del `stream.on('end')`).

## Componentes y firmas

```ts
// src/2-services/ports/step-assembler.port.ts (capa 2, port)
export interface AssembledInference {
  assistantMessage: AnthropicMessage;       // bloques text/thinking/tool_use consolidados
  usage: AnthropicUsage;                     // input/output/cache (con fallback message_delta)
  stopReason?: string;
  model?: string;                            // message.model (respuesta)
  anthropicMessageId?: string;
  toolUseBlocks: AssembledToolUseBlock[];    // { id, name, input, subagentType?, description?, prompt? }
}

export interface IStepAssembler {
  onEvent(evt: unknown): void;               // ingesta de un evento SSE Anthropic ya parseado
  result(): AssembledInference;              // snapshot ensamblado (llamar tras message_stop)
}
```

```ts
// src/1-domain/repositories/IWorkflowRepository.ts (capa 1, +1 método)
setWorkflowModel(workflowId: string, modelId: string): void;
```

## Archivos concretos a modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/2-services/ports/step-assembler.port.ts` | **Nuevo** — port `IStepAssembler` + tipos `AssembledInference`/`AssembledToolUseBlock` |
| `src/2-services/step-assembler.service.ts` | **Nuevo** — adapter en RAM; estado de ensamblaje extraído del handler |
| `src/1-domain/repositories/IWorkflowRepository.ts` | Añadir `setWorkflowModel` al port |
| `src/2-services/workflow-repository.service.ts` | Implementar `setWorkflowModel` (idempotente, no-op si ausente) |
| `src/3-operations/audit-sse-response.handler.ts` | Delegar ensamblaje en `IStepAssembler`; inyectar `IWorkflowRepository`; propagar modelo al cierre |
| `src/4-api/**` (composition root) | Inyectar `StepAssembler` (factory por inferencia) e `IWorkflowRepository` en el handler SSE |
| `docs/session-audit-model.md` | Documentar el `StepAssembler` como componente de ensamblaje y la propagación de `languageModelId` |

## Risks / Trade-offs

- **Regresión en la salida de auditoría:** la extracción toca el camino caliente del SSE. Mitigación: el gate de regresión son los tests E2E/unit existentes de SSE (`npm run test:quick`); la lógica de fallback de tokens y el tracking de `Agent`/thinking se trasladan literalmente.
- **Factory del `StepAssembler` por inferencia:** el assembler es estado mutable por stream; debe instanciarse uno por ejecución del handler (no singleton). El composition root inyecta una factory, no una instancia compartida.
- **Propagación no-op transitoria:** si los hooks no están configurados, el workflow main no existe en el correlador y `setWorkflowModel` no hace nada. Es aceptable en G3 (sin impacto en disco); el cableado wire→correlador completo llega en G4.
