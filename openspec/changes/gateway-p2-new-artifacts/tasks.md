## 1. Publicación `stream_chunk` (P2-a)

- [x] 1.1 Inyectar `IEventBus` en `AuditSseResponseHandler` y cablear en `composition-root.ts`
- [x] 1.2 Publicar `stream_chunk` por cada evento SSE parseado (payload: chunk, secuencia, `workflowId`, `stepIndex`)
- [x] 1.3 Verificar: sin `appendSseLine` ni `appendSseRawChunk` en el handler (`npm run test:quick`) ✓

## 2. Persistencia de chunks (P2-b)

- [x] 2.1 Suscribir `stream_chunk` en `SessionPersistence`
- [x] 2.2 Escribir `steps/MM/response/streaming/NNNN-chunk.ndjson` (secuencia monotónica, 4 dígitos)
- [x] 2.3 Excluir eventos `ping` de la persistencia (test unitario §37b #13) ✓

## 3. Reconstrucción de body (P2-c)

- [x] 3.1 `body.json` y `body.parsed.md` escritos por `SessionPersistence` en `step_response` (P1, confirmado)
- [x] 3.2 Verificar casos §37b #12 y #14 en tests ✓ (`reconstructStepMessage` / `reconstructStepPhaseMessage`)

## 4. `events.ndjson` (P2-d)

- [x] 4.1 Suscribir patrón `*` en `SessionPersistence`; append-only en `sessions/<sessionId>/events.ndjson`
- [x] 4.2 Verificar caso §37b #1 en test ✓

## 5. `workflow-sequence.json` (P2-e)

- [x] 5.1 Crear/actualizar `workflows/workflow-sequence.json` en `workflow_start`, `workflow_complete`, `workflow_cancel`
- [x] 5.2 Verificar caso §37b #15 en test ✓

## 6. `SseReconstructService` (P2-f)

- [x] 6.1 Leer chunks desde `response/streaming/*.ndjson` en orden; añadir `reconstructStepPhaseMessage(stepDir, phase)`
- [x] 6.2 Actualizar tests de reconstrucción sin dependencia de `sse.jsonl` ✓

## 7. Coalesced (P2-g, Opción A)

- [x] 7.1 Publicar `stream_chunk` para todas las fases del flujo coalesced (delegation + continuation con phase tag)
- [x] 7.2 `SessionPersistence.onStepResponse` genera `body.coalesced.json` y `body.coalesced.parsed.md` al detectar `coalescedDelegationStepIndex`
- [x] 7.3 Verificar caso §37b #18; sin `writeCoalescedAgentStepResponse` en producción ✓

## 8. Retiro shim SSE (P2-h)

- [x] 8.1 Eliminar `ISseAuditWriter`, `AuditWriterService` y usos en producción
- [x] 8.2 Constantes `DIR_STEPS`, `DIR_STEP_REQUEST`, `DIR_STEP_RESPONSE`, `PAD_STEP` en `audit-paths.ts` conservadas (usadas por tests legacy que no son producción)
- [x] 8.3 `audit-writer.test.ts` eliminado; `sse-reconstruct.test.ts` actualizado para no usar `AuditWriterService`
- [x] 8.4 `rg sse\.jsonl src/` → sin resultados; `rg ISseAuditWriter src/` → sin resultados ✓

## 9. Gate, documentación y gobernanza

- [x] 9.1 `npm run test` 321/321 sin errores ✓
- [x] 9.2 Casos P2-core §37b verificados: **1, 12, 13, 14, 15, 18** (tests unitarios) ✓
- [x] 9.3 Actualizar `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §33/§37b/§44, `docs/how-sse-reconstruction-works.md` ✓
- [x] 9.4 §37b casos 1, 12–15, 18 → `implementado`; §44 Layout disco actualizado ✓
- [ ] 9.5 `openspec-sync` → `openspec/specs/`
- [x] 9.6 P2 marcada `validada` en registro del orquestador (`design.md` línea 40) ✓
- [ ] `openspec-archive gateway-p2-new-artifacts`
