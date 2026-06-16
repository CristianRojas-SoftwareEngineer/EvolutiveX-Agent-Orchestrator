## 1. Tool result fallback

- [x] 1.1 `extractToolResultBlocksFromRequestBody` en request-classifier
- [x] 1.2 `completeClientToolResultsFromContinuation` en audit-workflow.handler
- [x] 1.3 Test continuation emite `tool_result` y cierra tool

## 2. Session metrics wire close

- [x] 2.1 `finalizeWorkflowMetrics` tras cierre wire en audit-sse-response.handler

## 3. Verificación

- [x] 3.1 `npm run test:unit` — 595 tests verdes

## 4. Operacional (manual)

- [ ] 4.1 `npm run setup -- --hooks` en máquina del operador si falta `PostToolUse`
