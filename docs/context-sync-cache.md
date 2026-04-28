# Context Sync Cache para WebFetch

## Problema

Claude Code puede emitir side-requests artificiales (`tools: []`) para sincronizar contexto después de un `web_fetch` ejecutado por subagentes. Esos side-requests suelen reprocesar HTML ya resumido y generan costo adicional + ruido de auditoría.

## Objetivo

Interceptar side-requests de tipo `context-sync-webfetch` y responder localmente con SSE simulada reutilizando el resumen ya generado por el step del subagente, sin llamar a Anthropic cuando hay HIT de caché.

## Heurística de detección

Se clasifica como `context-sync-webfetch` cuando:

1. `tools` es un array vacío.
2. El último mensaje de usuario contiene `Web page content:` y delimitadores `---`.
3. Se puede extraer una URL `http(s)` dentro del bloque entre los primeros dos delimitadores `---`.

Si no cumple todo, se clasifica como `harness-auxiliary`.

## Flujo HIT/MISS

### HIT

1. `AuditInteractionHandler` detecta side-request Context Sync.
2. `ContextSyncHandler` busca `(sessionId, url)` en `SessionStore`.
3. Si no existe aún, espera evento `onceWebFetchStepResolved(...)` hasta `CONTEXT_SYNC_MAX_WAIT_MS`.
4. Si aparece el step, extrae texto asistente de `steps/NNN/response/body.json`.
5. Construye SSE simulada (`message_start`, `content_block_*`, `message_delta`, `message_stop`).
6. `ProxyController` responde stream SSE al cliente y corta el upstream.
7. No se crea interacción en `sessions/` para ese side-request.

### MISS

1. No hay step resuelto dentro del timeout (o falla extracción).
2. Se degrada a flujo estándar side-request: forward a upstream + auditoría normal.
3. El `meta.json` resultante incluye `contextSyncFallback: true`.

## Reglas de auditoría

- `context-sync-webfetch` con HIT: **no se audita** (sin `interactionDir`, sin `meta.json`).
- `context-sync-webfetch` con MISS: se audita como side-request normal.
- `harness-auxiliary`: se audita siempre como side-request normal.

## Integración técnica

- Dominio:
  - `SideRequestSubType`
  - `WebFetchStepResolution`
  - `buildSimulatedSseFromText(...)`
- SessionStore:
  - Índice `(sessionId,url) -> stepDir`
  - EventEmitter para resolución tardía
- Handlers:
  - `ContextSyncHandler`
  - Branching en `AuditInteractionHandler.handleSideRequest`
  - Registro de resolución en `AuditSseResponseHandler` (solo turnos subagente)
- HTTP:
  - Respuesta short-circuit en `ProxyController.preHandler`

## Variables de entorno

- `CONTEXT_SYNC_CACHE_ENABLED` (default `true`): habilita/deshabilita caché.
- `CONTEXT_SYNC_MAX_WAIT_MS` (default `5000`): timeout de espera del step resuelto.
