## 1. Operations (capa 3)

- [ ] 1.1 En `src/3-operations/audit-sse-response.handler.ts`, publish de `step_response` (~líneas 192-205): reemplazar `response: assembled.assistantMessage` por el envelope Message construido con `id: assembled.anthropicMessageId`, `type: 'message'`, `role: 'assistant'`, `model: assembled.model`, `content: assembled.assistantMessage.content`, `stop_reason: assembled.stopReason`, `stop_sequence: null` y `usage: assembled.usage` (design D1).

## 2. Tests

- [ ] 2.1 En `tests/3-operations/audit-sse-response.handler.test.ts`: añadir/ajustar asserts del shape del envelope en `payload.response` de `step_response` (`id`, `model`, `stop_reason`, `usage`, `content`); actualizar cualquier assert existente que espere `{role, content}` en la raíz del payload.

## 3. Docs

- [ ] 3.1 Verificar en `docs/gateway-architecture.md` la sección que documenta `workflows/MM/steps/NN/response/body.json` (tabla de artefactos, ~línea 1796) y actualizar el shape descrito si cita solo `{role, content}` para steps SSE: el body proyectado pasa a ser el envelope Message completo.

## 4. Verificación y cierre

- [ ] 4.1 Ejecutar `npm run test:quick` — suite verde (lint + typecheck + unit).
- [ ] 4.2 Ejecutar `openspec verify project-sse-response-envelope` sin CRITICALs.
