# Mantenimiento: documento del repo vs esta skill

## Fuentes de verdad

- **Contrato narrativo y ecuaciones:** el archivo `docs/how-to-calculate-anthropic-api-costs.md` en el repositorio **smart-code-proxy** y esta skill deben mantenerse **alineados** cuando cambie la política de coste o el esquema JSON.
- **Coeficientes USD/MTok:** el archivo versionado `config/anthropic-model-pricing.json` en el repo del proxy (u homólogo en otros proyectos). La skill **no** sustituye ese archivo.
- **`SKILL.md` — campo `paths`:** incluye `**/how-to-calculate-anthropic-api-costs.md` junto a `sessions/`, `anthropic-model-pricing.json` y `response.sse.jsonl` para activar la skill al abrir la guía o artefactos típicos en un workspace con el repo.

## Pares sensibles al sincronizar

| Cambio en el doc del repo | Revisar en la skill |
|---------------------------|---------------------|
| §1, notas de diseño, exclusiones de alcance | [`references/scope-and-sources.md`](references/scope-and-sources.md) |
| §2–4 (interacción, rutas, campos `usage`) | [`references/usage-and-billing-buckets.md`](references/usage-and-billing-buckets.md) |
| §5–6 (JSON de precios, resolución de `model`) | [`references/pricing-json-and-resolution.md`](references/pricing-json-and-resolution.md) |
| §7–8 (carga del JSON, `inference_geo`, ecuación §8, subsecciones 8.x, nombres `tarifas` / `coste_*`) | [`references/equation-loading-and-geo.md`](references/equation-loading-and-geo.md) |
| §9 (ejemplo, interpretación del total) | [`references/example-and-aggregation.md`](references/example-and-aggregation.md) |
| §10–11 (dónde mirar en disco, agregación), puentes con skills | [`references/example-and-aggregation.md`](references/example-and-aggregation.md) y [`SKILL.md`](SKILL.md) |
| §12 (seguridad) | [`references/example-and-aggregation.md`](references/example-and-aggregation.md) (resumen) y tono alineado con [`SKILL.md`](SKILL.md) (Seguridad) |
| §13 (skill) | [`SKILL.md`](SKILL.md) |

Si editas primero la skill, aplica el mismo criterio al revés: actualizar el markdown del repo para que siga siendo la referencia humana canónica.

## Estrategia recomendada

1. Editar primero `docs/how-to-calculate-anthropic-api-costs.md` si el cambio afecta al contrato documentado.
2. Actualizar los archivos en `${CLAUDE_SKILL_DIR}/references/*.md` y, si aplica, [`SKILL.md`](SKILL.md) y [`references/README.md`](references/README.md) (Capa A y Capa B).
3. El §13 del doc ya cita el nombre de esta skill (`anthropic-api-cost-estimation`) para descubrimiento humano.
4. Cambios acotados a la tabla **«Relación con otras skills»** en [`SKILL.md`](SKILL.md) no obligan por sí solos a reescribir todos los `references/*.md`.

## Checklist: enrutamiento (Capa A / Capa B) y referencias cruzadas

Al **añadir o renombrar** un archivo en `references/`:

1. Actualizar **Capa A** y **Capa B** en [`references/README.md`](references/README.md).
2. Actualizar la sección **Enrutamiento: pregunta o tarea → destino** y el **Índice de archivos** en [`SKILL.md`](SKILL.md) si cambian intenciones o archivos.

Al **renombrar o eliminar** secciones de [`SKILL.md`](SKILL.md):

- Buscar menciones en [`references/README.md`](references/README.md), en `docs/how-to-calculate-anthropic-api-costs.md` del repo y en cualquier § que cite títulos de subsecciones de la skill.

## Plantilla estable (skills en `~/.claude/skills/`)

Convención compartida: **Capa A** (intención → destino) + **Capa B** (doc ↔ archivos) en `references/README.md`, y un único H2 **Enrutamiento: pregunta o tarea → destino** en `SKILL.md`. Si añades un checklist similar en la skill **create-skill** de Cursor (`.cursor/skills-cursor/`) y una actualización del producto lo borra, este archivo puede servir de ancla.

## Skill relacionada

- **smart-code-proxy:** estructura de auditoría en `sessions/`; sin ella, la navegación a `usage` en disco es incompleta.
