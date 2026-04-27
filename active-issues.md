# Análisis de Sesión: Subagentes y Jerarquía de Interacciones

**Fecha de análisis:** 2026-04-27  
**Sesión auditada:** `45ffb4d1-4e41-45f7-be12-1cbf1f1c1d85`  
**Log Claude Code:** `C:\Users\Cristian\.claude\projects\C--Users-Cristian-Desktop-Proyectos-Smart-Code-Proxy\45ffb4d1-4e41-45f7-be12-1cbf1f1c1d85.jsonl`

---

## Resumen Ejecutivo

Se identificó un **bug crítico de jerarquización** en la estructura de auditoría cuando hay subagentes paralelos que utilizan herramientas server-side (`web_search`, `web_fetch`). Las ejecuciones de herramientas server-side iniciadas por los subagentes se están clasificando incorrectamente como subinteracciones hermanas del subagente (hijas del turno padre), cuando deberían estar anidadas dentro de cada subagente o tratadas de forma diferente.

---

## Estructura de Directorios Actual (Incorrecta)

```
sessions/45ffb4d1-4e41-45f7-be12-1cbf1f1c1d85/
├── interaction-sequence.json          # {"last": 3}
└── interactions/
    ├── 000001_1af26ec6-.../          # client-preflight (quota-check)
    ├── 000002_bf592134-.../          # side-request (count_tokens)
    └── 000003_eaa5d43a-.../          # agentic-turn principal (2 subagentes)
        ├── meta.json                  # step 1: 2 tool_calls Agent
        ├── request/
        ├── response/
        └── steps/
            └── 001/                   # step con tool_use de tipo Agent
                ├── request/
                ├── response/
                └── sub-interactions/     # ⚠️ PROBLEMA: 5 items, deberían ser 2
                    ├── 000001_c1a90ac3-.../   # ✅ Subagente 1 (Kimi 2.5)
                    │   ├── meta.json        # step 1: WebSearch tool_use
                    │   └── steps/
                    │       ├── 001/       # (0 items - sub-sub-interacciones no creadas)
                    │       └── 002/
                    ├── 000002_ca0516bb-.../   # ✅ Subagente 2 (Kimi 2.6)
                    │   ├── meta.json        # step 1: 2 WebSearch tool_uses
                    │   └── steps/
                    │       ├── 001/       # (0 items - sub-sub-interacciones no creadas)
                    │       └── 002/
                    ├── 000003_9f5ac9dd-.../   # ❌ WebSearch de Subagente 1 (hermana!)
                    ├── 000004_4f7e9c31-.../   # ❌ WebSearch de Subagente 2 (hermana!)
                    └── 000005_a12f2768-.../   # ❌ WebSearch de Subagente 2 (hermana!)
```

---

## Evidencia del Problema

### Todos los parentContext apuntan al turno padre

**Subagente 000001 (correcto):**
```json
"parentContext": {
  "parentInteractionDir": "...\interactions\000003_eaa5d43a-...",
  "parentStepIndex": 1,
  "triggeringToolUseId": null
}
```

**Subagente 000002 (correcto):**
```json
"parentContext": {
  "parentInteractionDir": "...\interactions\000003_eaa5d43a-...",
  "parentStepIndex": 1,
  "triggeringToolUseId": null
}
```

**WebSearch 000003 (incorrecto - debería estar en subagente 1):**
```json
"parentContext": {
  "parentInteractionDir": "...\interactions\000003_eaa5d43a-...",  // ❌ Apunta al padre, no al subagente 1
  "parentStepIndex": 1,
  "triggeringToolUseId": null
}
```

**WebSearch 000004 y 000005 (incorrectos - deberían estar en subagente 2):**
```json
"parentContext": {
  "parentInteractionDir": "...\interactions\000003_eaa5d43a-...",  // ❌ Apuntan al padre, no al subagente 2
  "parentStepIndex": 1,
  "triggeringToolUseId": null
}
```

---

## Causa Raíz del Problema

### 1. No se distinguen orígenes de requests `fresh`

El proxy actualmente no distingue entre:

| Tipo de Request | Origen | Comportamiento Esperado | Comportamiento Actual |
|-----------------|--------|------------------------|----------------------|
| Subagente `Agent` | Cliente (Claude Code CLI) | Anidar como sub-interacción del step padre | ✅ Correcto |
| Server-side tool (`web_search`, `web_fetch`) | Servidor (Anthropic API) | Anidar dentro del subagente que la solicitó | ❌ Se anida en el turno padre |

### 2. Restricción de profundidad limita a 2 niveles

Según `ISessionStore.findTurnWithPendingAgents` (`src/2-services/ports/session-store.port.ts`):

```typescript
// - parentContext definido excluye subagentes (refuerza profundidad ≤ 2).
if (turn.parentContext) continue;
```

Esta lógica impide que los subagentes (que tienen `parentContext` definido) sean considerados como padres de otras interacciones. Esto es correcto para subagentes de tipo `Agent`, pero **incorrecto para server-side tools** que deben ejecutarse dentro del contexto del subagente que las solicitó.

### 3. Las requests de server-side tools llegan como `fresh`

Body de las web searches (ej: 000004):
```json
{
  "model": "claude-haiku-4-5",
  "messages": [{
    "role": "user",
    "content": [{
      "type": "text",
      "text": "Perform a web search for the query: Kimi 2.6 Moonshot AI strengths..."
    }]
  }],
  "system": [
    {"text": "You are an assistant for performing a web search tool use"}
  ],
  "tools": [{"type": "web_search_20250305", "name": "web_search", ...}]
}
```

