## Context

El pipeline de `orchestrate-specification-delta` ejecuta las 10 etapas OpenSpec (`explore` → `create` → `propose` → `define` → `design` → `plan` → `apply` → `verify` → `synchronize` → `archive`) dentro de una única ventana de contexto. Para cambios de tamaño mediano o grande, el volumen acumulado de lecturas de codebase y artefactos supera el umbral de compactación antes de completar `apply` o `verify`, diluyendo la calidad del resultado final.

La solución introduce tres niveles de abstracción: (1) un agente orquestador nativo de Claude Code que encadena el pipeline completo, (2) cuatro subagentes de fase con contexto acotado y responsabilidad única, (3) los 10 skills de etapa individuales como unidad lógica mínima que cada subagente invoca internamente. Cada nivel se compone con el nivel inferior vía una herramienta distinta (Agent tool, Skill tool), lo que da independencia de contexto entre ellos.

El cambio es de carácter **no-canónico** — sólo afecta artefactos bajo `.claude/` (skills y agents) y el esquema del sentinel efímero. No hay cambios en `src/`, `scripting/`, `configs/hooks.json`, ni en `openspec/specs/`. `orchestrate-roadmap` no requiere cambios: sigue invocando `orchestrate-specification-delta` por fase; el encadenamiento interno de subagentes es transparente para él.

## Goals / Non-Goals

**Goals:**

- Eliminar la compactación mid-workflow distribuyendo el pipeline en 4 ventanas de contexto independientes.
- Mantener la separación de responsabilidades actual: cada skill de etapa sigue siendo una unidad lógica invocable con la herramienta `Skill`; ningún skill cambia su contrato.
- Permitir que `orchestrate-roadmap` siga invocando el orquestador por fase sin cambios.
- Hacer el briefing de cada fase compacto y trazable vía contrato JSON estable.
- Mantener el control de AUTO/GUIDED y el sentinel como invariantes del orquestador.

**Non-Goals:**

- No se introducen nuevas etapas OpenSpec; las 10 etapas existentes permanecen.
- No se cambia el orden del DAG (`proposal → specs → design → tasks`).
- No se modifican los 10 skills de etapa existentes (sólo el framing del skill `explore`).
- No se cambia `configs/hooks.json`; el backstop del sentinel es una mejora opcional que queda como follow-up.
- No se introducen nuevas dependencias externas; los subagentes usan las mismas herramientas que el orquestador ya usa (`Skill`, `Agent`, `Bash`).

## Decisions

### D1 — Subagentes con tipo dedicado en `.claude/agents/`

Cada uno de los 4 subagentes de fase se registra como `subagent_type` propio en `.claude/agents/`:

```
.claude/agents/
├── orchestrate-specification-delta.md        (orquestador; entry point)
├── explorer-specification-delta.md            (subagent_type: explorer-specification-delta)
├── planner-specification-delta.md             (subagent_type: planner-specification-delta)
├── implementer-specification-delta.md        (subagent_type: implementer-specification-delta)
└── closer-specification-delta.md              (subagent_type: closer-specification-delta)
```

Cada archivo de agente tiene frontmatter YAML con `name`, `description`, y `tools` declaradas. La invocación por parte del orquestador es `Agent(subagent_type="explorer-specification-delta", prompt=<briefing>)`.

**Convención de naming:** todos los nombres de archivo de agente siguen kebab-case en inglés, paralelo a los nombres de skill de etapa (que también son en inglés). El subagente `explorer-specification-delta` y el skill `explore-specification-delta` comparten slug por separado (harness los separa por directorio `.claude/agents/` vs `.claude/skills/`); el sustantivo `-er` en el subagente distingue explícitamente "agente que ejecuta la exploración" de "etapa de exploración".

