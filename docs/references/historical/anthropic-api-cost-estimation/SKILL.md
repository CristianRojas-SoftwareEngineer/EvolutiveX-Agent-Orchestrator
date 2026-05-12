---
name: anthropic-api-cost-estimation
description: >-
  Estima costes en USD a partir del objeto usage de la API Messages de Anthropic, del archivo de configuración
  anthropic-model-pricing.json y de sesiones auditadas bajo sessions/. Cubre precios por MTok, prompt caching
  (entrada base, escritura 5m/1h, lectura de caché), ecuación por petición, modificador inference_geo, resolución
  de model y aliases, y agregación por sesión. Usar cuando el usuario pregunte por coste, facturación estimada,
  precio por tokens, usage, campos cache_*, inference_geo, USD/MTok, o coste total de una sesión Claude Code
  registrada por un proxy; también al distinguir POST /v1/messages de /v1/messages/count_tokens o al clasificar
  rutas para sumar costes. La jerarquía de carpetas interactions/, meta.json (TurnMetadata), archivos SSE y la matriz de presencia
  de archivos no se detallan aquí: para eso cargar la skill smart-code-proxy.
---

# Coste estimado API Anthropic (Messages + auditoría)

Instrucciones para **interpretar `usage`**, **resolver precios desde JSON** y **agregar costes** a partir de datos auditados. No sustituye la factura real de Anthropic.

En esta skill, **destino** en la sección siguiente significa: archivo bajo `references/`, o sección más abajo en este `SKILL.md`, u otra skill enlazada.

## Relación con otras skills

| Skill | Uso |
|-------|-----|
| **anthropic-api-cost-estimation** (esta) | API Anthropic Messages, `anthropic-model-pricing.json`, ecuación por categorías de caché, agregación sobre sesiones auditadas |
| **anthropic-api-protocol** | Referencia general del protocolo: estructura de requests/responses, eventos SSE, tipos de bloques, stop reasons |
| **smart-code-proxy** | Estructura de carpetas `sessions/` y archivos de auditoría del proxy (no OpenRouter) |
| **openrouter-api-cost-estimation** | OpenRouter Chat Completions, `ResponseUsage`, `usage.cost` (véase `docs/how-to-calculate-openrouter-api-costs.md` en el repo del proxy) |

## Propósito y límites

El resultado es una **estimación** útil para análisis y alertas. La factura puede diferir por redondeo, promociones, tarifas no reflejadas en el JSON, Batch API, Fast mode, herramientas con cargo fijo u otros modificadores no modelados con `usage` + tabla MTok.

Detalle (ruta de la skill): `${CLAUDE_SKILL_DIR}/references/scope-and-sources.md`

## Enrutamiento: pregunta o tarea → destino

| Pregunta o tarea | Destino |
|------------------|---------|
| Clasificar `count_tokens` vs generación | **Clasificación de rutas** (más abajo) y [`usage-and-billing-buckets.md`](references/usage-and-billing-buckets.md) |
| Campos `usage`, `cache_*`, buckets | [`usage-and-billing-buckets.md`](references/usage-and-billing-buckets.md) |
| JSON de precios, `model`, aliases | [`pricing-json-and-resolution.md`](references/pricing-json-and-resolution.md) |
| `inference_geo`, ecuación, carga de `tarifas` | [`equation-loading-and-geo.md`](references/equation-loading-and-geo.md) |
| Agregación por sesión, `usage` en disco (resumen) | [`example-and-aggregation.md`](references/example-and-aggregation.md) + skill **smart-code-proxy** |
| Límites (Batch, Fast, exclusiones) | [`scope-and-sources.md`](references/scope-and-sources.md) y **Propósito y límites** arriba |

**Matriz completa (Capa A y Capa B, mapa frente al doc del repo):** [`references/README.md`](references/README.md).

## Índice de archivos en `references/`

| Recurso | Contenido |
|---------|-----------|
| [`scope-and-sources.md`](references/scope-and-sources.md) | Alcance, fuentes oficiales vs JSON, qué queda fuera de la ecuación base |
| [`usage-and-billing-buckets.md`](references/usage-and-billing-buckets.md) | Dos niveles de «interacción», patrones Claude Code→API, campos `usage` |
| [`pricing-json-and-resolution.md`](references/pricing-json-and-resolution.md) | Esquema `anthropic-model-pricing.json`, mapeo ecuación↔JSON, resolución de `model` |
| [`equation-loading-and-geo.md`](references/equation-loading-and-geo.md) | Carga del JSON, modificador geo, ecuación §8 |
| [`example-and-aggregation.md`](references/example-and-aggregation.md) | Ejemplo numérico, dónde leer `usage` en disco (resumen), agregación por sesión |

La guía canónica en el repositorio del proxy es `docs/how-to-calculate-anthropic-api-costs.md`; mantenerla alineada con estos archivos: [`MAINTENANCE.md`](MAINTENANCE.md).

## Clasificación de rutas (antes de calcular)

1. **Normaliza la URL** de la petición: elimina query (`?beta=true`, etc.) antes de decidir.
2. Si el **path contiene el segmento `count_tokens`** → es conteo de tokens; con la política documentada actual, **no** aplica la ecuación de generación (coste de ese tipo de llamada **0** para el modelo descrito en la guía).
3. Si **no** es `count_tokens` y es un `POST` a Messages (generación) → localiza `usage` y aplica la ecuación.
4. **No** clasifiques solo con «la URL contiene `/v1/messages`»: la ruta `.../v1/messages/count_tokens` también contiene `messages`; por eso la regla segura es comprobar **`count_tokens` primero**.

## Composición con la skill de auditoría

Para saber **qué archivos existen** en `sessions/<session-id>/interactions/NNNNNN_<uuid>/`, campos de `meta.json` (`TurnMetadata`: `interactionType`, `steps[]`, `totals`, `turnOutcome`) y la matriz completa de presencia, usar la skill **`smart-code-proxy`** (`${CLAUDE_SKILL_DIR}` apunta a cada skill por separado). Esta skill cubre **semántica de coste** y ecuación; la otra, **estructura de auditoría**.

## Cuándo no aplicar la ecuación

Si hay error de upstream, `responseReceived` falso, ausencia de archivos de respuesta utilizables, o **`usage` no fiable o ausente**, no calcules coste con la ecuación estándar para esa petición.

## Seguridad

Los directorios `sessions/` pueden contener **API keys** en cabeceras y **contenido sensible** en cuerpos. No compartir esos artefactos públicamente ni repetir secretos en respuestas salvo petición explícita.
