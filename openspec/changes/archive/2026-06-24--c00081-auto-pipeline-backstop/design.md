## Context

El orquestador multiagente `orchestrate-specification-delta` (`.claude/agents/`) opera en
dos modos: GUIDED (interactivo) y AUTO (un solo turno). En AUTO, el orquestador spawna
cuatro subagentes de fase en secuencia y no debe ceder el turno entre fases. El harness
de Claude Code soporta hooks `Stop` y `SubagentStop` que pueden bloquear o permitir la
cesión mediante `{ "decision": "block", "reason": "..." }` en stdout.

El repo hermano Workbench (commit 32c22d2) tiene un backstop funcional con un sentinel de
un solo nivel (`stage` escalar + `lastBlockedStage`). El refactor multiagente c00080
elevó el sentinel a doble nivel: `phase` (dueño: orquestador) + `stage` (dueño:
subagente activo) + nuevo campo `lastProgressKey` (formato `"phase#stage"`).
El script de Workbench no puede portarse directamente: su loop-guard compara
`lastBlockedStage === stage`, pero aquí la señal de progreso debe contemplar
ambas dimensiones del sentinel.

**Estado actual**: `configs/hooks.json` array `Stop` invoca solo `post-hook-event.ts`
(logger genérico, sin lógica de decisión). Gap documentado como "Backstop gap" y
referenciado en el agente orquestador como follow-up pendiente.

## Goals / Non-Goals

**Goals:**

- Portar `enforce-auto-pipeline.mts` de Workbench a este repo, adaptando el sentinel de doble nivel.
- Que el hook `Stop` bloquee la cesión prematura del orquestador durante pipelines AUTO,
  con loop-guard y halt diagnóstico diferenciado.
- Documentar el contrato del campo `lastProgressKey` en los agentes de este repo.
- Añadir `openspec/.workbench/` al `.gitignore` (estado de sesión efímero).

**Non-Goals:**

- Cambiar el sentinel de Workbench ni su lógica de un nivel.
- Enforcement a nivel de subagentes (el backstop es exclusivo del orquestador).
- Migración del patrón de hooks a otra herramienta de orquestación.
- Agregar lógica de decisión a `SubagentStop`.

## Decisions

### D1 — Punto de enforcement: solo el hook `Stop` del orquestador

**Decisión:** El backstop se registra exclusivamente en el array `Stop` de
`configs/hooks.json`. El array `SubagentStop` no se modifica.

**Razón:** Los cuatro subagentes de fase (explorer, planner, implementer, closer) deben
terminar y devolver el control al orquestador; disparan `SubagentStop` cuatro veces por
pipeline. Bloquearlos deadlockearía las cesiones legítimas internas. Solo el `Stop` del
orquestador señala el fin potencialmente prematuro del pipeline completo.

**Alternativa descartada:** Registrar en `SubagentStop` también — descartada porque
rompería la arquitectura de subagentes (los subagentes deben poder terminar para que el
orquestador continúe con la siguiente fase).

### D2 — Señal de progreso del loop-guard: clave compuesta `phase#stage`

**Decisión:** El campo `lastProgressKey` del sentinel almacena `"phase#stage"`.
El loop-guard considera progreso si cambió `phase` O `stage` entre dos invocaciones del
hook `Stop`; `stuckCount` se reinicia si cualquiera de los dos componentes avanzó, y
solo crece si AMBOS quedaron congelados.

**Razón:** El scalar `lastBlockedStage` de Workbench es insuficiente para el doble
nivel: el orquestador puede quedar congelado entre fases (mismo `stage`, `phase` distinto)
o dentro de una fase (mismo `phase`, mismo `stage`). La clave compuesta cubre ambos ejes.

**Alternativa descartada:** Mantener `lastBlockedStage` como escalar y comparar solo
`stage` — descartada porque pierde el eje de progreso de `phase`, generando falsos
positivos de congelamiento al transicionar entre fases.

### D3 — Cadencia de enforcement: grano de fase

**Decisión:** El backstop opera en fronteras de fase. Mientras un subagente corre, el
orquestador está suspendido, no detenido; el hook `Stop` no se dispara durante la
ejecución de un subagente. El campo `stage` cumple rol de diagnóstico fino y componente
del loop-guard, no habilita intervención a mitad de fase.

**Razón:** La granularidad natural del orquestador es la fase. Intervenir a nivel de stage
requeriría un mecanismo distinto, que está fuera del scope de este delta.

### D4 — Halt con causa diferenciada

**Decisión:** El campo `reason` del halt JSON diferencia la causa de terminación:
- El loop-guard escribe `{ reason: "loop-guard", releasedAt, phase, stage }`.
- El orquestador puede escribir cualquier otro valor al ceder voluntariamente
  (p. ej. `"design-decision"`).
- El hook `Stop` solo escribe `reason: "loop-guard"` (rama d); no interpreta ni
  sobreescribe otros valores de `reason`.

**Razón:** La telemetría de por qué terminó un run AUTO es valiosa para debugging. Sin
diferenciación, no es posible distinguir un atasco real de una cesión controlada.

### D5 — `lastProgressKey` como campo de contrato documentado del sentinel

**Decisión:** `lastProgressKey` es un campo de primer nivel en el schema del sentinel,
con ownership explícito: el subagente activo lo escribe ATÓMICAMENTE junto con `stage`
(write-to-tmp + rename al sentinel). El orquestador NO escribe `lastProgressKey`.

