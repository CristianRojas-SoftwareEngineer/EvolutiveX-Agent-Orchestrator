# Mantenimiento de la skill `smart-code-proxy`

## Fuentes de verdad

1. **README del proyecto:** `README.md` en el repositorio **Smart Code Proxy** — narrativa, diagrama de flujo Mermaid, tabla de archivos de auditoría y matriz de entorno.
2. **Tipos de dominio:** `src/1-domain/types/audit.types.ts` (**`InteractionMetadata`**, **`ActiveInteraction`**, **`StepMeta`**, **`RequestClassification`**, **`InteractionType`**, **`InteractionOutcome`**, **`InteractionState`**, **`ParentContext`**, **`PendingAgentToolUse`**, `AuditTruncationMeta`, `SseLine`, `SseReconstructResult`, `SseReconstructOptions`, **`AuditInteractionContext`**, helpers `computeTokenTotals`, `computeSseRawBytesTotal`) — contrato tipado de los campos de `meta.json` y archivos derivados. Todo `meta.json` en disco es `InteractionMetadata`.
3. **Configuración de entorno:** `src/1-domain/types/config.types.ts` (`ProxyEnvironmentConfig`) y `src/4-api/config/env.config.ts` — resolución canónica de las variables de entorno activas con sus defaults (auditoría y SSE son incondicionales; ver `docs/how-sse-reconstruction-works.md` del proyecto).
4. **Ejemplo de `.env`:** `configs/.env.example` — referencia comentada de todas las variables.
5. **`SKILL.md` — frontmatter:** `name` y `description` son los únicos campos oficiales soportados por Claude Code. El `description` está redactado para auto-activar la skill tanto ante preguntas conceptuales (*"explica el proyecto"*, *"arquitectura PKA"*, *"reconstrucción SSE"*) como ante exploración de artefactos en `sessions/`. Campos como `paths` o `allowed-tools` **no se usan** porque Claude Code CLI los rechaza silenciosamente junto con toda la skill.
6. **Ports (interfaces):** `src/2-services/ports/` — `IAuditWriter` (incl. `writeSubInteractionRequest`, `nextSubInteractionSequence`), `ISessionStore` (métodos: `getBaseDir`, `ensureAuditSessionsRoot`, `nextAuditInteractionSequence`, `registerInteraction`, `registerToolUseId`, `getInteractionByToolUseId`, `getInteractionByDir`, `getInteractionByDirSync`, `incrementStepCountByDir`, `pushStepMetaByDir`, `closeInteraction`, `registerPendingAgentToolUse`, `findInteractionWithPendingAgents`, `consumePendingAgentToolUse`, `findStaleInteractionsAwaitingContinuation`, `getAllOpenInteractions`, `withSessionLock`), `ISseReconstructor`, `IStreamTee` definen el contrato que Capa 3 consume.
7. **Handlers (Capa 3):** `src/3-operations/` — `AuditInteractionHandler` (routing de clasificación, incl. `handleSideRequest`, `handleSubagent`, consumo de pendings en `handleContinuation`), `AuditSseResponseHandler` (detección de `Agent` tool_use y acumulación de `input_json_delta` para `subagentType`), `AuditStandardResponseHandler`, `AuditUpstreamErrorHandler`, `FilterToolsHandler` (filtra tools del request antes de enviar a la API) — todos migrados a lookups por `interactionDir` vía interactionRegistry; propagación de `parentContext` en `meta.json`.
8. **Statusline:** `scripting/router-status.ts` — script TypeScript que renderiza 2-3 tablas Unicode (sesión/proveedor, métricas de interacciones, rate limits) en la línea de estado de Claude Code. Documentado en [`statusline.md`](statusline.md).

## Relación con otras skills

- **anthropic-api-cost-estimation:** coste **Anthropic Messages** y ecuaciones MTok; depende de esta skill para la estructura de auditoría en `sessions/`.
- **openrouter-api-cost-estimation:** coste **OpenRouter Chat Completions**; referencia esta skill para la estructura de `sessions/` (solo Anthropic, no OpenRouter).

## Pares sensibles al sincronizar

