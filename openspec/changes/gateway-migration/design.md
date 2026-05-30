## Context

El gateway actual implementa el modelo `Interaction`/wire-only. El modelo objetivo requiere `Workflow/Step/ToolUse`, correlación Wire+Hooks y layout `causal-workflows-v1`, según [§43–§44](../../../docs/proposals/gateway-design.md#43-fases-de-implementación) de `docs/proposals/gateway-design.md`. Este change no implementa ninguna fase; define únicamente cómo se gobierna la migración.

## Goals / Non-Goals

**Goals:**

- Registro de fases trazable 1:1 a §43, con estados y dependencias.
- Convención de nombres para changes hijos y su back-reference al orquestador.
- Estrategia de validación diferenciada por bloque (C / G / P).
- Política de mantenimiento documental y reducción de legacy por fase.
- Política de creación incremental de changes hijos.

**Non-Goals:**

- Diseño técnico de ninguna fase (eso va en el `design.md` de cada change de segundo nivel).
- Modificación de `src/`, `tests/` o `sessions/` como parte de este change.

## Registro de fases

La relación padre→hijo entre este orquestador y los changes de segundo nivel se expresa de dos formas complementarias, dado que OpenSpec no tiene jerarquía nativa:

1. **Registro del orquestador** (tabla siguiente): el orquestador enumera todos los changes hijos posibles con sus slugs propuestos, aunque estos aún no existan en `openspec/changes/`.
2. **Back-reference en el change hijo**: cada change `gateway-<faseid>-<slug>` incluye en su `proposal.md` la sección `Orquestador: gateway-migration` con el phase ID correspondiente.

| Fase | Change hijo | Bloque | Dependencia (§43) | Gate de validación | Docs a actualizar | Legacy a retirar | Estado |
|------|-------------|--------|-------------------|--------------------|-------------------|------------------|--------|
| C0 | *(sin change hijo — es este documento)* | Documentación | — | Artefactos del orquestador completos | `docs/proposals/gateway-design.md` | — | validada |
| C1 | `gateway-c1-wire-agent-headers` | Correlación wire | — | `npm run test:quick` + test E2E Fastify con cabeceras | `README.md`, `docs/session-audit-model.md` | Lógica heurística de correlación de agente (degradada a `@deprecated-fallback` en C1; eliminación efectiva diferida a G3/G4) | archivada |
| C2 | `gateway-c2-sse-subagent-join` | Correlación wire | C1 | Pruebas de join `tool_use_id`↔subagente + fallback legacy E2E | `docs/session-audit-model.md` | Correlación pending heurística de subagente | archivada |
| C3 | `gateway-c3-hooks-endpoint` | Borde hooks | C1 | Pruebas de endpoint `POST /hooks` + `AuditHookEventHandler` E2E | `README.md`, `docs/proposals/gateway-design.md` | — | archivada |
| G1 | `gateway-g1-domain-types-services` | Refactor gateway | — | `npm run test:quick` | `docs/proposals/gateway-design.md` §39 | Tipos `Interaction*` en capa 1 reemplazados | archivada |
| G2 | `gateway-g2-workflow-repository` | Refactor gateway | G1, C2, C3 | `npm run test:quick` | `docs/session-audit-model.md` | `ActiveInteraction` en port capa 2 | archivada |
| G3 | `gateway-g3-step-assembler` | Refactor gateway | G2 | `npm run test:quick` | `docs/session-audit-model.md` | Lógica de ensamblaje incrustada en `audit-sse-response.handler` | archivada |
| G4 | `gateway-g4-audit-projection` | Refactor gateway | G3 | `npm run test:quick` (si toca persistencia: `npm run test`) + subset §37b | `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §33.2, §40 | `InteractionMetadata` generado directamente (reemplazado por `WorkflowResult`); cierre wire-only como ruta principal; `updateSessionMetrics()` en `audit-writer.service.ts` (reemplazado por `SessionMetricsService`); tipo `SessionMetrics` en `audit.types.ts` (migrado a tipos gateway) | archivada |
| G5 | `gateway-g5-provider-catalog` | Refactor gateway | — | `npm run test:quick` | `docs/proposals/gateway-design.md` §39 | `ProviderCatalog` inline en `routing/` (no existía en src/; diferido a P0+) | validada |
| P0 | `gateway-p0-layout-diff-spike` | Persistencia | G4 | Spike documentado — sin gate de tests | `docs/proposals/gateway-design.md` §29–§37 | — | pendiente |
| P1 | `gateway-p1-directory-migration` | Persistencia | P0, G4 | `npm run test` + casos 1–7, 15, 16, 19 del checklist [§37b](../../../docs/proposals/gateway-design.md#37b-checklist-de-aceptación-e2e-del-layout) | `docs/session-audit-model.md`, `README.md`, `docs/proposals/gateway-design.md` §30 | Layout flat `sessions/{session}/{interaction}/` | pendiente |
| P2 | `gateway-p2-new-artifacts` | Persistencia | P1 | `npm run test` + checklist [§37b](../../../docs/proposals/gateway-design.md#37b-checklist-de-aceptación-e2e-del-layout) completo (20 casos) | `docs/session-audit-model.md`, `docs/proposals/gateway-design.md` §33 | Artefactos de persistencia obsoletos | pendiente |

## Convención de nombres de changes hijos

```
gateway-<faseid>-<slug>
```

- `<faseid>`: identificador en minúsculas de la fase (p. ej. `c1`, `g2`, `p0`).
- `<slug>`: descripción kebab-case del entregable principal de la fase.
- Ejemplos: `gateway-c1-wire-agent-headers`, `gateway-g1-domain-types-services`, `gateway-p0-layout-diff-spike`.

### Back-reference obligatoria en el change hijo

Cada `proposal.md` de un change de segundo nivel SHALL incluir al inicio:

```
> **Orquestador:** `gateway-migration` | **Fase:** <faseid> (<bloque>)
```

Esto es la única forma de navegar de hijo a padre, dado que OpenSpec no soporta jerarquía nativa.

## Estrategia de validación por bloque

### Bloque C — Correlación Wire+Hooks

Gates de integración/E2E que verifican identidad de correlación, join `tool_use_id`↔subagente y cierre de ciclo de vida:

- Pruebas de correlación con cabeceras plano A (§22).
- Pruebas de join SSE plano B (§23) con `tool_use_id` out-of-order.
- Pruebas de `POST /hooks` plano C (§24) y `AuditHookEventHandler`.

Comando base: `npm run test:quick` (lint + typecheck + toda la suite Vitest, incluidos E2E Fastify). Los tests E2E de correlación se añaden en cada change hijo.

### Bloque G — Refactor dominio

Gates de regresión unitaria ejecutados en cada fase de refactor:

```bash
npm run test:quick   # lint + typecheck + unit tests
```

El refactor no debe romper comportamiento observable. Si una fase G toca integración (p. ej. G4 altera proyección a disco), se eleva a `npm run test`.

### Bloque P — Persistencia / convergencia layout

Gate de aceptación del layout `causal-workflows-v1`:

```bash
npm run test   # lint + typecheck + unit + build
# + verificación manual del checklist §37b (20 casos)
```

P1 requiere el subconjunto de §37b relativo a estructura de directorios. P2 requiere el checklist completo.

## Mantenimiento documental por fase

Cada change hijo es responsable de actualizar los documentos listados en su fila del registro **antes** de marcar la fase como validada. La política es:

1. Actualizar solo lo que la fase cambia; no reescribir secciones no afectadas.
2. `docs/proposals/gateway-design.md` es la fuente de verdad del diseño; no se debe afirmar como implementado algo que aún no lo está.
3. `README.md` refleja el estado operativo del proxy (qué funciona hoy).
4. `docs/session-audit-model.md` describe el modelo de auditoría tal como está implementado.

## Reducción de legacy por fase

El legacy a retirar de cada fase se lista en el registro. La política es:

1. El código reemplazado se elimina en el mismo change que lo reemplaza.
2. Si no puede eliminarse de inmediato (dependencia transitoria), se marca con un comentario de deprecación: razón, fase de retirada y fecha planificada.
3. Los imports huérfanos que generen el propio change deben eliminarse antes de que el gate (`npm run test:quick` o `npm run test`) pase.

## Política de creación incremental de changes hijos

- El registro enumera los 11 changes hijos posibles con slugs propuestos.
- **No se crean de golpe**: cada change hijo se crea con `openspec-propose` al **iniciar** su fase.
- Antes de crear el change hijo se verifica en el registro que sus dependencias están en estado `validada` o `archivada`.
- Orden de inicio según dependencias PKA dentro de cada bloque: dominio (capa 1) → servicios (capa 2) → operations (capa 3) → api (capa 4) → UI (capa 5).

## Decisions

### Modelo de dos niveles sin jerarquía nativa en OpenSpec

**Decisión:** Expresar la relación padre→hijo mediante el registro del orquestador + back-reference en el `proposal.md` del change hijo.

**Rationale:** OpenSpec no tiene soporte nativo de jerarquía de changes. Esta convención es suficiente para navegar la relación y para que el skill `migration-phase-gate` valide la trazabilidad. Añadir jerarquía nativa sería over-engineering fuera del alcance de este change.

**Alternativa rechazada:** Carpeta anidada (`openspec/changes/gateway-migration/phases/`) — no es el modelo de OpenSpec y rompería los comandos del CLI.

### Fases G en paralelo con C o entre sí

**Decisión:** G1 y G5 pueden iniciarse en paralelo con las fases C (ambos tienen dependencia `—`). G2–G4 siguen la cadena G1→G2→G3→G4. G2 depende además de C2 y C3 (el borde hooks/SSE debe existir para que el lifecycle de cierre `readyToClose` pueda integrarse con las costuras C1/C2/C3 en el repositorio).

**Rationale:** §43 lo explicita. Maximiza el paralelismo sin romper la integridad del dominio. El cierre E2E vive íntegramente en el bloque G: domain services en G1, lifecycle de cierre en G2, `AuditWorkflowClosureHandler` y proyección `WorkflowResult` en G4.

### Integración de métricas de tokens de sesión en G3 y G4

**Decisión:** La lógica de agregación de consumo de tokens por sesión — actualmente dispersa en `audit-interaction.handler.ts` y `audit-writer.service.ts` — se integra en el stack objetivo distribuyendo la responsabilidad entre G3 y G4.

- **G3** añade la propagación de `step.inferenceRequest.model` → `workflow.languageModelId` al completar cada step (primer modelo observado). Provee el dato de modelo que G4 necesita para el desglose por `modelId` en `session-metrics.json`.
- **G4** añade `aggregateWorkflowUsageByModel` (L1 puro: agrupa `Step.usage` por `modelId`) y `SessionMetricsService` (L2: escritura atómica de `session-metrics.json` con desglose por modelo, `session_totals` y `cache_efficiency` alineados a §33.2). La invariante G16 se enforce aquí: solo workflows `kind: 'main'` actualizan las métricas de sesión (los sub-workflows ya están incluidos en el rollup del padre). `duration_ms` y `outcome` se difieren al igual que `totalCostUsd`.

**Rationale:** La proyección `WorkflowResult` a disco ya ocurre en G4. Añadir `SessionMetricsService` en la misma fase evita una fase adicional y es el punto natural: el workflow está cerrado, su `usage` agregado está disponible y el `languageModelId` propagado en G3 ya es accesible. El tipo `SessionMetrics` de `audit.types.ts` migra a tipos gateway en G4 junto con la retirada de `updateSessionMetrics()` y `InteractionMetadata`.