**Por qué sobre la alternativa de un único `subagent_type: "claude"` con fase como parámetro del briefing:** la fase es semánticamente distinta en cada invocación (responsabilidad, skills cargados, artefactos producidos). Encapsularla en un tipo dedicado hace que el briefing sea más compacto, que el orquestador pueda inspeccionar el tipo sin parsear el prompt, y que cada subagente pueda tener su propio frontmatter con las herramientas exactas que necesita (ej. el Explorador no necesita `Edit` ni `Write` excepto para probes; el Cierre sí).

### D2 — Handoff con contrato JSON estable por fase

Cada subagente retorna al orquestador un JSON estructurado conforme a un esquema por fase:

```json
// Explorador
{ "report": "<markdown inline>", "slug": "<kebab-case>", "probes_cleaned": true }

// Planificador
{ "change": "c<NNNNN>-<slug>", "apply_ready": true, "artifacts": { "proposal": "done", "specs": "done", "design": "done", "tasks": "done" } }

// Implementador
{ "change": "c<NNNNN>-<slug>", "verify": "PASS", "critical_findings": 0 }

// Cierre
{ "change": "c<NNNNN>-<slug>", "archive_path": "openspec/changes/archive/<date>--<name>/", "commit": "<sha>" }
```

El esquema se documenta en el frontmatter de cada agente de fase. El orquestador valida la forma antes de delegar al siguiente subagente; si la validación falla, se detiene el pipeline y se reporta el desajuste.

**Por qué sobre texto libre:** el contrato implícito entre briefing y respuesta es frágil — el siguiente subagente puede interpretar distinto lo que el anterior retornó. Con JSON estable, el orquestador puede inspeccionar campos específicos, reusarlos en el briefing del siguiente subagente, y detectar desviaciones temprano. El costo (definir 4 esquemas) es fijo y pequeño.

### D3 — Ownership del sentinel por nivel: orquestador para `phase`, subagente para `stage`

En AUTO mode, el sentinel `openspec/.workbench/auto-pipeline.json` se mantiene actualizado a doble nivel, con ownership explícito:

**Nivel 1 — `phase` (ownership del orquestador):** el orquestador escribe el campo `phase` con el slug de la fase activa (fire-and-forget) justo antes de spawnear cada subagente. Valores válidos: `"explorer"`, `"planner"`, `"implementer"`, `"closer"`. El subagente nunca escribe el campo `phase`. El orquestador lo elimina (junto con el sentinel entero) en la fase `closer` como parte del freeze.

**Nivel 2 — `stage` (ownership del subagente de fase):** cada subagente de fase escribe el campo `stage` con el entero 1–10 correspondiente (fire-and-forget) justo antes de invocar el skill de etapa siguiente dentro de su fase. El orquestador nunca escribe el campo `stage`. El subagente no es responsable de limpiar el sentinel — eso le corresponde al orquestador al cierre.

```json
// Ejemplo durante la fase planner, antes de invocar propose (stage=3)
{
  "change": "c00080-refactor-orchestrate-multi-agent",
  "mode": "auto",
  "phase": "planner",
  "stage": "3",
  "startedAt": "2026-06-23T...",
  "stuckCount": 0
}
```

**Tracking de doble nivel:** `phase` identifica cuál de los 4 subagentes está activo (un valor cambia 4 veces por pipeline: explorer → planner → implementer → closer). `stage` identifica cuál de las 10 etapas de skill está activa dentro de la fase activa (cambia más veces: dentro del planner pasa por create=2, propose=3, define=4, design=5, plan=6). El hook determinístico puede leer ambos: `phase` para el bucle de alto nivel, `stage` para el progreso fino.