| Cambio en el proyecto Smart Code Proxy | Revisar en la skill |
|----------------------------------------|---------------------|
| `README.md` § Referencia de Archivos de Auditoría | [`SKILL.md`](SKILL.md) (§ Jerarquía de directorios) y [`reference.md`](reference.md) (§ Matriz de presencia) |
| `README.md` § Configuración (Matriz de Entorno) | [`reference.md`](reference.md) (§ Variables de entorno) |
| `README.md` § Correlación de Sesión | [`SKILL.md`](SKILL.md) (§ Cómo navegar sesiones, paso 4) y [`reference.md`](reference.md) (§ Correlación de sesión) |
| `README.md` § Riesgos de Seguridad | [`SKILL.md`](SKILL.md) (§ Aviso de seguridad) |
| `src/1-domain/types/audit.types.ts` — campos de `InteractionMetadata` | [`reference.md`](reference.md) (§ `meta.json` — InteractionMetadata, campos core) |
| `src/1-domain/types/audit.types.ts` — campos de `StepMeta` | [`reference.md`](reference.md) (§ StepMeta) |
| `src/1-domain/types/audit.types.ts` — `RequestClassification` (incl. `side-request`) | [`SKILL.md`](SKILL.md) (§ Side-Requests, § Jerarquía) si afecta tipos de interacción |
| `src/1-domain/types/audit.types.ts` — `InteractionType` o `InteractionState` | [`reference.md`](reference.md) (§ Campos core InteractionMetadata, § `state.json`) y [`SKILL.md`](SKILL.md) |
| `src/1-domain/types/audit.types.ts` — campos de `AuditTruncationMeta` | [`reference.md`](reference.md) (§ Objeto `truncation`) |
| `src/1-domain/types/config.types.ts` — nuevas variables | [`reference.md`](reference.md) (§ Variables de entorno, tabla correspondiente) |
| `src/4-api/config/env.config.ts` — cambio de defaults o semántica | [`reference.md`](reference.md) (§ Variables de entorno) |
| `src/2-services/audit-writer.service.ts` — nuevos archivos o cambio de extensiones | [`SKILL.md`](SKILL.md) (§ Jerarquía), [`reference.md`](reference.md) (§ Catálogo y § Matriz) |
| `src/1-domain/services/session-resolver.service.ts` — lógica de resolución de sesión | [`SKILL.md`](SKILL.md) (§ Cómo navegar sesiones, paso 4) |
| `src/1-domain/services/request-classifier.service.ts` — heurística de clasificación (incl. `side-request` por `"tools": []`) | [`SKILL.md`](SKILL.md) (§ Side-Requests, § Cómo navegar sesiones) |
| `src/2-services/sse-reconstruct.service.ts` — precondiciones o fuente de bytes de la reconstrucción (p. ej. cambio de `sse.jsonl` ↔ `sse.txt`, reassembly del wire-format) | [`SKILL.md`](SKILL.md) (§ Jerarquía bullets de `sse.jsonl`/`sse.txt`, § Cómo navegar sesiones), [`reference.md`](reference.md) (§ Matriz de presencia, § `response/sse.txt`, § Campos reconstrucción `sseResponseBodySource`), `docs/how-sse-reconstruction-works.md` (§ Fuente de bytes SSE) |
| `src/2-services/audit-writer.service.ts` — cambio sync/async de `appendSseRawChunk` o `appendSseLine` (orden de escritura de `sse.txt`/`sse.jsonl`) | `docs/how-sse-reconstruction-works.md` (§ Fuente de bytes SSE) y `README.md` (§ Observabilidad SSE) |
| `src/2-services/ports/*.port.ts` — cambio de contrato de servicio (incl. nuevos métodos de `ISessionStore`) | [`SKILL.md`](SKILL.md) si afecta a la jerarquía; [`reference.md`](reference.md) si afecta a variables/campos |
| `src/3-operations/audit-interaction.handler.ts` — routing de clasificación o `handleSideRequest` | [`SKILL.md`](SKILL.md) (§ Clasificación de turnos, § Side-Requests) |
| `src/3-operations/audit-standard-response.handler.ts` — cierre inmediato de preflights | [`SKILL.md`](SKILL.md) (§ Preflights) y [`reference.md`](reference.md) (§ Escenarios de error) |
| `src/1-domain/types/audit.types.ts` — `PendingAgentToolUse`, `PendingWebSearchToolUse`, `ParentContext` | [`reference.md`](reference.md) (§ `meta.json` — InteractionMetadata, § `state.json`), [`SKILL.md`](SKILL.md) (§ Subagentes, § WebSearch) |
| `src/3-operations/audit-interaction.handler.ts` — `handleSubagent`, `handleWebSearchStep`, consumo pendings en `handleContinuation` | [`SKILL.md`](SKILL.md) (§ Subagentes, § WebSearch), [`reference.md`](reference.md) (§ Jerarquía, § `meta.json`) |
| `src/3-operations/audit-sse-response.handler.ts` — detección `Agent` y `WebSearch` tool_use, acumulación `input_json_delta` | [`SKILL.md`](SKILL.md) (§ Subagentes, § WebSearch) |
| `src/2-services/audit-writer.service.ts` — `writeSubInteractionRequest`, `nextSubInteractionSequence` | [`SKILL.md`](SKILL.md) (§ Jerarquía, § Subagentes), [`reference.md`](reference.md) (§ Jerarquía, § Catálogo) |
| `src/3-operations/filter-tools.handler.ts` — filtrado de tools | [`reference.md`](reference.md) (§ FILTERED_TOOLS) |
| Workflow `/analizar-sesion` refinado — principio observabilidad humana | [`SKILL.md`](SKILL.md) (§ Principio rector del diseño) |
| Workflow `/analizar-sesion` — diferencias vs inconsistencias | [`SKILL.md`](SKILL.md) (§ Diferencias de diseño vs inconsistencias) y [`gap-analysis.md`](gap-analysis.md) |
| `scripting/router-status.ts` — layout, columnas, clasificación, colores | [`statusline.md`](statusline.md) (secciones correspondientes) |

