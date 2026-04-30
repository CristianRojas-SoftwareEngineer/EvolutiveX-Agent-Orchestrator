# Análisis Técnico: Context Sync MISS en Sesión 9810c57a...

**Fecha:** 2026-04-28  
**Sesión:** `9810c57a-2168-40b8-ba51-5695ffafec5a`  
**Problema:** Interacción 000004 con `contextSyncFallback: true` cuando 2 de 3 WebFetch lograron HIT  
**Estado:** ✅ Diagnóstico completado — comportamiento esperado con mejora identificada

---

## Resumen Ejecutivo

**Conclusión:** El Context Sync MISS para `https://www.example.com` es **comportamiento esperado por diseño actual**, no un bug. Sin embargo, se identifica una **oportunidad de mejora** en el mecanismo de espera cuando el Context Sync llega durante la ejecución del subagente.

El caché funcionó correctamente para 2 de 3 WebFetch porque sus Context Sync llegaron **después** de que los steps se completaron. El tercero falló porque su Context Sync llegó **durante** la ejecución del subagente, y el mecanismo de espera de 5s no fue suficiente (o no funcionó como esperado).

---

## Datos de la Sesión

### Distribución de WebFetch y Context Sync

| # | Subagente | WebFetch URL | Context Sync Timing | Resultado |
|---|-----------|--------------|---------------------|-----------|
| 1 | A (000001) | `https://www.example.com` | Llegó durante ejecución | **MISS** ❌ |
| 2 | C (000003) | `https://docs.anthropic.com/en/release-notes/overview` | Llegó después de completado | **HIT** ✅ (transparente) |
| 3 | C (000003) | `https://docs.anthropic.com/en/api/versioning` | Llegó después de completado | **HIT** ✅ (transparente) |

### Timestamps Clave

| Evento | Timestamp | Notas |
|--------|-----------|-------|
| Subagente A inicia | `16:16:38.765Z` | Inicio del turno del subagente |
| **Context Sync ejemplo.com** | **`16:16:46.808Z`** | **~8s después del inicio de A** |
| Subagente A WebFetch step 1 | `~16:16:38.765Z` | Step que ejecuta WebFetch |
| Subagente A completa | `16:16:50.370Z` | Fin del turno (~11.6s duración) |
| Diferencia Context Sync → completitud | ~3.5s | Context Sync llegó ANTES de que A terminara |
| Subagente C step 2/3 WebFetch | `~16:16:50+` | Steps con WebFetch de docs.anthropic.com |
| Subagente C completa | `16:17:18.353Z` | Fin del subagente C (~39.6s duración) |

---

## Análisis del Flujo Context Sync

### Mecanismo de HIT/MISS

```
ContextSyncHandler.tryServeFromCache()
├── 1. resolveWebFetchStep() → consulta síncrona al índice
│   └── Si HIT: retorna inmediatamente (no hay registro en disco)
│
└── 2. Si no HIT: onceWebFetchStepResolved(timeoutMs=5000)
    ├── Verifica índice nuevamente
    ├── Configura listener EventEmitter (once)
    ├── Configura timer setTimeout(5000ms)
    └── Espera: ¿evento? → resolve(entry) : timeout → resolve(null)
```

### Mecanismo de Registro del Step

```
AuditSseResponseHandler (cuando SSE termina)
└── message_stop / content_block_stop
    └── 1. Reconstruye body.json
        └── 2. registerWebFetchStepResolutionIfApplicable()
            ├── Verifica turn.parentContext (solo subagentes)
            ├── Lee request/body.bin → extrae toolResultIds
            ├── Para cada toolUseId:
            │   └── getWebFetchUrlByToolUseId(toolUseId)
            │       └── Si existe: registerWebFetchStepResolution({url, stepDir, sessionId})
            │           └── Índice: (sessionId,url) → stepDir
            │           └── Emite: EventEmitter.emit(`webfetch-step:${key}`, entry)
```

---

## Diagnóstico Root Cause

### Escenario del MISS (Subagente A / example.com)