**Por qué esta distribución de ownership:**
- **Coherencia con la responsabilidad:** el orquestador es responsable de las transiciones de fase; el subagente es responsable de las transiciones de etapa dentro de su fase. Cada nivel de tracking lo mantiene quien tiene el contexto directo de la transición.
- **Encapsulación de fase:** el orquestador no necesita saber qué skill de etapa está corriendo dentro de la fase activa. El subagente es autónomo para su fase.
- **Diagnóstico útil ante fallos:** si un subagente falla, el sentinel muestra (a) qué subagente estaba activo vía `phase` y (b) qué skill estaba a punto de invocar vía `stage`. El lector deduce inmediatamente el punto de fallo.
- **Costo operacional:** ~4 escrituras del orquestador (1 por spawn) + ~10 escrituras del subagente (1 por invocación de skill) = ~14 escrituras por pipeline AUTO. Fire-and-forget evita latencia de checkpoint; el riesgo de desincronización se mitiga porque la escritura es atómica (write-to-tmp + rename) y el lector siempre ve el último valor estable.

**Por qué no todas las escrituras las hace el orquestador:** obligaría al orquestador a parsear el handoff de cada subagente o a recibir un evento explícito por etapa, rompiendo la encapsulación de fase. La distribución actual preserva el contrato JSON de handoff (4 esquemas estables por fase) sin filtrar detalles de etapa.

**Por qué no cada skill se actualiza a sí mismo:** contradice el principio de no tocar los 10 skills de etapa; cada skill añadiría una responsabilidad de tracking que no es la suya.

### D4 — El skill `explore-specification-delta` permanece sin cambios

El skill no se retira — sigue siendo la unidad lógica que describe la postura de exploración read-only, la sub-invocación opcional de `investigate`, y la escalada a `resolve-open-decisions`. Mantiene su descripción como etapa 1 de 10 del pipeline. El subagente Explorador lo carga tal cual y añade briefing, handoff y constraints del orquestador. El skill y el subagente se prompteam en distintos niveles de abstracción: el skill describe *qué es explorar*; el subagente añade el briefing (reporte del usuario, mode, handoff) y las constraints (cleanup, slug).

### D5 — El skill `orchestrate-specification-delta` se retira

Se elimina `.claude/skills/orchestrate-specification-delta/SKILL.md` y su entrada en la lista de skills. El orquestador deja de ser un slash command; el usuario invoca directamente al agente nativo `orchestrate-specification-delta` (la invocación exacta queda determinada por la convención del harness — TBD).

**Por qué:** el orquestador tiene una responsabilidad distinta (control flow, mode selection, sentinel, spawn de subagentes) que ya no encaja en el modelo de skill. Un agente nativo le permite definir herramientas disponibles, descripción de cuándo activarse, y frontmatter declarativo.

### D6 — Contratos de reporte consistentes en todo el pipeline

Para eliminar la divergencia anterior (el skill `explore` decía "Stage 1 of 10" mientras el resto de etapas no seguía un contrato explícito), el pipeline adopta tres plantillas de reporte con numeración doble estable (fase i/4 + etapa j/10):

**1. Reporte de skill de etapa (al iniciar y al finalizar):**
```
Etapa [j/10] <stage-slug>
```
Donde `j ∈ {1..10}` es el ordinal de la etapa en el pipeline lineal (`1`=explore, `2`=create, `3`=propose, ..., `10`=archive) y `<stage-slug>` es el nombre del skill sin extensión `.md` (ej. `Etapa [3/10] propose-specification-delta`).

**2. Reporte de subagente de fase (al iniciar y al finalizar):**
```
Fase [i/4] <phase-slug>
```
Donde `i ∈ {1..4}` es el ordinal de la fase (`1`=explorer, `2`=planner, `3`=implementer, `4`=closer) y `<phase-slug>` es el nombre del subagente sin la extensión `.md` (ej. `Fase [2/4] planner-specification-delta`).

**3. Output template del orquestador (en cada transición):**
```
## Specification-Delta Run: {{delta-name}}
**Modo:** {{AUTO | GUIDED}}
**Fase:** [{{i}}/4] {{phase-slug}}
**Etapa:** [{{j}}/10] {{stage-slug}}
{{stage-specific summary}}
**Siguiente:** {{next-stage or "completo"}}
```

