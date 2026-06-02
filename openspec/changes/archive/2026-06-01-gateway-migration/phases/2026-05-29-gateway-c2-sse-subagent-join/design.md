## Context

C1 (`gateway-c1-wire-agent-headers`) introdujo la rama de correlación por cabeceras en `handleSubagent` (`src/3-operations/audit-interaction.handler.ts`), pero dejó una limitación deliberada documentada en [§23](../../../docs/proposals/gateway-design.md#23-plano-b--join-tooluse%E2%86%94subagente): el `triggeringToolUseId` solo se resuelve cuando hay exactamente un `PendingAgentToolUse`; con N pendings paralelos queda `null`. Adicionalmente, la lógica de join para la rama sin-cabeceras vive como método privado inline `resolvePendingByPrompt` (`:299-324`), separado de la rama de cabeceras y sin cubrir el caso N-pendings-sin-match.

C2 implementa el plano B de §23: una función pura de dominio `joinToolUseToSubagent` que aplica la tabla de política de join (unique / prompt / FIFO / diferido) y resuelve el `tool_use_id` de forma determinista con cualquier número de pendings. Ambas ramas del handler delegan en ella, y `resolvePendingByPrompt` se retira.

## Goals / Non-Goals

**Goals:**

- Función pura de dominio `joinToolUseToSubagent` en capa 1 que implementa la tabla de política §23.
- Resolución determinista de `triggeringToolUseId` con N pendings paralelos bajo `correlationMethod: 'agent-headers'`.
- Nuevo valor `'fifo-pending'` en `CorrelationMethod` para el caso N-pendings-sin-match sin cabeceras.
- Retiro de `resolvePendingByPrompt` absorbiendo su lógica en la función pura.
- Unificación del punto de join en el handler (ambas ramas usan la misma función pura).

**Non-Goals:**

- Endpoint `POST /hooks` y `confirmSubagentFromHook` (C3).
- Cierre E2E del ciclo de vida de workflows (C4).
- Migración del registro de pendings de `ISessionStore` a `IWorkflowRepository` (G2).
- Eliminación de la rama fallback completa sin-cabeceras (G2).
- Modificaciones al layout `sessions/` (bloque P).
- Nuevas rutas HTTP.

## Decisions

### Decisión 1: `joinToolUseToSubagent` como función pura de dominio (capa 1)

La función vive en `src/1-domain/services/join-tool-use-to-subagent.service.ts`.

**Firma:**
```
joinToolUseToSubagent(
  pendings: PendingAgentToolUse[],
  agentCtx: AgentContext | undefined,
  subagentPrompt: string | null
) → {
  toolUseId: string | null;
  subagentType?: string;
  correlationMethod: CorrelationMethod;
  correlationStatus: 'resolved' | 'unresolved';
}
```

**Rationale:** La tabla de join §23 es lógica de dominio pura — sin I/O, sin dependencias hacia afuera — y debe ubicarse en capa 1 para ser testeable de forma unitaria y reutilizable. Colocarla en el handler (capa 3) repetiría el problema actual: lógica de negocio embebida en la capa de operaciones.

**Alternativa rechazada:** Método en `IWorkflowRepository` — violaría PKA (capa 2 no puede contener lógica de dominio pura) y acoplaría el join a la persistencia.

---

### Decisión 2: Semántica de `correlationMethod` — autoridad §21 preservada

La función aplica la tabla §23 respetando la jerarquía de autoridad de [§21](../../../docs/proposals/gateway-design.md#21-reglas-de-autoridad-por-concern):

**Con cabeceras** (`agentCtx.isSubagentRequest === true`): `correlationMethod` es siempre `'agent-headers'` (máxima autoridad). El `toolUseId` se resuelve por:
1. Un único pending → ese `tool_use_id`.
2. N pendings + match de prompt → el `tool_use_id` del pending que matchea.
3. N pendings sin match → FIFO (primer pending registrado); `correlationMethod` sigue siendo `'agent-headers'`.
4. 0 pendings → `toolUseId: null`, `correlationStatus: 'resolved'` (identidad padre-hijo establecida por cabeceras; join exacto diferido a hooks en C3).

**Sin cabeceras** (fallback legacy): `correlationMethod` es `'unique-pending'` | `'prompt'` | `'fifo-pending'` | `'none'`, según qué resuelva la tabla.

**Rationale:** El `correlationMethod` registra la señal de mayor autoridad que participó en la correlación. Con cabeceras, esa autoridad es siempre `'agent-headers'` independientemente del mecanismo auxiliar de selección del `tool_use_id` específico.

---

### Decisión 3: Añadir `'fifo-pending'` a `CorrelationMethod`

El tipo en `src/1-domain/types/audit.types.ts` (`:265`) pasa de:
```
'agent-headers' | 'prompt' | 'unique-pending' | 'none'
```
a:
```
'agent-headers' | 'prompt' | 'unique-pending' | 'fifo-pending' | 'none'
```
Se actualiza el JSDoc de la unión (`:256-264`) para documentar el nuevo valor y su posición en la jerarquía.

**Rationale:** El caso N-pendings-sin-match hoy devuelve `'none'`/unresolved aunque el sistema haya tomado una decisión determinista (el primer pending). `'fifo-pending'` nombra esa decisión con precisión semántica y la distingue de un fallo real de correlación.

**Alternativa rechazada:** Reutilizar `'none'` — pierde información; reutilizar `'unique-pending'` — semánticamente incorrecto (hay múltiples pendings).

---

### Decisión 4: Sin nueva capa de servicios ni migración de pending-tracking

El registro de pendings sigue en `ISessionStore` (`registerPendingAgentToolUse`). `joinToolUseToSubagent` recibe el array de pendings ya resuelto como parámetro — no lo consulta directamente. El handler sigue siendo responsable de obtener los pendings del store y pasarlos a la función pura.

**Rationale:** Migrar `registerPendingAgentToolUse` a `IWorkflowRepository` es el alcance de G2. C2 es quirúrgico, igual que C1: zero cambios en ports de capa 2.

---

### Decisión 5: Retiro de `resolvePendingByPrompt` por absorción

El método privado `resolvePendingByPrompt` (`:299-324`) se elimina del handler. Su lógica (match de prompt + unique-pending) se incorpora en `joinToolUseToSubagent` como parte de la rama sin-cabeceras. El comentario `@deprecated-fallback` se traslada a la llamada de la función pura desde la rama sin-cabeceras del handler, indicando que la rama completa está planificada para retirada en G2.

**Rationale:** Eliminar el método inline sin absorber su lógica dejaría un hueco de cobertura. Absorberlo en la función pura centraliza toda la lógica de join en un solo lugar testeable.

---

### Decisión 6: Deltas de spec en `wire-agent-correlation` (sin capability nueva)

C2 no introduce una capability nueva; extiende la correlación wire que C1 inició. Los deltas van como `MODIFIED` y `ADDED` en `openspec/changes/gateway-c2-sse-subagent-join/specs/wire-agent-correlation/spec.md`:

- **MODIFIED** "Precedencia de correlación por cabeceras sobre heurística": actualiza el escenario para cubrir N pendings con cabeceras.
- **MODIFIED** "Valor `'agent-headers'` en CorrelationMethod": añade `'fifo-pending'` a la unión documentada.
- **ADDED** "Join determinista tool_use_id↔subagente (plano B)": los 4 escenarios de la tabla §23.

**Rationale:** Una capability separada implicaría que C2 introduce comportamiento de correlación independiente de C1. No es así — C2 completa el join que C1 dejó parcialmente implementado.

## Archivos afectados

| Archivo | Operación | Notas |
|---------|-----------|-------|
| `src/1-domain/types/audit.types.ts` | Modificar | Añadir `'fifo-pending'` a `CorrelationMethod` (:265), actualizar JSDoc (:256-264) |
| `src/1-domain/services/join-tool-use-to-subagent.service.ts` | Crear | Función pura, tabla §23 |
| `tests/1-domain/join-tool-use-to-subagent.test.ts` | Crear | 4 escenarios de la tabla de join |
| `src/3-operations/audit-interaction.handler.ts` | Modificar | Refactorizar `handleSubagent` (:332-477); eliminar `resolvePendingByPrompt` (:299-324) |
| `tests/3-operations/audit-interaction.handler.test.ts` | Ampliar | Escenarios N-pendings con y sin cabeceras |
| `tests/5-user-interfaces/` | Ampliar/Crear | Test E2E fallback legacy con múltiples pendings |
| `docs/session-audit-model.md` | Actualizar | Tabla `CorrelationMethod` + descripción join plano B |
| `openspec/changes/gateway-migration/design.md` | Actualizar | Estado C2 → `validada` en el registro de fases |

**No tocar en C2:** `audit-sse-response.handler.ts`, `ISessionStore`, `IWorkflowRepository`, rutas HTTP, layout `sessions/`.

## Risks / Trade-offs

- **FIFO como desempate sin cabeceras**: Si el orden de registro de pendings no es determinista bajo concurrencia real, `'fifo-pending'` podría dar resultados inconsistentes. Mitigación: el registro de pendings es secuencial en el handler actual; documentar el supuesto de orden-de-llegada en el JSDoc de la función.
- **Absorber `resolvePendingByPrompt` puede alterar cobertura de tests**: el método privado puede tener comportamientos edge no cubiertos. Mitigación: revisar tests existentes del handler antes de eliminar el método; ampliar cobertura si hay gaps.
- **0 pendings con cabeceras devuelve `toolUseId: null`**: aceptado por diseño (diferido a C3 hooks), pero el handler debe manejar este caso explícitamente para no introducir regresiones en C1.
