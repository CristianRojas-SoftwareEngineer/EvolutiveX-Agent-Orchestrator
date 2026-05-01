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

1. `AuditInteractionHandler.handleSideRequest()` detecta side-request Context Sync.
2. Calcula `htmlHash` (SHA-256 del HTML extraído entre fences) y `promptHash` (SHA-256 del sufijo constante del harness).
3. `SessionStoreService.resolveContextSyncCache(htmlHash, promptHash)` busca en el caché in-memory.
4. Si encuentra entrada válida (no expirada): retorna el response cacheado.
5. `buildSimulatedSseFromText()` construye SSE simulada (`message_start`, `content_block_*`, `message_delta`, `message_stop`).
6. El proxy responde stream SSE al cliente y corta el upstream.
7. **No se crea interacción en `sessions/`** para ese side-request (completamente transparente).

### MISS

1. No hay entrada en caché (o expirada).
2. Se degrada a flujo estándar side-request: forward a upstream + auditoría normal.
3. El `meta.json` resultante incluye `contextSyncFallback: true`.

### Registro en caché (post-MISS)

Cuando un side-request Context Sync se procesa como fallback (MISS), el proxy audita normalmente. El registro en caché se realiza cuando el step de WebFetch del subagente se completa, permitiendo que futuros Context Sync para la misma URL beneficien del HIT.

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
- Indica race condition en el registro o TTL insuficiente

## Integración técnica

- Dominio:
  - `SideRequestSubType` (`context-sync-webfetch` | `harness-auxiliary`)
  - `buildSimulatedSseFromText()` — construye payload SSE simulado
  - `extractHtmlBetweenFences()` — extrae HTML del body para calcular hash
- SessionStore:
  - `registerContextSyncCache(htmlHash, promptHash, response)` — registra respuesta en caché
  - `resolveContextSyncCache(htmlHash, promptHash)` — busca respuesta por hashes
  - Caché in-memory con TTL de 5 minutos (limpieza automática por expiración)
  - Key: `${htmlHash}:${promptHash}`
- Handlers:
  - `AuditInteractionHandler.handleSideRequest()` — branching Context Sync (HIT/MISS)
  - `FilterToolsHandler` — filtra tools del request antes de forward
- HTTP:
  - Respuesta short-circuit en `ProxyController` (vía `contextSyncSseStream`)

## Variables de entorno

- `CONTEXT_SYNC_CACHE_ENABLED` (default `true`): habilita/deshabilita caché. Si está en `0/false`, siempre hace forward+auditoría normal.
- `CONTEXT_SYNC_MAX_WAIT_MS` (default `5000`): timeout de espera del step resuelto (usado en mecanismo de espera cuando el step aún no está registrado).

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
   - Si el step falló o está incompleto, no hay entrada en el caché

### Prevención y mejora continua

Para minimizar Context Sync MISS inesperados:

1. **Aumentar `CONTEXT_SYNC_MAX_WAIT_MS`** si la carga del sistema causa latencias en el registro de steps
2. **Verificar caché**: El caché in-memory debe mantenerse vivo hasta que el Context Sync se resuelva o expire (TTL 5 min)
3. **Monitorear métricas**: Contar ratio HIT vs MISS en side-requests de tipo `context-sync-webfetch`

---

**Relacionado:** Para análisis comparativo de sesiones entre harness nativo y proxy, ver el workflow `/analizar-sesion` y la skill `smart-code-proxy` en Claude Code.