**Razón:** Si `lastProgressKey` fuera opaco (campo interno del hook), el orquestador o
cualquier agente podría sobreescribirlo accidentalmente al actualizar `phase`. Definirlo
como campo de contrato con dueño claro elimina la ambigüedad.

**Alternativa descartada:** Derivar `lastProgressKey` en el hook leyendo `phase` y
`stage` del sentinel en la evaluación — descartada porque requeriría leer el sentinel
dos veces, complicando el modelo de consistencia.

## Estructura del script `enforce-auto-pipeline.mts`

El script espeja el patrón de `scripting/hooks/post-hook-event.ts` y el de
`enforce-auto-pipeline.mts` de Workbench.

Interfaces exportadas:
- `AutoPipelineSentinel`: `{ change, mode, phase, stage, lastProgressKey, startedAt, stuckCount }`
- `StopHookPayload`: `{ stop_hook_active?, cwd? }`
- `DecisionInput`: `{ sentinel, haltPresent, isArchived, stopHookActive, threshold }`
- `DecisionEffect`: `'none' | 'deleteSentinel' | 'writeHalt' | 'persistSentinel'`
- `Decision`: `{ block, reason?, effect, nextSentinel? }`

Constante exportada: `DEFAULT_LOOP_GUARD_THRESHOLD = 3`

Función pura exportada: `decideAutoPipeline(input: DecisionInput): Decision`
- Cinco ramas (a) a (e) en orden estricto
- Rama (d) compara `lastProgressKey === "phase#stage"`

Envoltorio con efectos: `applyEffect(root, decision)`
- `deleteSentinel | writeHalt` (con `phase` y `stage`) `| persistSentinel` (atómico tmp+rename)

Entrypoint: `main()` con try/catch externo (nunca bloquea por error interno)

Guard: ejecuta `main()` solo como entrypoint (no al importar desde tests)

**Diferencias clave respecto al original de Workbench:**

| Aspecto | Workbench | Este repo |
|---|---|---|
| Sentinel | `{ stage: string, lastBlockedStage? }` | `{ phase, stage: number, lastProgressKey }` |
| Loop-guard key | `lastBlockedStage === stage` | `lastProgressKey === "phase#stage"` |
| Halt payload | `{ reason, releasedAt }` | `{ reason, releasedAt, phase, stage }` |
| Persistencia | `lastBlockedStage = stage` | `lastProgressKey = "phase#stage"` |

## Esquema del sentinel (contrato)

Campos y dueños:
- `change`: string — dueño: orquestador
- `mode`: `"auto"` — dueño: orquestador
- `phase`: string — dueño: orquestador (escribe antes de cada spawn de subagente)
- `stage`: number — dueño: subagente activo (atómico con `lastProgressKey`)
- `lastProgressKey`: string — dueño: subagente activo (`"phase#stage"`)
- `startedAt`: string — dueño: orquestador
- `stuckCount`: number — dueño: hook `Stop` (ramas d/e)

## Integración con `configs/hooks.json`

El array `Stop` recibe una segunda entrada (el logger existente permanece).
El nuevo hook invoca `enforce-auto-pipeline.mts` con el mismo patrón
`npx --prefix ROOT tsx RUTA` que las demás entradas.

El array `SubagentStop` no se modifica.

## Risks / Trade-offs

- [Cold-start de tsx] Cada invocación de `Stop` agrega aprox. 200–500 ms de latencia de
  arranque de tsx. Mitigación: en sesiones GUIDED o sin sentinel, la rama (a) sale
  inmediatamente tras leer el filesystem; el costo solo es apreciable en AUTO.

- [Ventana de inconsistencia del sentinel] Si el subagente escribe `stage` pero falla
  antes de completar el rename de `lastProgressKey`, el hook puede leer un sentinel con
  `lastProgressKey` desactualizado. Mitigación: la escritura atómica (write-to-tmp +
  rename) minimiza la ventana; si hay inconsistencia, el loop-guard la trata como
  congelamiento y eventualmente libera con halt.

- [Halt no borra el sentinel] El halt solo escribe `auto-pipeline.halt.json`; el
  sentinel `auto-pipeline.json` permanece. Intencional para telemetría, pero requiere
  limpieza manual o por el closer subagent en el próximo run.

## Migration Plan

No hay comportamiento previo que migrar (el array `Stop` no tenía lógica de decisión).
La incorporación es aditiva:

1. Crear `scripting/openspec/enforce-auto-pipeline.mts`.
2. Crear suite de tests `tests/scripting/openspec/enforce-auto-pipeline.test.ts`.
3. Editar `configs/hooks.json` (entrada aditiva en array `Stop`).
4. Editar `.gitignore` (añadir `openspec/.workbench/`).
5. Editar agentes: `orchestrate-specification-delta.md` y subagentes de fase.
6. Crear `openspec/specs/pipeline-auto-continuation/spec.md` vía `synchronize`.

**Rollback**: eliminar la segunda entrada del array `Stop` en `configs/hooks.json`.
El resto de los cambios son no-regresivos (docs, .gitignore, spec canónica).

## Open Questions

_(ninguna — todas las decisiones fueron resueltas en la exploración; D1–D5 registradas arriba)_