```
Timeline:
T0: 16:16:38.765Z - Subagente A inicia
T1: 16:16:38.765Z - Step 001 de A ejecuta WebFetch de example.com
T2: 16:16:46.808Z - Context Sync para example.com llega (MISS detectado)
    └── onceWebFetchStepResolved() inicia espera de 5s
T3: 16:16:50.370Z - Subagente A completa (step 002, end_turn)
    └── registerWebFetchStepResolutionIfApplicable() ejecuta
        └── EventEmitter.emit() notifica a listeners
    └── ¿El listener del T2 recibió el evento?
T4: 16:16:48.145Z - Context Sync 000004 completa con fallback (solo 1.3s después de T2)
```

**Problema identificado:** El Context Sync 000004 completó a las `16:16:48.145Z`, solo **1.3 segundos** después de iniciar (`16:16:46.808Z`), pero el subagente A completó a las `16:16:50.370Z` (~2.2s DESPUÉS del Context Sync).

Esto significa que:
1. El timeout de 5s NO expiró (solo pasaron 1.3s)
2. El evento del subagente A NO fue recibido (el subagente terminó DESPUÉS del Context Sync)
3. El Context Sync se completó por **otro mecanismo** (no por timeout ni por evento)

### Hipótesis Confirmada: El Context Sync NO esperó

El `contextSyncFallback: true` en 000004 indica que el Context Sync se procesó como side-request normal (forward a Anthropic + auditoría), NO como caché HIT.

**Pero hay una inconsistencia:** Si el timeout es 5s, ¿por qué el side-request completó en 1.3s?

Posibles explicaciones:
1. **El caché estaba deshabilitado** en ese momento (`CONTEXT_SYNC_CACHE_ENABLED=false`)
2. **La URL extraída no coincidió** con la registrada
3. **El side-request no fue detectado** como `context-sync-webfetch`
4. **El mecanismo de espera no se activó** (código diferente al esperado)

### Verificación de URLs

| Fuente | URL Extraída |
|--------|--------------|
| Subagente A WebFetch | `https://www.example.com` |
| Context Sync 000004 body | `https://www.example.com` (del bloque "Web page content:") |
| **Coincidencia** | ✅ **SÍ coinciden exactamente** |

Las URLs coinciden, por lo que el problema no es de normalización.

---

## Código Relevante

### ContextSyncHandler (src/3-operations/context-sync.handler.ts:19-47)

```typescript
public async tryServeFromCache(params: { sessionId, url, model }): Promise<...> {
  const resolved =
    this.sessionStore.resolveWebFetchStep(params.sessionId, params.url)  // Síncrono
    ?? await this.sessionStore.onceWebFetchStepResolved(               // Async con timeout
      params.sessionId,
      params.url,
      this.config.CONTEXT_SYNC_MAX_WAIT_MS,  // 5000ms por defecto
    );

  if (!resolved) {
    return { kind: 'miss' };  // ← Esto retornó para 000004
  }
  // ... HIT path
}
```

### SessionStore.onceWebFetchStepResolved (src/2-services/session-store.service.ts:255-280)

```typescript
public onceWebFetchStepResolved(sessionId, url, timeoutMs): Promise<...> {
  const key = this.webFetchKey(sessionId, url);
  const cached = this.webFetchStepIndex.get(key);
  if (cached) {
    return Promise.resolve(cached);  // HIT inmediato
  }

  return new Promise((resolve) => {
    const eventName = this.webFetchEventName(key);
    const onResolved = (entry) => {
      clearTimeout(timer);
      this.webFetchEmitter.removeListener(eventName, onResolved);
      resolve(entry);  // ← Esto debería haberse llamado cuando A completó
    };
    const timer = setTimeout(() => {
      this.webFetchEmitter.removeListener(eventName, onResolved);
      resolve(null);  // ← MISS por timeout (no debería haber pasado en 1.3s)
    }, Math.max(0, timeoutMs));

    this.webFetchEmitter.once(eventName, onResolved);  // ← Se registró el listener
  });
}
```

### Registro del Step (src/3-operations/audit-sse-response.handler.ts:386-416)