Estas requests:
- Son iniciadas por el servidor de Anthropic (no por Claude Code CLI)
- Llegan con `tools` no vacío → clasificadas como `fresh`
- El proxy busca `findTurnWithPendingAgents` y encuentra el turno PADRE (000003)
- Se anidan incorrectamente como hermanas de los subagentes

---

## Secuencia Temporal del Problema

| Timestamp | Evento | Directorio Resultante |
|-----------|--------|----------------------|
| 17:57:53 | Preflight (quota-check) | `interactions/000001_...` |
| 17:58:17 | Side-request (count_tokens) | `interactions/000002_...` |
| 17:58:17 | **Agentic Turn Principal** - prompt usuario | `interactions/000003_...` |
| 17:58:21 | Step 1 emite 2 tool_use `Agent` → registran pending | - |
| 17:58:23 | **Subagente 1** (Kimi 2.5) inicia | `.../000003/.../sub-interactions/000001_...` |
| 17:58:23 | **Subagente 2** (Kimi 2.6) inicia | `.../000003/.../sub-interactions/000002_...` |
| 17:58:25 | **Subagente 1** emite tool_use `WebSearch` | - |
| 17:58:25 | **Subagente 2** emite 2 tool_use `WebSearch` | - |
| 17:58:25 | Servidor Anthropic inicia web search #1 | `.../000003/.../sub-interactions/000003_...` ❌ |
| 17:58:25 | Servidor Anthropic inicia web search #2 | `.../000003/.../sub-interactions/000004_...` ❌ |
| 17:58:25 | Servidor Anthropic inicia web search #3 | `.../000003/.../sub-interactions/000005_...` ❌ |
| 17:58:35-44 | Tool results llegan, continuación | Step 2 del turno principal |

---

## Impacto del Bug

1. **Visualización incorrecta:** En el árbol de directorios no se distingue visualmente qué web search pertenece a qué subagente.

2. **Dificultad de debugging:** Sin conocimiento previo, es imposible determinar cuántos subagentes se ejecutaron y cuál fue el flujo real.

3. **Pérdida de contexto jerárquico:** Las web searches deberían estar vinculadas a su subagente padre, no al turno principal.

4. **Inconsistencia en parentContext:** Todos los elementos apuntan al mismo `parentInteractionDir`, haciendo imposible reconstruir el árbol real de ejecución.

---

## Opciones de Solución

### Opción A: Distinguir requests cliente vs servidor

Agregar heurística para detectar requests iniciadas por el servidor:
- System prompt contiene "assistant for performing a web search tool use"
- Modelo específico (`claude-haiku-4-5` para tools vs modelo principal)
- Metadata específica en el body

**Pros:** Preciso, mantiene jerarquía correcta  
**Contras:** Requiere mantener heurísticas actualizadas

### Opción B: Permitir profundidad > 2 para server-side tools

Modificar `findTurnWithPendingAgents` para buscar también en subagentes cuando la request parece ser un server-side tool.

**Pros:** Mantiene toda la información en el árbol  
**Contras:** Rompe la garantía de profundidad ≤ 2, aumenta complejidad

### Opción C: Clasificar server-side tools como `side-request`

Las requests de server-side tools no son realmente "turnos agénticos" - son ejecuciones automatizadas. Podrían clasificarse como `side-request` y vincularse mediante metadata en lugar de jerarquía de directorios.

**Pros:** Simple, no rompe límites de profundidad  
**Contras:** Cambia semántica de `side-request`, requiere nuevo mecanismo de vinculación

### Opción D: Marcar server-side tools con tipo específico

Crear nuevo tipo de interacción `server-tool-execution` con estructura plana y vinculación mediante `toolUseId`.

**Pros:** Modelo semántico correcto  
**Contras:** Mayor cambio en modelo de datos

---

## Conclusión

El problema es un **bug de diseño** en la clasificación de requests `fresh`. El proxy asume que toda request `fresh` que llega mientras hay `pendingAgentToolUses` es un subagente, cuando en realidad las server-side tools también llegan como requests `fresh` pero deben tratarse diferente.

La solución recomendada es la **Opción A** (heurística de detección) combinada con mejoras en el trackeo de pendings para incluir también `WebSearch`/`WebFetch` pendientes, permitiendo vincular correctamente las ejecuciones server-side con su contexto.

---

## Archivos Relevantes para Fix

- `src/3-operations/audit-interaction.handler.ts` - Lógica de clasificación y routing
- `src/2-services/ports/session-store.port.ts` - Interfaz `findTurnWithPendingAgents`
- `src/2-services/session-store.service.ts` - Implementación del store
- `src/1-domain/services/turn-classifier.service.ts` - Posible extensión para detectar server-side tools

---

## Notas Adicionales

- Las web searches 000004 y 000005 pertenecen al Subagente 2 (Kimi 2.6) que emitió 2 tool_use `WebSearch` según su meta.json
- La web search 000003 (0 items en directorio) parece corresponder al Subagente 1 pero está vacía/incompleta
- La correlación `triggeringToolUseId: null` en todos los casos indica que hubo múltiples pendings simultáneos (caso ambiguo paralelo)
