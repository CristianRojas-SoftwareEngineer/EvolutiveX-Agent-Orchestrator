## Context

El proxy no tiene hoy ningún endpoint de hooks. La correlación de subagentes depende exclusivamente de señales wire (SSE): `openSubagentFromWire` (planos A+B, C1+C2) y `stop_reason` como cierre transitorio. Claude Code emite hooks autoritativos ([§24](../../../docs/proposals/gateway-design.md#24-plano-c--hooks-claude-code)) que contienen el único cierre E2E fiable (`Stop` / `SubagentStop` / `StopFailure`) y el join confirmado (`SubagentStart → confirmSubagentFromHook`).

**Nota de ordering:** C3 corre antes del refactor G (G1 tipos de dominio, G2 workflow repository, G3 step assembler). El modelo `Workflow/Step/ToolUse` con `ToolUse.status`, `childWorkflowId` y `readyToClose` no existe aún en este punto. C3 se limita a las mutaciones implementables contra el modelo actual (`WireSubagentEntry` en `IWorkflowRepository`); las mutaciones ricas de estado se difieren a G1/G2/C4.

C3 abre ese segundo borde normativo añadiendo los tipos de hook en capa 1, el `AuditHookEventHandler` en capa 3 y el endpoint `POST /hooks` en capa 5. El estado *listo-para-cerrar* queda como costura que C4 consumirá para construir `WorkflowResult` y proyectar a disco.

## Goals / Non-Goals

**Goals:**

- Endpoint `POST /hooks` funcional, registrado antes del catch-all, con respuesta 2xx rápida.
- Tipos `ClaudeHookEvent` + `HookEventName` en capa 1 sin I/O.
- Función pura `parseHookEvent` en capa 1.
- `AuditHookEventHandler` en capa 3 que despacha los 10 eventos §24; solo `SubagentStart` ejecuta mutación real; los demás son stubs forward-compatible con comentario de diferimiento a G2/C4.
- `confirmSubagentFromHook` en `IWorkflowRepository` (capa 1) + `WorkflowRepositoryService` (capa 2).

**Non-Goals:**

- `buildWorkflowResult` + `AuditWorkflowClosureHandler` + proyección a disco (C4).
- Mutaciones de estado de `ToolUse` (`running`/`completed`/`error`) y lifecycle `readyToClose` — requieren el modelo `Workflow/Step/ToolUse` de G1–G2; diferidas a G1/G2/C4.
- Apertura/alineación de workflow `main` (`UserPromptSubmit`) — requiere tipo de workflow no existente aún; diferida a G2/C4.
- Timer de timeout `ToolUse` §24.1 (diferido).
- Migración de pendings de `ISessionStore` a `IWorkflowRepository` (G2).
- Cambios en layout `sessions/` (fases P).
- Modificación de la ruta `/v1/messages` o del proxy catch-all.

## Decisions

### Decisión 1: Registro de la ruta `POST /hooks` antes del proxy catch-all

La ruta `POST /hooks` se registra en `src/app.ts` siguiendo el patrón de `/health` (`app.ts:36`): una declaración inline antes de `app.register(proxyRoutes, { deps })`. El body parser buffer ya está activo (`app.ts:31`) y basta para deserializar el payload JSON del hook. El `preHandler` del proxy se registra **dentro** del plugin `proxyRoutes` (encapsulado), por lo que rutas declaradas en el root `app` antes de `register(proxyRoutes)` quedan fuera de ese hook y del catch-all.

**Rationale:** Fastify resuelve rutas en orden de registro. Si `proxyRoutes` (el catch-all) se registra primero, `POST /hooks` sería capturada y reenviada a upstream. Registrar la ruta hooks antes del catch-all es la solución mínima y sigue el patrón ya establecido para `/health`.

**Alternativa rechazada:** Plugin de rutas propio bajo `src/5-user-interfaces/hooks/` — introduce una capa de indirección innecesaria para una sola ruta; el patrón `/health` es suficiente para esta fase.

---

### Decisión 2: Ubicación de los tipos de hook en archivo separado

Los tipos `ClaudeHookEvent`, `HookEventName` y la función `parseHookEvent` se ubican en `src/1-domain/types/hook.types.ts` (nuevo archivo), no en `audit.types.ts`.

**Rationale:** Los hooks son un concern de entrada distinto del modelo de auditoría (workflows, steps, tool uses). Mantenerlos en un archivo separado evita que `audit.types.ts` acumule responsabilidades heterogéneas y facilita razonar sobre la frontera hooks vs. wire.

**Alternativa rechazada:** Ampliar `audit.types.ts` — mezcla el vocabulario de entrada (hooks) con el modelo de dominio interno (auditoría), dificultando la cohesión del archivo.

---

### Decisión 3: `AuditHookEventHandler` como clase con deps inyectadas (capa 3)

El handler sigue el patrón de `audit-interaction.handler.ts`: clase con dependencias inyectadas (`workflowRepo: IWorkflowRepository`, `logger?: Logger`) y método público `execute(event: ClaudeHookEvent): void` que despacha por `eventName` con un switch o tabla de mapeo. **Solo `SubagentStart`** ejecuta una mutación real (`confirmSubagentFromHook`). Los demás eventos (tool-state y cierre) son stubs que registran en log "recibido — mutación diferida a G2/C4" sin tocar el estado del correlador.

**Rationale:** Consistencia con el patrón existente de handlers en capa 3. La inyección de `IWorkflowRepository` respeta PKA (capa 3 depende de capa 1/2, nunca al revés). El método `execute` es testeable unitariamente con mocks del repo. Los stubs son forward-compatible: cuando G2 introduzca el modelo rico, se sustituyen por mutaciones reales sin cambiar la firma.

**Alternativa rechazada:** Función libre en capa 3 — pierde la encapsulación de dependencias y la cohesión del handler; rompe el patrón establecido.

---

### Decisión 4: `confirmSubagentFromHook` en `IWorkflowRepository` y `WorkflowRepositoryService`

Se añade `confirmSubagentFromHook(agentId: string, toolUseId?: string): void` a la interfaz `IWorkflowRepository` en `src/1-domain/repositories/IWorkflowRepository.ts` y se implementa en `WorkflowRepositoryService` (`src/2-services/workflow-repository.service.ts`).

La implementación extiende `WireSubagentEntry` con `confirmed: boolean` y `triggeringToolUseId?: string`. Reconcilia dos caminos de llegada posibles:
- Hook llega **después** del wire: `openSubagentFromWire` ya creó la entrada; `confirmSubagentFromHook` la marca como `confirmed: true` y registra `triggeringToolUseId` si `toolUseId` está presente.
- Hook llega **antes** del wire (carrera §28): `confirmSubagentFromHook` registra la confirmación pendiente; cuando llegue `openSubagentFromWire`, el enlace se resuelve.

**Rationale:** La lógica de reconciliación vive en el repo service (capa 2) para no duplicarla en el handler (capa 3). El handler solo llama `confirmSubagentFromHook` sin conocer el estado previo.

**Alternativa rechazada:** Lógica de reconciliación inline en el handler — acopla el handler a detalles de estado del correlador y dificulta el test unitario.

---

### Decisión 5: Eventos de cierre como stubs diferidos a C4/G2

Los eventos de cierre (`Stop`, `SubagentStop`, `StopFailure`) se **despachan** en C3 (el switch los reconoce) pero **no se actúan**: no hay campo `readyToClose`, ni entrada de workflow, ni `WorkflowResult`, ni escritura en `sessions/`. El handler registra en log "evento de cierre recibido — acción diferida a C4/G2" y retorna.

**Rationale:** El lifecycle de workflow (`readyToClose`, apertura/cierre de instancias de workflow) requiere el modelo `Workflow/Step/ToolUse` que G2 introduce. C3 corre antes de G; implementar `readyToClose` ahora requeriría crear infraestructura que G2 reemplazará. La costura real se introduce en C4 una vez que G2 exista.

**Alternativa rechazada:** Añadir `readyToClose` como campo ad-hoc en `WireSubagentEntry` — crearía un modelo híbrido incompleto que G2 tendría que migrar o eliminar, añadiendo deuda sin beneficio observable en C3.

---

### Decisión 6: Cableado en `composition-root.ts` y `HooksController` delgado

`AuditHookEventHandler` se instancia en `src/4-api/composition-root.ts` y se exporta en `ProxyDependencies`. El `HooksController` en capa 5 es un wrapper delgado: parsea el body con `parseHookEvent`, llama `handler.execute(event)` y responde 2xx. Ninguna lógica de negocio en el controller.

**Rationale:** Sigue el patrón de composición ya establecido en el proxy. La lógica de despacho está en capa 3 (testeable), el controller solo orquesta entrada/salida HTTP.

## Archivos afectados

| Archivo | Operación | Notas |
|---------|-----------|-------|
| `src/1-domain/types/hook.types.ts` | Crear | `ClaudeHookEvent`, `HookEventName`, `parseHookEvent` |
| `src/1-domain/repositories/IWorkflowRepository.ts` | Modificar | Añadir firma `confirmSubagentFromHook` a `IWorkflowRepository` |
| `src/2-services/workflow-repository.service.ts` | Modificar | Implementar `confirmSubagentFromHook`; extender `WireSubagentEntry` con `confirmed` y `triggeringToolUseId` |
| `src/3-operations/audit-hook-event.handler.ts` | Crear | `AuditHookEventHandler` con despacho de los 10 eventos §24 |
| `src/4-api/composition-root.ts` | Modificar | Instanciar `AuditHookEventHandler`; exportar en `ProxyDependencies` |
| `src/app.ts` | Modificar | Registrar ruta `POST /hooks` inline antes de `register(proxyRoutes)`, patrón de `/health` |
| `src/5-user-interfaces/http/hooks.controller.ts` | Crear | `HooksController` delgado; parsea body, llama handler, responde 2xx |
| `tests/1-domain/hook.types.test.ts` | Crear | Tests unitarios de `parseHookEvent` (payload válido, payload sin eventName) |
| `tests/3-operations/audit-hook-event.handler.test.ts` | Crear | Tests unitarios del handler: escenarios de despacho por eventName |
| `tests/5-user-interfaces/hooks.e2e.test.ts` | Crear | Test E2E Fastify: `POST /hooks` evento → mutación correlador → 2xx |
| `docs/README.md` | Actualizar | Mencionar endpoint `POST /hooks` como borde activo desde C3 |
| `docs/proposals/gateway-design.md` | Actualizar | Estado C3 como implementada en el diagrama/registro |

**No tocar en C3:** `audit-sse-response.handler.ts`, `audit-interaction.handler.ts`, `ISessionStore`, ruta `/v1/messages`, layout `sessions/`, capability `wire-agent-correlation`.

## Risks / Trade-offs

- **Ordering C3 antes de G:** C3 se implementa antes del refactor G (G1 tipos de dominio, G2 workflow repository). Cualquier intento de mutar `ToolUse.status` o `readyToClose` en C3 requeriría tipos inexistentes. Mitigación: los stubs son la posición correcta; las mutaciones ricas se introducen cuando G2 exista y se implementen en C4.
- **Carrera hook-antes-de-wire (`SubagentStart` antes de `openSubagentFromWire`):** Documentada en §28. `confirmSubagentFromHook` debe manejar el caso de entrada no existente sin lanzar; la reconciliación se resuelve cuando llegue el wire. Mitigación: el test E2E debe cubrir el orden hook-first.
- **`Stop` con `stopHookActive === true`:** En C3 los eventos de cierre son stubs; no hay riesgo de marcar cierre prematuro. La restricción sigue siendo relevante para C4. Mitigación: scenario explícito en spec y test unitario (verificar no-acción).
- **Respuesta 2xx antes del procesamiento:** El controller debe responder antes de que el handler lance una excepción; si el handler falla, el 2xx ya fue enviado. Mitigación: capturar errores en el handler con logging; no propagar al response.