Los slugs se derivan de los nombres de archivo en `.claude/agents/` y `.claude/skills/` (sin `.md`). Los placeholders se sustituyen en cada transición por el orquestador, no por los subagentes. El `<output_template>` actual del orquestador (que sólo mencionaba la etapa) se reemplaza por esta versión de doble línea.

**Por qué este contrato:**
- **Numeración estable y trazable:** el usuario puede decir "estamos en Fase 2/4 Etapa 4/10" sin ambigüedad.
- **Divergencia eliminada:** los 10 skills de etapa y los 4 subagentes de fase emiten reportes estructuralmente idénticos.
- **Mínimo cambio en skills:** el contrato se implementa en el orquestador (template) y en los subagentes (templates en su frontmatter); los 10 skills de etapa NO se modifican.

**Por qué no se introduce cambio de framing en `explore`:** la divergencia original proponía quitar "Stage 1 of 10" sólo de `explore`, dejando los otros 9 inconsistentes. La solución correcta es NO tocar el framing de los 10 skills — su descripción interna se mantiene; el contrato de reporte se aplica vía template externo invocado por el orquestador y subagentes.

## Risks / Trade-offs

- **Carga de skills de etapa en cada subagente** → cada subagente invoca 1–5 skills vía `Skill` tool, que carga el `SKILL.md` completo en contexto. Para el Planificador (5 skills) y el Implementador (2 skills), esto puede sumar 30–60 KB de instrucciones por invocación. **Mitigación:** los skills de etapa son cortos y comparten frontmatter; si el peso se vuelve problema, considerar una variante que embebe resúmenes en lugar de invocar `Skill` completo (futuro delta).

- **Pérdida de atomicidad del pipeline** → al dividir en 4 ventanas, los errores entre fases dejan al delta en un estado intermedio. **Mitigación:** el handoff JSON lleva un campo de estado explícito por fase; en GUIDED, el orquestador presenta el estado intermedio al usuario antes de continuar.

- **Mayor latencia por spawn de subagente** → cada spawn añade latencia de arranque (carga de contexto del subagente). **Mitigación:** los subagentes son ligeros (no heredan el contexto del orquestador); el costo es comparable al de un skill load.

- **Sentinel sin backstop implementado** → los campos `phase` y `stage` se documentan en el orquestador y los subagentes respectivamente, pero `configs/hooks.json` no tiene implementación de `decideAutoPipeline`. En la práctica, AUTO mode depende del orquestador para no ceder el turno; sin el hook, un fallo del orquestador podría ceder el control prematuramente. **Mitigación:** documentar el gap; dejar la implementación del backstop como delta follow-up; durante la implementación de este delta, AUTO mode funciona sólo por convención del orquestador.

## Migration Plan

1. **Crear los 5 archivos de agente** en `.claude/agents/` (1 orquestador + 4 subagentes).
2. **Actualizar `explore-specification-delta/SKILL.md`** (cambio de framing).
3. **Retirar `orchestrate-specification-delta/SKILL.md`** y verificar que ningún otro archivo lo referencia.
4. **Probar el pipeline** con un delta pequeño en modo GUIDED para validar el encadenamiento.
5. **Probar el pipeline** con un delta mediano en modo AUTO para validar el sentinel y el flujo sin pausas.
6. **Implementar el backstop determinístico** como delta separado (follow-up, fuera de scope aquí).

## Open Questions

- ¿Cómo invoca el usuario al agente nativo `orchestrate-specification-delta`? ¿Queda como slash command thin que delega al agente, o el usuario escribe una frase natural al asistente? Esto se resuelve cuando se implementen los archivos de agente en la fase `apply`.
- ¿El campo `phase` del sentinel debe enumerarse como un literal union (`"explorer" | "planner" | "implementer" | "closer"`) o como un string libre? La enumeración da validación temprana; el string libre da flexibilidad. Decisión recomendada: enumeración literal; se deja como follow-up si se quiere refinar. Independientemente de la enumeración, `phase` coexiste con `stage`; el lector del sentinel debe poder leer ambos sin asumir uno en función del otro.