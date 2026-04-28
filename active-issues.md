# Context Sync Duplication: Procesamiento Redundante de WebFetch

**Fecha de análisis:** 2026-04-28  
**Sesión de referencia:** `d6f082cb-8088-4c13-901d-500ceb651efc`  
**Estado:** Resuelto (implementación completa en código + tests + docs)  
**Prioridad:** Cerrado (mantener monitoreo)

---

## Estado de implementación

La estrategia de mitigación propuesta en este documento ya fue implementada en el proyecto:

- Detección de `context-sync-webfetch` vía `classifySideRequestSubType`.
- Índice/eventos en `SessionStore` para correlación `(sessionId, url) -> stepDir`.
- `ContextSyncHandler` para HIT con SSE simulada local.
- Branching en `AuditInteractionHandler` para HIT/MISS.
- Integración HTTP con short-circuit en `ProxyController` (sin upstream en HIT).
- Feature flags `CONTEXT_SYNC_CACHE_ENABLED` y `CONTEXT_SYNC_MAX_WAIT_MS`.
- Cobertura de tests en dominio, servicios y operaciones.

Para la referencia canónica vigente usar:

- `docs/context-sync-cache.md`
- `README.md` (sección de configuración + comportamiento Context Sync)

---

## Resumen Ejecutivo

Se identificó un **comportamiento no documentado** del harness de Claude Code conocido como "Context Synchronization" (Context Sync). Cuando un subagente utiliza la herramienta `WebFetch` para obtener contenido HTML, el harness **re-inyecta automáticamente** ese mismo contenido HTML al agente principal como una `side-request` adicional, causando que el mismo HTML se procese **dos veces** por modelos distintos (o el mismo modelo en contextos distintos).

Este comportamiento genera:
- **Costo duplicado** por cada WebFetch realizado por subagentes
- **Ruido en la observabilidad** al crear interacciones artificiales que no forman parte del workflow lógico
- **Confusión en debugging** porque el mismo contenido aparece procesado múltiples veces en la sesión

---

## Investigación y Hallazgos

### Comportamiento Observado

#### Secuencia Temporal Exacta

```
01:43:30.664Z  INTERACCIÓN 000003 (Agente Principal) - INICIA
               ├─ Step 1: Lanza 3 subagentes en paralelo
               │
01:43:37.662Z  SUBAGENTE A (000001_9e638...) - INICIA
               ├─ Step 1: WebFetch tool_use → example.com
               │        [Harness server-side obtiene HTML]
               ├─ Step 2: Assistant responde con resumen procesado
               │   Output: "Título: Example Domain..."
               │
01:43:55.249Z  SIDE-REQUEST 000004 - INICIA ←── HTML RE-INYECTADO!
               ├─ Request: 236 tokens (HTML crudo de example.com)
               ├─ System: "You are Claude Code..."
               ├─ Tools: [] (vacío - característica distintiva)
               ├─ Output: 49 tokens (resumen del mismo HTML)
               └─ 01:43:56.259Z - TERMINA (1.01s)
               │
01:43:58.693Z  SUBAGENTE A - TERMINA (21s totales)
               └─ Devuelve resumen vía tool_result al agente principal
               │
01:43:59.247Z  SIDE-REQUEST 000005 - INICIA (segundo WebFetch duplicado)
               └─ 01:44:02.719Z - TERMINA
               │
01:44:10.205Z  SIDE-REQUEST 000006 - INICIA (tercer WebFetch duplicado)
               └─ 01:44:15.609Z - TERMINA
               │
01:44:31.385Z  INTERACCIÓN 000003 (Agente Principal) - TERMINA
```

### Características Distintivas del Context Sync

| Característica | Side-Request de Context Sync | Side-Request Legítimo (ej: count_tokens) |
|----------------|------------------------------|------------------------------------------|
| **`tools`** | `[]` (vacío) | `[]` (vacío) |
| **Contenido** | HTML crudo re-inyectado | Prompts simples del harness |
| **System prompt** | "You are Claude Code..." | "You are Claude Code..." |
| **User message** | "Web page content:\n---\n[HTML]\n---\nExtrae..." | "Count tokens..." o similar |
| **Propósito** | Re-procesar HTML ya procesado por subagente | Operaciones auxiliares del harness |
| **Modelo** | Mismo que el agente principal (Haiku 4.5) | Haiku 4.5 |

