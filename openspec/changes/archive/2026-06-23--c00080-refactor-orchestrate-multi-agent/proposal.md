## Why

El pipeline de `orchestrate-specification-delta` ejecuta las 10 etapas dentro de una única ventana de contexto. Para cambios de tamaño mediano o grande, el volumen acumulado de lecturas de codebase y artefactos supera el umbral de compactación antes de completar `apply` o `verify`, diluyendo la calidad del resultado final. La solución es introducir una capa de orquestación con tres niveles de abstracción: un agente orquestador nativo de Claude Code que encadena cuatro subagentes de fase, cada uno con contexto acotado y responsabilidad única; los skills de etapa individuales permanecen como la unidad lógica mínima que cada subagente invoca internamente. Así el orquestador nunca acumula el peso de las 10 etapas, y cada subagente sólo carga las etapas que le corresponden.

## What Changes

- **Agente orquestador nativo de Claude Code** (nuevo, en `.claude/agents/`): reemplaza el skill `orchestrate-specification-delta` actual. Mantiene el control de flujo y el modo AUTO/GUIDED, pero en lugar de invocar skills de etapa vía la herramienta `Skill` dentro del mismo contexto, encadena los 4 subagentes de fase vía la herramienta `Agent`.
- **Subagente `explorer-specification-delta`** (nuevo, en `.claude/agents/`): ejecuta la fase 1 de 4 (exploración). Carga el skill de etapa `explore-specification-delta` internamente y, opcionalmente, sub-invoca el skill `investigate` para exploración estructurada. Permiso excepcional: código de instrumentación temporal para contrastar alternativas. Invariante de cierre: `git status --short` debe estar vacío antes de retornar.
- **Subagente `planner-specification-delta`** (nuevo, en `.claude/agents/`): ejecuta la fase 2 de 4 (planificación). Carga los skills de las 5 etapas `create`, `propose`, `define`, `design` y `plan` internamente. Al terminar, los 4 artefactos de planificación están escritos en disco y el delta está `apply-ready`.
- **Subagente `implementer-specification-delta`** (nuevo, en `.claude/agents/`): ejecuta la fase 3 de 4 (implementación). Ejecuta el bucle `apply` → `verify` → `[apply si CRITICAL]` → `verify` hasta alcanzar `verify PASS`. Mantiene el bucle internamente porque es inherentemente iterativo.
- **Subagente `closer-specification-delta`** (nuevo, en `.claude/agents/`): ejecuta la fase 4 de 4 (cierre). Carga los skills de las 2 etapas `synchronize` y `archive` internamente. Emite el commit convencional y deja el worktree limpio.
- **Contratos de reporte consistentes en todo el pipeline** (no-cambio en los 10 skills de etapa, sino redefinición del template que invocan): cada skill de etapa reporta al usuario `Etapa [j/10] <stage-slug>` al iniciar y al finalizar; cada subagente de fase reporta `Fase [i/4] <phase-slug>` al iniciar y al finalizar; el orquestador emite el template unificado `Fase [i/4] <phase-slug> / Etapa [j/10] <stage-slug>` en cada transición. Esto elimina la divergencia anterior donde `explore` decía "Stage 1 of 10" y el resto mantenía la numeración inconsistente. El cambio aplica al `<output_template>` del orquestador y al template que cada subagente invoca en su handoff, no al contenido de los 10 skills de etapa.
- **Skill `explore-specification-delta/SKILL.md`** (sin cambios de framing): el skill mantiene su descripción actual como etapa 1 de 10 del pipeline. La unidad lógica que carga el subagente Explorador es el mismo skill sin modificación — el subagente sólo añade briefing, handoff y constraints del orquestador. El skill y el subagente se prompteam en distintos niveles de abstracción: el skill describe la postura de exploración; el subagente añade la fase como contexto y el handoff como contrato.
- **Sentinel AUTO** (esquema extendido + ownership por nivel): se añade el campo `phase` (valores: `"explorador"`, `"planificador"`, `"implementador"`, `"cierre"`) coexistente con el campo `stage` existente (valores 1–10). Ownership por nivel: el **orquestador** actualiza el campo `phase` antes de spawnear cada subagente (fire-and-forget); cada **subagente de fase** actualiza el campo `stage` justo antes de invocar cada skill de etapa (fire-and-forget). En AUTO el sentinel bloquea el turn del orquestador hasta que la fase `cierre` complete; en GUIDED no se escribe sentinel y las pausas entre subagentes son intencionales.

## Capabilities

### Non-canonical change

- `.claude/agents/orchestrate-specification-delta.md` (nuevo) — agente nativo de orquestación; sin contraparte canónica en `openspec/specs/`.
- `.claude/agents/explorer-specification-delta.md` (nuevo) — subagente de fase Explorador; sin contraparte canónica.
- `.claude/agents/planner-specification-delta.md` (nuevo) — subagente de fase Planificador; sin contraparte canónica.
- `.claude/agents/implementer-specification-delta.md` (nuevo) — subagente de fase Implementador; sin contraparte canónica.
- `.claude/agents/closer-specification-delta.md` (nuevo) — subagente de fase Cierre; sin contraparte canónica.
- `.claude/skills/explore-specification-delta/SKILL.md` (sin cambios de framing) — el skill mantiene su descripción; sin contraparte canónica.
- `.claude/skills/orchestrate-specification-delta/SKILL.md` (retirado) — reemplazado por el agente nativo; el archivo deja de ser el entry point.
- Formato del sentinel `openspec/.workbench/auto-pipeline.json` (esquema extendido: nuevo campo `phase` coexistiendo con `stage`) — artefacto efímero gitignoreado, descrito por el agente orquestador; sin requirement canónico.

## Impact

- `.claude/agents/` (nuevo directorio) — 5 archivos de agente nativos de Claude Code.
- `.claude/skills/explore-specification-delta/SKILL.md` — actualización de framing.
- `.claude/skills/orchestrate-specification-delta/SKILL.md` — se retira como entry point; las instrucciones migran al agente nativo.
- `openspec/.workbench/auto-pipeline.json` — esquema del sentinel se extiende con el campo `phase` (el campo `stage` existente se preserva).
- No hay cambios en `src/`, `scripting/`, `configs/hooks.json`, ni en `openspec/specs/`. `orchestrate-roadmap` no requiere cambios — sigue invocando `orchestrate-specification-delta` por fase; el encadenamiento interno de subagentes es transparente para él. Los 10 skills de etapa (`create`, `propose`, `define`, `design`, `plan`, `apply`, `verify`, `synchronize`, `archive`, además del ya mencionado `explore`) permanecen sin cambios estructurales.
