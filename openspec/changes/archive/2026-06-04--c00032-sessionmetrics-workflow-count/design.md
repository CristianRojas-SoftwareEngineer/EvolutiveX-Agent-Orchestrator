## Context

La Tabla 2 del statusline (`renderTokenTable`) muestra métricas de tokens agrupadas por nivel de razonamiento (Lite/Standard/Reasoning). Ya existe `# Steps` (hops de inferencia por modelo), pero no hay visibilidad de cuántos **workflows main completados** contribuyeron a cada nivel.

`SessionMetricsService.updateFromWorkflow()` se invoca exactamente una vez por workflow main cerrado (invariante G16). El archivo `session-metrics.json` es la fuente única de verdad del statusline. El campo `count` ya acumula steps; basta añadir `workflow_count` con la misma mecánica.

## Goals / Non-Goals

**Goals:**
- Añadir `workflow_count` a `IModelSessionMetrics` e `ISessionTotals`.
- Incrementar `workflow_count` en `updateFromWorkflow` sin cambiar su firma.
- Propagar `workflowCount` a través del pipeline del statusline hasta `renderTokenTable`.
- Mostrar columna `# Workflows` antes de `# Steps` en Tabla 2.
- Retrocompatibilidad: archivos sin `workflow_count` → coercionados a `0`.

**Non-Goals:**
- Contar sub-workflows (`kind: 'subagent'`).
- Cambiar la firma o semántica de `updateFromWorkflow`.
- Alterar otras tablas del statusline.
- Añadir persistencia adicional más allá de `session-metrics.json`.

## Decisions

### D1: Incremento interno en `updateFromWorkflow` sin cambiar firma

`updateFromWorkflow` ya es el único call site de actualización de métricas de sesión. En lugar de añadir un parámetro `isMain`, se incrementa `workflow_count` directamente dentro del cuerpo, dado que la función ya solo se llama para workflows main (invariante G16). Esto evita propagar el cambio a todos los call sites.

**Alternativa descartada**: añadir parámetro `kind` a `updateFromWorkflow` para filtrar explícitamente. Innecesario porque G16 ya garantiza que solo llegan workflows main.

### D2: `workflow_count` por modelo, `total_workflows` en `session_totals`

Se acumula por modelo (consistente con `count`/`input_tokens`/etc.) y se agrega en `session_totals` como `total_workflows`. El statusline agrega por nivel (Lite/Standard/Reasoning) sumando `workflowCount` de los modelos de cada nivel, igual que hace con `count`.

### D3: Retrocompatibilidad vía `coerceMetricNumber`

El statusline ya utiliza `coerceMetricNumber` para todos los campos numéricos leídos de `session-metrics.json`. Las sesiones antiguas sin `workflow_count` devolverán `0` automáticamente sin código adicional.

## Risks / Trade-offs

- **Desincronización `# Steps` vs `# Workflows`**: siempre debe cumplirse `steps ≥ workflows`. Si hay un bug que incremente `workflow_count` más de una vez por workflow, el invariante se rompe. Mitigación: test unitario que verifica `workflow_count === 1` tras una sola llamada y `=== 2` tras dos.
- **Sesiones en vuelo**: sesiones iniciadas antes del despliegue no tendrán `workflow_count` en modelos ya registrados; arrancarán desde `0`. Aceptable por coerción y porque el statusline se reinicia con cada sesión.
