## Why

Claude Code incorporó **Claude Fable 5** como tier de razonamiento superior a Opus (`ANTHROPIC_DEFAULT_FABLE_MODEL`, alias `fable`). El statusline de Smart Code Proxy clasifica métricas de sesión en tres niveles fijos (Lite / Standard / Reasoning) mapeados a haiku, sonnet y opus. El consumo en Fable 5 queda **fuera de Tabla 2** (`classifyModelWithEnv` retorna `null`), lo que oculta el tier más costoso en sesiones que usan el modelo frontera.

Además, `configure-provider` y el catálogo del provider `anthropic` no propagan `ANTHROPIC_DEFAULT_FABLE_MODEL` a `settings.json`, rompiendo la paridad con las variables de los otros tres niveles.

## What Changes

- Añadir el cuarto nivel de razonamiento **Frontier** en Tabla 2 (fila fija, siempre visible), mapeado a Fable 5 vía `ANTHROPIC_DEFAULT_FABLE_MODEL` y fallback heurístico por substring `"fable"`.
- Extender `classifyModelWithEnv`, agregación, render, caché `.statusline-state.json` y paleta ANSI: **Frontier** pasa a ser blanco bold; Lite / Standard / Reasoning se reescalan en grises/blanco para destacar progresivamente los tiers más costosos.
- Extender `MANAGED_ENV_VARS`, `ProviderConfig`, `configure-provider` y `routing/providers/anthropic/config.json` con `ANTHROPIC_DEFAULT_FABLE_MODEL` y metadata del modelo en catálogo.
- Actualizar documentación humana (`docs/router-statusline.md`, `docs/session-metrics-system.md`) y skill `statusline-system`.
- Añadir tests de clasificación, agregación y output para el cuarto nivel.

## Capabilities

### New Capabilities

- `provider-env-config`: contrato de variables `ANTHROPIC_DEFAULT_*` gestionadas por `configure-provider`, incluyendo Fable 5 en provider `anthropic`.

### Modified Capabilities

- `statusline-runtime`: Tabla 2 con cuatro filas de nivel; clasificación Frontier; paleta de colores por tier; caché; semántica de totales alineada con código y docs.
- `gateway-session-metrics`: nota cruzada en `finalized_runs` estructural — cuatro niveles en suma de filas del statusline.

## Impact

| Área | Detalle |
|------|---------|
| **scripting** | `router-status.ts`, `shared/provider-config.ts`, `configure-provider.ts`, `headless-session/provider-env.ts` (paridad `MANAGED_ENV_VARS`) |
| **routing** | `routing/providers/anthropic/config.json`, `models/claude-fable-5/metadata.json` |
| **Tests** | `router-status-classify.test.ts`, `router-status-metrics.test.ts`, `router-status-output.test.ts`; tests de `provider-config` si existen |
| **Docs** | `docs/router-statusline.md` §3.2, §5; `docs/session-metrics-system.md` |
| **Skills** | `.claude/skills/statusline-system/SKILL.md` |
| **PKA dominio** | Sin cambios en gateway ni `session-metrics.json` — la clasificación es en lectura del statusline |
| **Sesiones en disco** | Sin migración; métricas Fable existentes pasan a sumarse en Frontier tras deploy |

## No objetivos

- Integrar **Claude Mythos 5** (no público aún); se reservará el mismo tier Frontier en una iteración posterior.
- Cambiar semántica de `# Steps` / `# Workflows` ni el schema de `session-metrics.json`.
- Modificar layout de Tabla 1 o Tabla 3.
- Añadir Fable 5 a providers distintos de `anthropic` en este change (solo anthropic tiene el modelo en catálogo hoy).
- Forzar `model: fable` en settings de usuario; solo se configura el default del provider vía `configure-provider anthropic`.