### Costo Real Medido

| Interacción | Input Tokens | Output Tokens | Costo Estimado (Haiku 4.5) |
|-------------|--------------|---------------|---------------------------|
| Subagente A (WebFetch + Resumen) | 8 | 241 | ~$0.0012 |
| Side-Request 0004 (mismo HTML) | 236 | 49 | ~$0.0003 |
| Side-Request 0005 | 3,041 | 314 | ~$0.0035 |
| Side-Request 0006 | 24,394 | 318 | ~$0.0259 |
| **Total Side-Requests** | **27,671** | **681** | **~$0.0297** |

**Análisis:** Los side-requests de context sync representaron **el 94% de los tokens de entrada** de la sesión, a pesar de que el contenido HTML ya había sido procesado por los subagentes.

### Por Qué el Harness Hace Esto

**Hipótesis confirmada:** El harness implementa "Context Synchronization" para mitigar el **aislamiento de contexto** entre subagentes y agente principal. Documentación de Anthropic (GitHub issues #5812, #4908) confirma que los usuarios reportan este aislamiento como problema frecuente.

El harness asume que el agente principal necesita "ver" directamente el contenido web para poder referirse a él en su respuesta final. Sin embargo:
- El subagente **ya procesó** el HTML y extrajo lo relevante
- El `tool_result` del subagente **contiene** el resumen procesado
- El side-request es **redundante** en la mayoría de casos

---

## Estrategia de Mitigación: Caché Inteligente

### Objetivos

1. **Eliminar costo duplicado:** Reutilizar el resumen ya generado por el step de WebFetch del subagente en lugar de reprocesar el HTML
2. **Mantener compatibilidad:** Responder correctamente al harness para no romper el flujo
3. **Preservar observabilidad:** NO registrar estas interacciones artificiales en el filesystem
4. **Ser transparente:** El usuario no debe notar diferencia en el comportamiento

### Arquitectura Propuesta

#### Clasificación de Side-Requests

```typescript
// Nuevo tipo de clasificación
type SideRequestSubType = 
  | 'context-sync-webfetch'   // HTML re-inyectado por el harness - cacheable
  | 'harness-auxiliary'        // count_tokens, etc. - forward normal
  | 'user-initiated';         // Side-request legítimo del usuario

// Detección por heurísticas:
// 1. Body contiene "Web page content:" + delimitador ---
// 2. Tools está vacío ("tools": [])
// 3. URL extraíble del contenido
// 4. Mensaje de usuario contiene instrucciones de extracción implícitas
```

#### Workflow de Caché Inteligente

```
┌──────────────────────────────────────────────────────────────────┐
│                     SMART CODE PROXY                             │
│                                                                  │
│  HTTP Request (Side-Request)                                     │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────┐    No                                      │
│  │  ¿Es Context     │──────────► Forward a Anthropic + Auditar  │
│  │     Sync?        │                                            │
│  └──────────────────┘                                            │
│         │ Sí                                                     │
│         ▼                                                        │
│  ┌────────────────────────────────────────┐                      │
│  │  Esperar step de WebFetch (max 5s)     │                      │
│  │  event: subagent:webfetch-step:        │                      │
│  │         completed:{sessionId}:{url}    │                      │
│  └────────────────────────────────────────┘                      │
│         │ Step completó        │ Timeout                         │
│         ▼                      ▼                                 │
│  ┌─────────────────┐   ┌────────────────────────────────┐        │
│  │  Extraer        │   │  Fallback: Forward a Anthropic │        │
│  │  resumen        │   │  (sin auditar)                 │        │
│  │  del step       │   └────────────────────────────────┘        │
│  └─────────────────┘                                             │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────┐                             │
│  │  Construir respuesta SSE        │                             │
│  │  simulada (sin llamar a         │                             │
│  │  Anthropic)                     │                             │
│  └─────────────────────────────────┘                             │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────┐                                    │
│  │  NO AUDITAR              │                                    │
│  │  (no crear directorio)   │                                    │
│  └──────────────────────────┘                                    │
│         │                                                        │
│         ▼                                                        │
│  Responder al harness con resumen del step                       │
└──────────────────────────────────────────────────────────────────┘
```

#### Implementación Técnica

**1. Extensión del TurnClassifier:**

```typescript
// src/1-domain/services/turn-classifier.service.ts
function classifySideRequestSubType(body: unknown): SideRequestSubType {
  const text = extractUserMessageText(body);
  const tools = extractTools(body);
  
  // Heurística Context Sync WebFetch
  if (tools.length === 0 && 
      text.includes('Web page content:') && 
      text.includes('---')) {
    const url = extractUrlFromWebContent(text);
    if (url) return 'context-sync-webfetch';
  }
  
  return 'harness-auxiliary';
}
```

**2. Manejador de Context Sync (nuevo):**

```typescript
// src/3-operations/handlers/context-sync.handler.ts
async function handleContextSync(params: {
  body: Buffer;
  sessionId: string;
  headers: Record<string, unknown>;
}): Promise<Response> {
  const url = extractUrlFromBody(params.body);
  
  // Buscar el step específico del subagente que procesó este URL.
  // No se espera que el subagente complete; solo el step que recibió
  // el tool_result del WebFetch y generó el resumen del HTML.
  const step = await waitForWebFetchStepOrFallback(params.sessionId, url);
  
  if (step) {
    // Extraer resumen del response de ese step concreto
    const summary = await extractSummaryFromStep(step.stepDir);
    
    // Construir respuesta SSE válida SIN llamar a Anthropic
    const sseResponse = buildSimulatedSseResponse({
      messageId: generateMessageId(),
      content: summary,
      model: extractModelFromBody(params.body)
    });
    
    // NO escribir en filesystem - solo responder
    return new Response(sseResponse, {
      headers: { 'Content-Type': 'text/event-stream' }
    });
  }
  
  // Fallback: timeout expirado. Reenviar a Anthropic SIN auditar:
  // el request sigue siendo una operación interna del harness.
  return forwardToAnthropicWithoutAudit(params);
}
```

**3. Modificación de AuditInteractionHandler:**

```typescript
// En handleSideRequest()
if (classification.type === 'side-request') {
  const subType = classifySideRequestSubType(params.rawBody);
  
  // Context Sync: nunca auditar (es operación interna del harness)
  if (subType === 'context-sync-webfetch') {
    return handleContextSync(params, headers, auditSessionId);
  }
  
  // Side-request normal: auditar y forward
  return handleSideRequestNormal(params, headers, auditSessionId, classification);
}
```

#### Race Condition: Step del subagente vs Side-Request

**Problema:** El side-request puede llegar ANTES de que el step que procesó el HTML termine.

**Aclaración de granularidad:** No se debe esperar a que el **subagente completo** finalice. Los subagentes típicamente ejecutan múltiples pasos (buscar, analizar, decidir, generar output), y su duración total puede ser muy superior a los 5 segundos. Lo que interesa es el **step específico** en el que el subagente recibió el `tool_result` del `WebFetch` y produjo su resumen del HTML — ese step puede completar en segundos aunque el subagente siga ejecutándose.

El evento relevante es `subagent:webfetch-step:completed`, emitido tan pronto como ese step concreto escribe su `response/` en disco.

**Solución:** Suspensión con timeout esperando el step (event-driven interno)

```typescript
async function waitForWebFetchStepOrFallback(
  sessionId: string,
  url: string,
  maxWaitMs: number = 5000
): Promise<WebFetchStepResult | null> {
  // Verificar inmediatamente si el step ya completó
  const existing = findCompletedWebFetchStep(sessionId, url);
  if (existing) return existing;
  
  // Esperar evento de completación del step específico (no del subagente completo)
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), maxWaitMs);
    
    eventBus.once(`subagent:webfetch-step:completed:${sessionId}:${url}`, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}
```

El evento `subagent:webfetch-step:completed` debe emitirse en el punto donde el proxy registra el cierre del streaming de un step de subagente cuyo `request/` contiene un `tool_result` de tipo `web_search`/`web_fetch` para la URL en cuestión.

### Reglas de Audición

| Tipo de Interacción | ¿Auditar en filesystem? | Razón |
|---------------------|------------------------|-------|
| **Context Sync (WebFetch)** | ❌ NO | Operación interna del harness. No aporta valor de observabilidad, incluso en caso de fallback a Anthropic. El resumen ya está en el step del subagente. |
| **Side-request normal** | ✅ SÍ | count_tokens, etc. Son parte del flujo real. |
| **Agentic turn** | ✅ SÍ | Interacción principal del usuario. |
| **Subagente** | ✅ SÍ | Ejecuta el trabajo real incluyendo WebFetch. |

### Estructura de Directorios Esperada (con Caché Inteligente)

```
sessions/d6f082cb-8088-4c13-901d-500ceb651efc/
├── interaction-sequence.json          # {"last": 3}
└── interactions/
    ├── 000001_6ec7b12e-.../          # client-preflight
    ├── 000002_3f1ad842-.../          # side-request (count_tokens)
    └── 000003_4209d576-.../          # agentic-turn principal
        ├── meta.json                  # 2 steps, 3 subagentes lanzados
        ├── request/
        ├── response/
        └── steps/
            └── 001/
                ├── request/
                ├── response/
                └── sub-interactions/
                    ├── 000001_9e638.../   # ✅ Subagente A (WebFetch example.com)
                    │   ├── meta.json      # WebFetch procesado aquí
                    │   └── steps/
                    │       ├── 001/       # WebFetch tool_use
                    │       └── 002/       # Resumen del contenido
                    ├── 000002_0f0f.../   # ✅ Subagente B
                    └── 000003_beb0.../   # ✅ Subagente C
                    
# NOTA: Side-requests 000004, 000005, 000006 NO aparecen en el filesystem
# porque son Context Sync y fueron respondidos desde caché sin audición.
```

---

## Consideraciones de Implementación

### Feature Flags Recomendados

```json
{
  "CONTEXT_SYNC_CACHE_ENABLED": true,
  "CONTEXT_SYNC_MAX_WAIT_MS": 5000
}
```

### Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Falso positivo (cachear request legítima) | Baja | Heurísticas estrictas + validación de URL |
| Timeout en espera del step de WebFetch | Media | Fallback inmediato a Anthropic, no penalizar usuario |
| Respuesta cacheada incompatible con harness | Baja | Testing exhaustivo con sesiones reales |
| Pérdida de información al no auditar | Controlada | Logs estructurados en metadata del subagente |

---

## Conclusión

El comportamiento de "Context Synchronization" del harness de Claude Code genera un **costo acumulado significativo** al reprocesar contenido HTML que ya fue analizado por subagentes. Este comportamiento no está documentado oficialmente y no aporta valor a la observabilidad del sistema.

La estrategia de **Caché Inteligente** propuesta:
1. Detecta side-requests de Context Sync por heurísticas
2. Reutiliza el resumen ya generado por el step de WebFetch del subagente
3. Responde al harness sin llamar a Anthropic (ahorro real)
4. **No registra estas interacciones artificiales** en el filesystem
5. Preserva la jerarquía limpia: `interactions → steps → sub-interactions`

### Próximos Pasos

1. Monitorear en sesiones reales la tasa HIT/MISS y el ahorro de tokens.
2. Ajustar `CONTEXT_SYNC_MAX_WAIT_MS` según latencia observada de subagentes.
3. Revisar periódicamente cambios del harness de Claude Code que alteren el patrón de Context Sync.

---

## Archivos Relevantes para Implementación

- `src/1-domain/services/turn-classifier.service.ts` - Extender con detección de Context Sync
- `src/3-operations/audit-interaction.handler.ts` - Modificar `handleSideRequest` para no auditar Context Sync
- `src/3-operations/context-sync.handler.ts` - Handler de respuestas cacheadas
- `src/2-services/session-store.service.ts` - Agregar tracking de steps de subagente que procesaron WebFetch (por URL), con emisión del evento `subagent:webfetch-step:completed` al cerrar el streaming de ese step
- `src/4-api/config/env.config.ts` - Feature flags de configuración

---

## Referencias

- Sesión de análisis: `d6f082cb-8088-4c13-901d-500ceb651efc`
- Documentación Anthropic (GitHub issues #5812, #4908) - Context isolation problems
- Documentación WebFetch: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- Issue relacionado: https://github.com/anthropics/claude-code/issues/45070
