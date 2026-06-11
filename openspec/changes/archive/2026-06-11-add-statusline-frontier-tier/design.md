## Context

El statusline (`scripting/router-status.ts`) agrega `session-metrics.json` por `modelId` en cuatro buckets internos (`lite`, `standard`, `reasoning`; próximo `frontier`). La clasificación lee `~/.claude/settings.json → env` — misma fuente que `configure-provider` escribe desde `routing/providers/<name>/config.json`.

Hoy:

```
ReasoningLevel = 'lite' | 'standard' | 'reasoning'
Orden classify: haiku → opus → sonnet
Colores Tabla 2: gris → blanco → blanco bold
MANAGED_ENV_VARS: 3 modelos + subagent
anthropic/config.json: haiku, sonnet, opus (sin fable)
```

Claude Code documenta `ANTHROPIC_DEFAULT_FABLE_MODEL` para el alias `fable` (`claude-fable-5`). El proxy no requiere cambios en el gateway: los `modelId` ya llegan en métricas si el usuario selecciona Fable.

Referencias: [`docs/router-statusline.md`](../../../docs/router-statusline.md) §5, skill `claude-code-model-config`, spec `statusline-runtime`.

## Goals / Non-Goals

**Goals:**

- Cuarta fila **Frontier** siempre visible en Tabla 2 con métricas de Fable 5.
- Paridad de configuración: `configure-provider anthropic` escribe `ANTHROPIC_DEFAULT_FABLE_MODEL`.
- Paleta ANSI que escala con el costo percibido del tier.
- Change cohesivo: runtime + provider-config + catálogo anthropic + docs + tests en un solo diff.

**Non-Goals:**

- Mythos 5, keywords `mythos`, ni variable `ANTHROPIC_DEFAULT_MYTHOS_MODEL`.
- Cambios en `src/1-domain` o escritura de métricas.
- Nuevos providers con Fable fuera de anthropic.

## Decisions

### 1. Clave interna `frontier`, etiqueta UI `Frontier`

- **Decisión:** tipo `ReasoningLevel` gana `'frontier'`; columna Nivel muestra `Frontier`.
- **Rationale:** desacopla la etiqueta de producto del alias Claude (`fable`) y deja espacio para Mythos en el mismo bucket más adelante.
- **Alternativa descartada:** usar `fable` como clave interna — acopla el código al alias actual.

### 2. Orden de evaluación en `classifyModelWithEnv`

```
haiku  → lite
fable  → frontier   (ANTHROPIC_DEFAULT_FABLE_MODEL o keyword "fable" si var vacía)
opus   → reasoning
sonnet → standard
null
```

- **Rationale:** Fable se evalúa antes que opus/sonnet; `claude-fable-5` no colisiona con keywords existentes. Mythos queda fuera hasta decisión explícita futura.
- **Fallback:** solo substring `"fable"` cuando `ANTHROPIC_DEFAULT_FABLE_MODEL` está vacía/ausente (mismo patrón per-level que haiku/sonnet/opus).

### 3. Cuatro filas fijas en Tabla 2

- **Decisión:** `renderTokenTable` itera `[lite, standard, reasoning, frontier]`; filas en cero igual que hoy.
- **Rationale:** coherencia con contrato actual de tres filas siempre visibles.

### 4. Paleta ANSI reescalada

| Tier | Antes | Después |
|------|-------|---------|
| Lite | `\x1B[90m` gris | `\x1B[90m` gris (sin cambio) |
| Standard | `\x1B[37m` blanco | `\x1B[90m` gris |
| Reasoning | `\x1B[1;37m` bold | `\x1B[37m` blanco |
| Frontier | — | `\x1B[1;37m` blanco bold |
| Totales | bold | bold (sin cambio) |

- **Rationale:** gradiente visual monótono hacia el tier más costoso; Frontier hereda el énfasis que antes tenía Reasoning.

### 5. Extensión de `provider-config` (no nuevo script)

- **Decisión:** añadir `ANTHROPIC_DEFAULT_FABLE_MODEL` a `ProviderConfig`, `MANAGED_ENV_VARS` (después de OPUS, antes de `CLAUDE_CODE_SUBAGENT_MODEL`), `applyConfig` / `showCurrentState` vía loop existente.
- **anthropic/config.json:** `"ANTHROPIC_DEFAULT_FABLE_MODEL": "models/claude-fable-5"` siguiendo convención de rutas relativas del provider (como sonnet/opus).
- **Catálogo:** `routing/providers/anthropic/models/claude-fable-5/metadata.json` con `modelId: "claude-fable-5"`, `displayName: "Fable 5"`.
- **Alternativa descartada:** capability separada solo en docs sin spec — se formaliza en `provider-env-config`.

### 6. Caché y totales

- `metricsSnapshot` y estructuras internas incluyen `frontier`.
- **`# Steps` en fila Totales** ← `session_totals.billable_hops` (sin cambio).
- **`# Workflows` en fila Totales** ← suma de `finalized_runs` de las cuatro filas (`lite + standard + reasoning + frontier`) en `aggregateSessionMetrics`, para consistencia interna de la tabla (comportamiento actual en código y [`session-metrics-system.md`](../../../docs/session-metrics-system.md)).
- `session_totals.finalized_runs` sigue siendo el contador estructural en disco; puede diferir de la suma de filas si hay workflows sin modelo atribuido.
- Helpers `cellColor` y `totalColor` extienden el union type / loop a `frontier`.
- Escenario de `lastRenderedTable2Output`: **7 líneas** de contenido (cabecera, 4 filas, separador, totales) en lugar de 6.

### 7. Headless harness

- `buildIsolatedProviderEnv` propaga todas las claves de `MANAGED_ENV_VARS` desde config; al extender la lista, Fable se incluye automáticamente en el loop de `claudeEnv`. Revisar `proxyEnv` hardcodeado en rama `default` — fuera de alcance salvo que tests headless fallen.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Usuarios con `configure-provider anthropic` previo sin re-ejecutar | Documentar re-run; OAuth puro sigue clasificando Fable por keyword `fable` |
| Tabla 2 más alta (4 filas) en terminales pequeñas | Misma opt-in `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS`; ancho elástico existente |
| `modelId` de terceros sin substring `fable` | Requiere `ANTHROPIC_DEFAULT_FABLE_MODEL` pinneado — mismo patrón que opus en Bedrock |
| Mythos futuro en mismo tier | Diseño reserva `frontier`; integración posterior añadirá keyword/regla sin nueva fila |

## Migration Plan

1. Implementar y mergear change.
2. Usuarios de provider anthropic: `npm run configure-provider -- anthropic` (o comando equivalente del repo) para escribir `ANTHROPIC_DEFAULT_FABLE_MODEL`.
3. Sin migración de `session-metrics.json` ni `.statusline-state.json`; caché antigua sin campo `frontier` se regenera en el próximo render completo.
4. Rollback: revertir commit; filas Frontier desaparecen; métricas Fable vuelven a `null` (comportamiento previo).

## Open Questions

_(ninguna — decisiones de producto cerradas en la conversación de exploración)_
