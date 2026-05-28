## Context

El proxy correlaciona subagentes hoy en `src/3-operations/audit-interaction.handler.ts` mediante
`resolvePendingByPrompt` y `unique-pending` (ambos heurísticos). Los tipos relevantes están en
`src/1-domain/types/audit.types.ts`: `CorrelationMethod` (:260), `ParentContext` (:219),
`PendingAgentToolUse` (:268). El correlador en memoria es `ISessionStore` /
`src/2-services/session-store.service.ts`. No existe lectura de cabeceras de agente ni
`IWorkflowRepository`.

Esta fase introduce el plano A de señal (cabeceras) con impacto mínimo: no migra los handlers
existentes al nuevo repo (eso es G2), no añade rutas HTTP nuevas y no cambia el layout `sessions/`.

Ver: [§22 Plano A](../../../docs/proposals/gateway-design.md#22-plano-a--cabeceras-claude-code--21139) ·
[§39–§41 capas objetivo](../../../docs/proposals/gateway-design.md#39-capa-1-objetivo) ·
[§21 autoridad por concern](../../../docs/proposals/gateway-design.md#21-reglas-de-autoridad-por-concern).

## Goals / Non-Goals

**Goals:**

- Servicio puro `resolveAgentContext(headers)` en capa 1, testeable sin dependencias.
- `IWorkflowRepository` mínima (capa 1) + adapter en memoria (capa 2), acotado a `openSubagentFromWire` y `getWorkflowByAgentId`.
- Extensión de `CorrelationMethod` con `'agent-headers'`.
- Precedencia de cabeceras sobre heurística en `AuditInteractionHandler`.
- Heurística degradada a fallback legacy documentado (comentario de deprecación, no eliminada).
- Cableado en `composition-root.ts`.

**Non-Goals:**

- Join SSE `tool_use_id` ↔ subagente (C2).
- Endpoint `POST /hooks` (C3).
- Cierre E2E (C4).
- Migración completa de handlers al nuevo repo (G2).
- Cambios en layout `sessions/` (P1).
- Eliminar la ruta heurística.

## Ubicación PKA

Todos los archivos nuevos y modificados siguen la dependencia unidireccional: externas dependen de
internas.

### Archivos nuevos

| Archivo | Capa | Rol |
|---------|------|-----|
| `src/1-domain/services/resolve-agent-context.service.ts` | 1 | Función pura `resolveAgentContext(headers)` → `AgentContext`. Sin I/O. |
| `src/1-domain/repositories/IWorkflowRepository.ts` | 1 | Interface mínima: `openSubagentFromWire`, `getWorkflowByAgentId`. |
| `src/2-services/workflow-repository.service.ts` | 2 | Adapter en memoria que implementa `IWorkflowRepository`. Mantiene `Map<agentId, ...>`. |
| `tests/1-domain/resolve-agent-context.test.ts` | — | Tests puros de `resolveAgentContext` (patrón `session-resolver.test.ts`). |
| `tests/2-services/workflow-repository.test.ts` | — | Tests del adapter en memoria. |

### Archivos modificados

| Archivo | Capa | Cambio |
|---------|------|--------|
| `src/1-domain/types/audit.types.ts` | 1 | Añadir `'agent-headers'` a `CorrelationMethod` (:260). |
| `src/3-operations/audit-interaction.handler.ts` | 3 | Integrar `resolveAgentContext` + rama `isSubagentRequest` con precedencia; degradar heurística a fallback con comentario de deprecación. |
| `src/4-api/composition-root.ts` | 4 | Instanciar `WorkflowRepositoryService` y pasarlo al handler. |
| `tests/3-operations/audit-interaction.handler.test.ts` | — | Ampliar tests de correlación con rama de cabeceras y verificar que fallback sigue funcionando. |
| `tests/5-user-interfaces/agent-headers-correlation.test.ts` | — | Test E2E ligero: levanta proxy + upstream falso, inyecta request con cabeceras de agente y verifica que el flujo no se rompe y la sesión se crea en disco. La verificación determinista de `correlationMethod: 'agent-headers'` y la ausencia de invocación de `resolvePendingByPrompt` se cubren en `tests/3-operations/audit-interaction.handler.test.ts` con helper `makeWorkflowRepo` (decisión #2). |

## Orden de decisión del handler (objetivo C1)

Basado en [§22](../../../docs/proposals/gateway-design.md#22-plano-a--cabeceras-claude-code--21139):

```
1. Clasificar request (fresh / continuation / preflight / side)
2. Si side / preflight → rutas existentes (sin cambio)
3. agentCtx ← resolveAgentContext(headers)
4. Si agentCtx.isSubagentRequest === true
     → workflowRepo.openSubagentFromWire(sessionId, agentCtx)
     → correlationMethod = 'agent-headers'
5. Si fresh && !isSubagentRequest && pendingAgents existen
     → fallback heurístico actual (resolvePendingByPrompt / unique-pending)
     [DEPRECATED: fallback legacy — retirar en G2 cuando IWorkflowRepository sea el correlador primario]
6. continuation → ruta existente (sin cambio en C1)
```

## Coexistencia repo mínimo ↔ ISessionStore

En C1 ambos coexisten:

- **`IWorkflowRepository`** (nuevo): solo usado para la rama `isSubagentRequest`. Indexa `agentId` → contexto de subagente. No conoce `ActiveInteraction`.
- **`ISessionStore`** (existente): sigue siendo el correlador primario para toda la lógica restante (aperturas `fresh`, continuaciones, fallback heurístico, pending tools, orphans). No se modifica en C1.
- Los handlers abren el subagente en el `ISessionStore` como hasta ahora, pero con `correlationMethod: 'agent-headers'` y `parentAgentId` ya resueltos.

Esta coexistencia se elimina en G2, cuando los handlers migren al `IWorkflowRepository` completo.

## Decisions

### 1. Servicio puro en capa 1 (no en capa 3)

**Decisión:** `resolveAgentContext` vive en `src/1-domain/services/`, no inline en el handler.

**Rationale:** Es lógica pura sin I/O, testeable de forma aislada y reutilizable por futuros handlers
(C3, G2). Colocarla en capa 3 violaría el principio de no mezclar parsing de input con lógica de
dominio.

**Alternativa rechazada:** función utilitaria inline en el handler — dificulta testeo unitario y
duplicaría lógica cuando C3 necesite también las cabeceras.

### 2. IWorkflowRepository mínimo, no el modelo completo

**Decisión:** Solo `openSubagentFromWire` y `getWorkflowByAgentId`; sin `Workflow`, `Step` ni
`ToolUse` de dominio.

**Rationale:** G1 define los tipos de dominio gateway (`Workflow`, `Step`, etc.). Crearlos en C1
introduce dependencia de implementación en el orden equivocado y solapa con G2. El repo mínimo es
suficiente para la feature de C1 y queda refactorizado en G2.

**Alternativa rechazada:** introducir `Workflow` completo en C1 — anticipa diseño de G1 y aumenta el
riesgo de reescritura.

### 3. Heurística degradada con comentario de deprecación

**Decisión:** La ruta `resolvePendingByPrompt` / `unique-pending` permanece operativa pero se
decora con un comentario:

```ts
// @deprecated-fallback: correlación heurística legacy para clientes sin cabeceras de agente.
// Retirar en fase G2 cuando IWorkflowRepository sea el correlador primario.
// Fecha de retirada planificada: fase G2.
```

**Rationale:** Cumple el requisito de cero zombie sin romper clientes que aún no emiten cabeceras
(Claude Code < 2.1.139). La eliminación explícita se realiza en G2 con gate propio.
