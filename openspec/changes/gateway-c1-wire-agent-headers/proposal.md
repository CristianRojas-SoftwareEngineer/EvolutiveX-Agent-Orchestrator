> **Orquestador:** `gateway-migration` | **Fase:** c1 (Bloque C — correlación wire)

## Why

El proxy no lee hoy las cabeceras de agente que Claude Code ≥ 2.1.139 emite en cada request
(`X-Claude-Code-Agent-Id`, `X-Claude-Code-Parent-Agent-Id`). Sin ese plano A de señal, la
correlación de subagentes depende de heurísticas frágiles: matching por prompt exacto o pending
único (`correlationMethod: 'prompt' | 'unique-pending'`), que falla ante múltiples subagentes
simultáneos o cuando el prompt no es único. Ver [§22 Plano A](../../../docs/proposals/gateway-design.md#22-plano-a--cabeceras-claude-code--21139)
y [§43 catálogo de fases](../../../docs/proposals/gateway-design.md#43-fases-de-implementación).

## What Changes

- Nuevo servicio puro `resolveAgentContext(headers)` (capa 1): extrae `agentId`, `parentAgentId` e
  `isSubagentRequest` de las cabeceras HTTP, sin I/O y case-insensitive.
- Nueva interface `IWorkflowRepository` **mínima** (capa 1) + adapter en memoria (capa 2), acotados
  a indexar `agentId`/`parentAgentId` y exponer `openSubagentFromWire`. `ISessionStore`/
  `ActiveInteraction` siguen siendo el correlador primario hasta la fase G2.
- Extensión de `CorrelationMethod` en `src/1-domain/types/audit.types.ts` con el valor
  `'agent-headers'`.
- Integración en `AuditInteractionHandler` (capa 3): si la request `fresh` trae cabeceras de agente,
  se abre el subagente vía `openSubagentFromWire` con precedencia sobre la ruta heurística actual.
- La ruta heurística (`resolvePendingByPrompt` / `unique-pending`) se **conserva como fallback
  documentado** para clientes sin cabeceras (Claude Code < 2.1.139 u otros harnesses).
- Cableado en `composition-root.ts` (capa 4).

## Capabilities

### New Capabilities

- `wire-agent-correlation`: correlación determinista de subagentes a través de las cabeceras
  `X-Claude-Code-Agent-Id` y `X-Claude-Code-Parent-Agent-Id` emitidas por Claude Code ≥ 2.1.139,
  con `correlationMethod: 'agent-headers'` y fallback a la heurística preexistente para clientes
  sin cabeceras.

### Modified Capabilities

_(ninguna — `openspec/specs/` no cubre aún el comportamiento de correlación wire)_

## No objetivos

- Join SSE `tool_use_id` ↔ subagente (fase C2).
- Endpoint `POST /hooks` y `AuditHookEventHandler` (fase C3).
- Cierre E2E `buildWorkflowResult` + proyección disco (fase C4).
- Migración completa de `ISessionStore` a `IWorkflowRepository` y delegación de handlers al nuevo
  repo (fase G2).
- Eliminar la ruta heurística (se mantiene como fallback; retirada planificada en G2).
- Cambios en el layout `sessions/` (fases P).

## Impact

- **Capas PKA:**
  - Capa 1 (`1-domain/`): nuevo servicio `resolve-agent-context.service.ts`, nueva interface
    `repositories/IWorkflowRepository.ts`, extensión de `CorrelationMethod` en `audit.types.ts`.
  - Capa 2 (`2-services/`): nuevo `workflow-repository.service.ts` (adapter memoria mínimo).
  - Capa 3 (`3-operations/`): `audit-interaction.handler.ts` — orden de decisión extendido con
    rama `isSubagentRequest`.
  - Capa 4 (`4-api/`): `composition-root.ts` — cableado del nuevo repo y servicio.
- **Tests:** `tests/1-domain/`, `tests/2-services/`, `tests/3-operations/`, `tests/5-user-interfaces/`.
- **Docs:** `README.md` (sección de correlación), `docs/session-audit-model.md` (plano A + nuevo
  método).
- **No toca:** `src/5-user-interfaces/` (sin rutas nuevas en C1), `sessions/` layout, `routing/`.