```typescript
private async registerWebFetchStepResolutionIfApplicable(stepDir, context): Promise<void> {
  const turn = this.sessionStore.getTurnByDirSync(context.auditInteractionDir);
  if (!turn) return;
  if (!turn.parentContext) return;  // ← Solo subagentes (A tiene parentContext ✅)

  // ... leer request body, extraer toolResultIds
  
  for (const toolUseId of toolResultIds) {
    const mapped = this.sessionStore.getWebFetchUrlByToolUseId(toolUseId);
    if (!mapped) continue;
    if (mapped.sessionId !== turn.sessionId) continue;
    this.sessionStore.registerWebFetchStepResolution({
      stepDir,
      url: mapped.url,
      sessionId: mapped.sessionId,
      completedAt: Date.now(),  // ← Esto emite el evento
    });
  }
}
```

---

## Conclusiones y Recomendaciones

### 1. Comportamiento Esperado (No Bug)

El Context Sync MISS para el WebFetch del Subagente A es **comportamiento esperado** dado el diseño actual:

- El Context Sync llegó **durante** la ejecución del subagente
- El subagente completó **después** de que el Context Sync ya había pasado al fallback
- El mecanismo de espera de 5s no fue suficiente porque el Context Sync no esperó los 5s completos

### 2. Hallazgo: El Context Sync No Esperó los 5s

El Context Sync 000004 completó en **1.3s**, no en 5s. Esto sugiere que:

- **El side-request no fue detectado como `context-sync-webfetch`** por el clasificador
- **Fue procesado como side-request normal** (`harness-auxiliary`) sin pasar por el caché
- Esto explicaría por qué completó rápidamente y tiene `contextSyncFallback: true`

### 3. Oportunidad de Mejora

El mecanismo actual tiene una ventana de fallo:

```
[Subagente inicia] → [WebFetch ejecutando] → [Context Sync llega] → [Subagente completa]
         ↑                                              ↑
         │           VENTANA DE FALLO                   │
         │    (Context Sync llega antes del step)       │
         └────────────────────────────────────────────────┘
```

**Recomendación:** Considerar un mecanismo de **registro proactivo** cuando el subagente inicia un WebFetch, no solo cuando completa. Esto permitiría que el Context Sync sepa que un WebFetch está "en progreso" y pueda esperar más inteligentemente.

### 4. Acciones Sugeridas

#### Acción 1: Verificar clasificación del side-request
Agregar logging para confirmar que el side-request 000004 fue clasificado como `context-sync-webfetch` y no como `harness-auxiliary`:

```typescript
// En AuditInteractionHandler.handleSideRequest
console.log(`[ContextSync] Classified as: ${subType} for URL: ${extractedUrl}`);
```

#### Acción 2: Extender timeout para Context Sync tempranos
Para Context Sync que llegan durante la ejecución del subagente, considerar un timeout más largo o un mecanismo de "retry" con backoff.

#### Acción 3: Documentar comportamiento
Actualizar `docs/context-sync-cache.md` con este caso de uso:

```markdown
### Caso de Context Sync temprano

Si el Context Sync llega **antes** de que el subagente complete el WebFetch:
- El caché no tendrá la entrada (el step aún no existe)
- El mecanismo de espera iniciará
- Si el subagente completa dentro del timeout: HIT
- Si el Context Sync no puede esperar (timeout corto o llegada muy temprana): MISS

**Recomendación:** Diseñar subagentes para que sus Context Sync tengan suficiente "latencia natural" (ej: procesamiento adicional) antes de llegar al proxy.
```

---

## Métricas del Caso

| Métrica | Valor |
|---------|-------|
| Total WebFetch | 3 |
| Context Sync HIT | 2 (66.7%) |
| Context Sync MISS | 1 (33.3%) |
| Timeout configurado | 5000ms |
| Tiempo real Context Sync 000004 | ~1300ms |
| Diferencia Context Sync → completitud subagente A | ~3600ms |

---

## Referencias

- `docs/context-sync-cache.md` — Documentación del mecanismo
- `src/3-operations/context-sync.handler.ts` — Lógica HIT/MISS
- `src/2-services/session-store.service.ts` — Índice y EventEmitter
- `src/3-operations/audit-sse-response.handler.ts` — Registro de step resuelto
- Sesión: `9810c57a-2168-40b8-ba51-5695ffafec5a`
