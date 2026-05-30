## Why

El gateway opera hoy con el modelo `Interaction`/wire-only (ver [§44 comparativa actual vs objetivo](../../../docs/proposals/gateway-design.md#44-comparativa-lado-a-lado-actual-vs-objetivo)): un único borde HTTP/SSE, correlación heurística de subagentes y layout de disco `sessions/{session}/{interaction}/` flat. El modelo objetivo requiere `Workflow/Step/ToolUse`, dos bordes coordinados (Wire + Hooks), correlación determinista de planos A/B/C y convergencia a `causal-workflows-v1` (ver [§43 catálogo de fases](../../../docs/proposals/gateway-design.md#43-fases-de-implementación)).

Migrar de golpe es inviable por el riesgo de regresión y la amplitud del cambio. Se necesita un marco de gobernanza que divida la migración en fases iterativas, validadas y sin acumular código ni documentación zombie.

## What Changes

- Se introduce el change orquestador `gateway-migration` que **solo** define el marco de gobernanza de la migración; no toca `src/`.
- Se establece un **registro de fases** trazable 1:1 a [§43](../../../docs/proposals/gateway-design.md#43-fases-de-implementación) (C0–C3, G1–G5, P0–P2), con estados y dependencias.
- Se definen, por cada fase, el change de segundo nivel a crear, el gate de validación, los docs a actualizar y el legacy a retirar.
- Se acuerda el modelo de dos niveles: Nivel 1 = este orquestador (gobernanza); Nivel 2 = un change por fase (`gateway-<faseid>-<slug>`), creados de forma incremental.

## Capabilities

### New Capabilities

- `gateway-migration-governance`: marco normativo que regula **cómo** se ejecuta la migración del gateway: trazabilidad de fases, materialización por change L2, Definición de Hecho por fase, gate de dependencias, registro de estados y política de reducción de legacy/zombie.

### Modified Capabilities

_(ninguna — este change no modifica comportamiento acordado existente en `openspec/specs/`)_

## No objetivos

- Este change no contiene tareas de implementación concretas de ninguna fase.
- No toca `src/`, `tests/`, `sessions/` ni ningún archivo de código durante su propia implementación.
- No crea los 11 changes de segundo nivel de antemano; cada change hijo se crea de forma incremental al iniciar su fase.
- No define el diseño técnico de cada fase (eso va en el design.md del change de segundo nivel correspondiente).

## Impact

- **`openspec/changes/`**: changes hijos `gateway-<faseid>-<slug>` creados de forma incremental.
- **`docs/`**: mantenimiento continuo tras cada fase (`README.md`, `docs/session-audit-model.md`, `docs/proposals/gateway-design.md`).
- **`sessions/`** (futuro, fases P): convergencia del layout a `causal-workflows-v1`.
- **Capas PKA implicadas por bloque:**
  - Bloque C (correlación Wire+Hooks, C1–C3): capas 2 (adapters/ports), 3 (handlers), 5 (HTTP delivery — nueva ruta `POST /hooks`).
  - Bloque G (refactor dominio **incluido el cierre E2E**): capas 1→2→3→4 en cadena; domain services de cierre en G1 (capa 1), lifecycle de cierre en G2 (capas 1+2), `AuditWorkflowClosureHandler` y proyección `WorkflowResult` en G4 (capas 2+3).
  - Bloque P (persistencia/layout): capa 1 (`IEventBus` port) + capa 2 (`EventBus`, `SessionPersistence`, correlador con emisión al bus) + disco `sessions/`.