## Estrategia recomendada

1. Si el cambio afecta al contrato documentado, editar primero el `README.md` del proyecto Smart Code Proxy.
2. Actualizar los archivos correspondientes en la skill (`SKILL.md`, `reference.md`) según la tabla anterior.
3. Si se añaden nuevas variables de entorno a `ProxyEnvironmentConfig`, añadirlas en la sección correspondiente de `reference.md`.
4. Si se añade un nuevo servicio (Capa 1 o 2) o port (Capa 2), actualizar la tabla de capas en `README.md` y la tabla de pares sensibles arriba.
5. Cambios acotados a la tabla **«Relación con otras skills»** en [`SKILL.md`](SKILL.md) no obligan a reescribir `reference.md`.
6. Cuando se refine el entendimiento del comportamiento esperado (ej: Context Sync, observabilidad humana), actualizar primero el workflow de Windsurf, luego la skill (`SKILL.md`, `reference.md`, `gap-analysis.md`), y finalmente `MAINTENANCE.md` para mantener la trazabilidad de sincronización.

## Checklist: enrutamiento y referencias cruzadas

Al **añadir o renombrar** contenido en `reference.md`:

1. Verificar que la sección **Enrutamiento: pregunta o tarea → destino** en [`SKILL.md`](SKILL.md) sigue dirigiendo correctamente.
2. Verificar que la sección **Referencia de campos** en [`SKILL.md`](SKILL.md) sigue delegando al archivo correcto.

Al **renombrar o eliminar** secciones de [`SKILL.md`](SKILL.md):

- Buscar menciones en [`reference.md`](reference.md), en `README.md` del proyecto Smart Code Proxy, y en las skills hermanas (`anthropic-api-cost-estimation`, `openrouter-api-cost-estimation`).

## Plantilla estable (skills en `~/.claude/skills/`)

Convención compartida: un único H2 **Enrutamiento: pregunta o tarea → destino** en `SKILL.md`, y archivos de referencia complementarios. Si añades un checklist similar en otra herramienta y una actualización del producto lo borra, este archivo puede servir de ancla.

## Skills relacionadas

- **anthropic-api-cost-estimation:** sin la skill `smart-code-proxy`, la navegación a `usage` en disco es incompleta.
- **openrouter-api-cost-estimation:** referencia `smart-code-proxy` para la estructura de `sessions/` al auditar peticiones Anthropic.
