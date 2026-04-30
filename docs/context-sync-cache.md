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

## Reglas de auditoría y observabilidad

- `context-sync-webfetch` con **HIT**: **Completamente transparente** — no se crea `interactionDir`, no se escribe `meta.json`, no queda rastro en disco. El observador humano solo ve el flujo limpio: subagente ejecuta WebFetch, agente principal recibe resultado.
- `context-sync-webfetch` con **MISS**: Se audita como side-request normal de **primer nivel** (no como sub-interacción). El `meta.json` incluye `contextSyncFallback: true`.
- `harness-auxiliary`: Se audita siempre como side-request normal.

### Indicador de inconsistencia

Un `contextSyncFallback: true` en `meta.json` es **comportamiento esperado** solo si:
- El subagente aún no completó su step cuando llegó la reinyección (latencia normal)
- El WebFetch fue hecho por el agente principal (no hay step en caché)

Es **inconsistencia potencial** (requiere investigación) si:
- El subagente completó **antes** del Context Sync (timestamps lo confirman)
- La URL coincide exactamente pero el caché no resolvió
- Indica race condition en el índice de `SessionStore` o timeout insuficiente

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

## Diagnóstico de gaps: Cuándo MISS es una inconsistencia

### Comportamiento esperado vs inconsistencia

| Escenario | HIT | MISS | Evaluación |
|-----------|:---:|:----:|------------|
| Subagente completó → Context Sync llega después | ✅ Transparente | `contextSyncFallback: true` | **Inconsistencia** — debería haber sido HIT |
| Subagente aún no completa cuando llega Context Sync | ✅ Espera | `contextSyncFallback: true` | **Esperado** — el caché no puede adivinar el futuro |
| WebFetch por agente principal (no subagente) | N/A (no hay step) | `contextSyncFallback: true` | **Esperado** — no hay step en caché |
| Context Sync llega > `CONTEXT_SYNC_MAX_WAIT_MS` después | ✅ Espera | `contextSyncFallback: true` | **Diseño** — timeout intencional |

### Pasos de verificación (si se sospecha inconsistencia)

Si encuentras `contextSyncFallback: true` en una sesión auditada:

1. **Identificar el subagente**: Buscar la interacción de subagente que debería haber hecho el WebFetch (misma sesión, timestamps cercanos)
2. **Comparar timestamps**: ¿El subagente completó su step **antes** del Context Sync?
   - Sí → Inconsistencia potencial (el caché debería haber resueldo)
   - No → Comportamiento esperado (race condition normal)
3. **Verificar URL**: ¿La URL en el side-request coincide exactamente con la del WebFetch del subagente?
   - Diferencias en query params, fragments, o normalización pueden causar MISS
4. **Revisar `steps/NNN/response/` del subagente**: ¿El step de WebFetch tiene `body.json` reconstruido correctamente?
   - Si el step falló o está incompleto, no hay entrada en el índice de caché

### Ejemplo real de inconsistencia

**Sesión:** `9810c57a-2168-40b8-ba51-5695ffafec5a`

- Subagente `000001` (WebFetch) completó en ~11.6s → step 001 con `response/body.json` reconstruido
- Context Sync (`000004`) llegó después → `contextSyncFallback: true`
- **Timestamps confirman**: Subagente terminó antes, Context Sync llegó después
- **Diagnóstico**: El `SessionStore` índice `(sessionId, url)` debería haber tenido la entrada
- **Acción**: Investigar `CONTEXT_SYNC_MAX_WAIT_MS` (¿5s fue suficiente?), race condition en registro de step resuelto, o posible limpieza prematura del índice

### Prevención y mejora continua

Para minimizar Context Sync MISS inesperados:

1. **Aumentar `CONTEXT_SYNC_MAX_WAIT_MS`** si la carga del sistema causa latencias en el registro de steps
2. **Verificar índice `SessionStore`**: El índice `(sessionId, url) → stepDir` debe persistir hasta que el Context Sync se resuelva o expire
3. **Monitorear métricas**: Contar ratio HIT vs MISS en side-requests de tipo `context-sync-webfetch`

---

**Relacionado:** Para análisis comparativo de sesiones entre harness nativo y proxy, ver el workflow `/analizar-sesion` y la skill `smart-code-proxy` en Claude Code.
