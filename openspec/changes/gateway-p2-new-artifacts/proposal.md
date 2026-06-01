## Why

> **Orquestador:** `gateway-migration` | **Fase:** p2 (P)

P1 materializó el árbol `causal-workflows-v1` vía `EventBus` + `SessionPersistence`, pero la forensia SSE sigue en un shim (`ISseAuditWriter` / `AuditWriterService`) que escribe `sse.jsonl` directamente desde `AuditSseResponseHandler`, en conflicto con §28b.4 regla 1 para el camino de streaming.

P2 completa la persistencia objetivo: log cronológico (`events.ndjson`), chunks forenses (`streaming/NNNN-chunk.ndjson`), índice `workflow-sequence.json` y retiro del shim SSE. Las sesiones nuevas cumplen **persistencia y forensia SSE** del diseño §33; los casos §37b marcados «fuera v1» en [§45](../../../docs/proposals/gateway-design.md#45-fuera-de-alcance-v1) no son requisito de esta fase.

## What Changes

- **Suscripción wildcard `*`** en `SessionPersistence` → append-only `sessions/<id>/events.ndjson` (§33.1).
- **Evento `stream_chunk`** emitido por `AuditSseResponseHandler` al bus; `SessionPersistence` persiste cada chunk y reconstruye `response/body.json` (+ `parsed.md`) al cierre del step.
- **`workflow-sequence.json`** actualizado en `workflow_start` / `workflow_complete` / `workflow_cancel` (§33.5).
- **Coalesced (Opción A):** todas las fases SSE del step publican `stream_chunk`; vistas `body.coalesced.json` / `body.coalesced.parsed.md` las genera persistencia al cerrar el step.
- **Retiro legacy:** `ISseAuditWriter`, `AuditWriterService`; `SseReconstructService` lee `streaming/*.ndjson` en lugar de `sse.jsonl`.

## Capabilities

### New Capabilities

_(ninguna — extensión de capacidades existentes vía deltas MODIFIED/ADDED)_

### Modified Capabilities

- `session-persistence`: suscripciones `*` y `stream_chunk`; `workflow-sequence.json`; reconstrucción de body; salidas coalesced.
- `gateway-audit-projection`: retiro del shim `ISseAuditWriter`; handlers L3 sin escritura SSE directa.
- `gateway-step-assembly`: forensia SSE vía bus/streaming, no `sse.jsonl`.

## No objetivos

- Casos §37b fuera v1: #8, #10, #17, #16 (`detectOrphans()`), #20 — ver §45 de `gateway-design.md`.
- Timer automático §24.1 (caso #9): cadena hook → `tool_result` ya cubierta en G2/P1; timer del correlador fuera v1.
- `session_start` / `session_complete` en bus (diferidos desde P0).
- Retiro masivo de tipos `Interaction*` en `audit.types.ts` (cierre del orquestador).
- Migración de sesiones anteriores al layout.

## Impact

- **Capas PKA:** L2 (`SessionPersistence`, `SseReconstructService`), L3 (`AuditSseResponseHandler`), L4 (`composition-root.ts`).
- **Directorios:** `src/2-services/`, `src/3-operations/`, `tests/`.
- **Gate P2-core:** casos §37b **1, 12, 13, 14, 15, 18** + `npm run test` (ver [§37b](../../../docs/proposals/gateway-design.md#37b-checklist-de-aceptación-e2e-del-layout)).
- **Docs:** `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §33/§37b/§44, `docs/how-sse-reconstruction-works.md`.
