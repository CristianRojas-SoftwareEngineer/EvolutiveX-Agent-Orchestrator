## 1. Operations (capa 3)

- [x] 1.1 En `src/3-operations/audit-sse-response.handler.ts`, publish de `step_response` (~líneas 192-205): reemplazar `response: assembled.assistantMessage` por el envelope Message construido con `id: assembled.anthropicMessageId`, `type: 'message'`, `role: 'assistant'`, `model: assembled.model`, `content: assembled.assistantMessage.content`, `stop_reason: assembled.stopReason`, `stop_sequence: null` y `usage: assembled.usage` (design D1).

## 2. Tests

- [x] 2.1 En `tests/3-operations/audit-sse-response.handler.test.ts`: añadir asserts del shape del envelope en `payload.response` de `step_response` (campos `id`, `model`, `stop_reason`, `usage`, `content`, `type: 'message'`, `role: 'assistant'`, `stop_sequence: null`). Los tests actuales solo verifican `type: 'step_response'` y `workflowId` (líneas ~236-241 y ~363), no el shape de `payload.response` — esta tarea añade cobertura nueva, no ajusta asserts preexistentes. Verificar que ningún assert preexistente asume el shape `{role, content}` en la raíz (no debería existir según auditoría, pero confirmar).

## 3. Docs

- [x] 3.1 Verificar en `docs/gateway-architecture.md` la sección que documenta `workflows/MM/steps/NN/response/body.json` (tabla de artefactos, ~línea 1796) y, **si describe explícitamente un shape `{role, content}` para steps SSE**, actualizar para reflejar el envelope Message completo. Si la sección actual solo describe el **mecanismo** de reconstrucción (p. ej. `aggregateSseChunks`) sin afirmar shape alguno — caso verificado en auditoría — la edición es nula y este checkbox se cierra sin cambios, tras confirmar el estado actual mediante lectura. Verificar también que ningún otro doc bajo `docs/` afirme el shape viejo. **Estado: no-op** (tabla §26.2 solo describe mecanismo, sin afirmar shape).

## 4. Verificación y cierre

- [x] 4.1 Ejecutar `npm run test:quick` — suite verde (lint + typecheck + unit). ✅ 69 archivos, 646 tests verde.
- [x] 4.2 Ejecutar `openspec validate --strict project-sse-response-envelope` sin CRITICALs. ✅ "Change 'project-sse-response-envelope' is valid".
