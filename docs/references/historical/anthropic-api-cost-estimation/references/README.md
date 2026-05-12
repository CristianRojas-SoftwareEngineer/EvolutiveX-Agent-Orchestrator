# Referencias de la skill `anthropic-api-cost-estimation`

Cada archivo resume bloques de la guía canónica del proxy: **`docs/how-to-calculate-anthropic-api-costs.md`** en el repositorio **smart-code-proxy** (misma semántica; el doc del repo es la referencia humana principal).

En las tablas de **Capa B**, el símbolo **§** se refiere a secciones de ese documento del repo, no a apartados de este README.

### Capa A — Enrutamiento por intención

| Pregunta o tarea | Destino (leer primero) |
|------------------|-------------------------|
| Clasificar `count_tokens` vs generación, normalizar URL | [`SKILL.md`](../SKILL.md) (**Clasificación de rutas**) y [`usage-and-billing-buckets.md`](usage-and-billing-buckets.md) |
| Campos de `usage`, caché (`cache_*`), buckets de facturación | [`usage-and-billing-buckets.md`](usage-and-billing-buckets.md) |
| Esquema `anthropic-model-pricing.json`, resolución de `model` / aliases | [`pricing-json-and-resolution.md`](pricing-json-and-resolution.md) |
| Carga del JSON, `inference_geo`, ecuación con `tarifas` | [`equation-loading-and-geo.md`](equation-loading-and-geo.md) |
| Ejemplo numérico, agregación por sesión, dónde está `usage` en disco (resumen) | [`example-and-aggregation.md`](example-and-aggregation.md); estructura de `sessions/` → skill **smart-code-proxy** |
| Límites (Batch, Fast, exclusiones); qué queda fuera de la ecuación base | [`scope-and-sources.md`](scope-and-sources.md) y **Propósito y límites** en [`SKILL.md`](../SKILL.md) |
| Alinear doc del repo con esta skill al editar | [`MAINTENANCE.md`](../MAINTENANCE.md) y **Capa B** (tabla siguiente) |

### Capa B — Mapa guía canónica ↔ archivos

| Archivo en `references/` | Secciones aproximadas del doc | Contenido breve |
|--------------------------|-------------------------------|-----------------|
| `scope-and-sources.md` | §1, notas de diseño | Alcance, enlaces oficiales, exclusiones (Batch, Fast, …) |
| `usage-and-billing-buckets.md` | §2–4 | Interacción auditoría vs coste, rutas API, tabla de campos `usage` |
| `pricing-json-and-resolution.md` | §5–6 | MTok, esquema JSON, resolución `model` / `aliases` |
| `equation-loading-and-geo.md` | §7–8 | Carga del JSON, `inference_geo`, ecuación con `tarifas` |
| `example-and-aggregation.md` | §9–12 | Ejemplo numérico, dónde está `usage` en disco (resumen), agregación, seguridad |

**§13** (Misma guía en Claude Code): descubrimiento de la skill y mantenimiento en [`SKILL.md`](../SKILL.md) y en el doc del repo; el contenido de §13 **no** se duplica en `example-and-aggregation.md`.

**Orden de lectura sugerido:** enrutamiento rápido en [`SKILL.md`](../SKILL.md), sección **Enrutamiento: pregunta o tarea → destino**; matriz completa Capa A + Capa B en este archivo.
