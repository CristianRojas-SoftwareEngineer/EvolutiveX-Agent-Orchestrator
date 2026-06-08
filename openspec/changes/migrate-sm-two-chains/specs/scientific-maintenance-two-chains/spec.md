## ADDED Requirements

### Requirement: Sistema de dos cadenas con 16 fases

El sistema de mantenimiento científico SHALL implementar exactamente 16 fases ejecutables, numeradas en el rango 01..18 (09 y 10 vacantes), distribuidas en tres cadenas especializadas: cadena de causa (fases 01–08), cadena de solución (fases 11–16) y cierre global (fases 17–18). La cadena de solución SHALL open only after fase 08 emits `## Causa confirmada` in `08-analysis.md`.

#### Scenario: Cadena de solución abre tras causa confirmada
- **WHEN** fase 08 emits `## Causa confirmada` in `08-analysis.md`
- **THEN** the orchestrator SHALL invoke fase 11 (`sm-phase-solution-research`)

#### Scenario: Cadena de solución NO abre tras causa no confirmada
- **WHEN** fase 08 does NOT emit `## Causa confirmada` in `08-analysis.md`
- **THEN** the orchestrator SHALL route directly to fase 17 without invoking fases 11–16

### Requirement: Tres bucles ortogonales

El sistema SHALL implementar exactamente tres bucles, ortogonales entre sí. Bucle A (Refutación interna de causa): trigger = fase 08 refuta hipótesis; acción = marcar artefactos 04–08 como superseded y re-ejecutar fase 04 con siguiente candidata pending; agotamiento = candidatas pending agotadas → disparador C1. Bucle B (Batch comparativo de solución): trigger = fase 16 no emite `## Solución ganadora`; acción = marcar artefactos 13–16 como superseded, preservar 11 y 12, re-ejecutar fase 12 con nuevas candidatas; agotamiento = candidatas pending agotadas → disparador C2. Bucle C (Re-apertura post-pausa): trigger = fase 17 emite ruta (c) por C1, C2 o C3; acción = fijar case.status: pausado y case_paused_at; re-apertura = incrementar case_run, fijar case_resumed_at, re-ejecutar 03–08 con nuevo contexto.

#### Scenario: Bucle A refuta hipótesis y re-ingresa a fase 04
- **WHEN** fase 08 emits `## Causa refutada` and `04-hypothesis.md` contains candidates with `status: pending`
- **THEN** the orchestrator SHALL mark artefactos 04–08 as `superseded` and re-invoke fase 04 with the next `pending` candidate

#### Scenario: Bucle A agota candidatas sin causa confirmada
- **WHEN** Bucle A iterates all candidates and none reach `## Causa confirmada`
- **THEN** fase 17 SHALL emit route **(c)** with `pause_reason: candidatas_agotadas` and trigger **C1**

#### Scenario: Bucle B no encuentra ganadora y re-ingresa a fase 12
- **WHEN** fase 16 does NOT emit `## Solución ganadora` and `11-solution-research.md` contains candidates with `status: pending` not yet formulated
- **THEN** the orchestrator SHALL mark artefactos 13–16 as `superseded` and re-invoke fase 12 to append new hypotheses

#### Scenario: Bucle B agota candidatas de solución sin ganadora
- **WHEN** Bucle B exhausts all `pending` candidates in map 11 without a winner in fase 16
- **THEN** fase 17 SHALL emit route **(c)** with `pause_reason: candidatas_agotadas` and trigger **C2**

#### Scenario: Fase 11 no encuentra ≥2 soluciones viables
- **WHEN** fase 11 validation fails (less than 2 viable candidates enumerated)
- **THEN** the orchestrator SHALL set solution chain state to `parcial_11` and route to fase 17 route **(c)** with `pause_reason: no_viable_solution_space` (trigger **C3**)

#### Scenario: Re-apertura Bucle C re-ejecuta 03–08
- **WHEN** the user accepts re-opening and `case_run` is incremented
- **THEN** the orchestrator SHALL re-invoke fase 03 with new context, preserving 01–02, and if cause is confirmed, the solution chain opens in the incremented `case_run`

### Requirement: Veredicto de cierre en fase 17

La fase 17 SHALL emitir exactamente una de tres rutas terminales por corrida: ruta (a) — cierre con spec (estado completa_12-16, fase 16 tiene `## Solución ganadora`, integration_mode ≠ Solo-SM → spec validada; case.status: done); ruta (b) — cierre investigativo Solo-SM (integration_mode: Solo-SM, estado completa_12-16, fase 16 tiene `## Solución ganadora` → sin spec; case.status: done); ruta (c) — pausa (no_abierta, parcial_11, o completa_12-16 sin ganadora → case.status: pausado; oferta Bucle C en fase 18). El orden de evaluación SHALL ser sin solapamiento: 1) no_abierta → (c) (C1); 2) parcial_11 → (c) (C3), sin consultar fase 16; 3) completa_12-16 sin `## Solución ganadora` → (c) (C2); 4) integration_mode: Solo-SM + `## Solución ganadora` → (b); 5) cualquier otro caso con `## Solución ganadora` → (a).

#### Scenario: Ruta (a) — cierre con spec en modo Completo
- **WHEN** solution chain state is `completa_12-16`, fase 16 has `## Solución ganadora`, and `integration_mode` is `Completo`
- **THEN** fase 17 SHALL emit spec validada, set `case.status: done`, and trigger Etapa B OpenSpec

#### Scenario: Ruta (b) — cierre investigativo Solo-SM
- **WHEN** `integration_mode` is `Solo-SM`, solution chain state is `completa_12-16`, and fase 16 has `## Solución ganadora`
- **THEN** fase 17 SHALL cite the winning solution from fase 16, write lesson, set `case.status: done`, and SHAL NOT emit spec or trigger Etapa B

#### Scenario: Ruta (c) — pausa por causa no confirmada
- **WHEN** solution chain state is `no_abierta` (fase 08 without `## Causa confirmada`) after Bucle A exhaustion
- **THEN** fase 17 SHALL emit "no resuelto", set `case.status: pausado` with `case_paused_at`, write lesson, and route to fase 18 for Bucle C offer

### Requirement: Fase 17 como frontera de Etapa B

La spec validada que alimenta OpenSpec SHALL emitirse en fase 17, no en fase 09 como en versiones anteriores. La fase 17 SHALL construir la spec con datos de ambas cadenas: causa confirmada en `08-analysis.md` y solución ganadora en `16-solution-analysis.md`. La frontera de Etapa B se define como: spec validada disponible en fase 17 → entrada a OpenSpec apply/verify.

#### Scenario: Etapa B OpenSpec se activa desde fase 17 en ruta (a)
- **WHEN** fase 17 emits route **(a)** and `integration_mode` is `Completo` or `Rápido`
- **THEN** the orchestrator SHALL create the OpenSpec change with specs fed from fase 17 output and trigger Etapa B apply/verify

### Requirement: Verify re-ejecuta fase 16

Tras un ciclo completo de `openspec-apply` → `openspec-verify`, si verify converge sin CRITICALs pendientes, el orquestador SHALL re-invocar fase 16 (MINOR version bump, ingiriendo la salida de verify en `16-solution-analysis.md`) para asegurar que la spec refleja el estado final verificado. Este re-ejecutar fase 16 no dispara Bucle B ni nueva ronda 12–16; es una sincronización del artefacto con el estado post-verify.

#### Scenario: Verify converge sin CRITICALs
- **WHEN** `openspec-verify` returns with no CRITICAL findings
- **THEN** the orchestrator SHALL re-invoke fase 16 with MINOR version bump, ingesting verify output into `16-solution-analysis.md`, and proceed to Etapa C route (iii)

### Requirement: phase_policy matrix con 16 entries

Cada perfil SHALL tener una `phase_policy matrix` con exactamente 16 entries, una por cada fase del sistema (01–08 causa + 11–16 solución + 17–18 cierre). Cada entry SHALL tener el contrato `{ focus, reasoning_effort, evidence, acceptance, risk_controls }`. Las 16 claves válidas son: `observation`, `problem-definition`, `research`, `hypothesis`, `experiment-design`, `experiment-execution`, `data-collection`, `analysis`, `solution-research`, `solution-hypothesis`, `solution-experiment-design`, `solution-execution`, `solution-data-collection`, `solution-analysis`, `conclusion`, `communication`. El esquema `phase-policy-schema.md` SHALL admitir 16 claves válidas.

#### Scenario: Validación de phase_policy con 16 entries
- **WHEN** the orchestrator initializes a case with a profile
- **THEN** the `phase_policy` block in `case.md` SHALL contain exactly 16 entries, one per phase, each with the contract fields

### Requirement: Nuevos campos en case.md

El bloque canónico de `case.md` SHALL incluir `case_run` (entero ≥1, inicial 1, se incrementa en cada re-apertura Bucle C aceptada), `case_paused_at` (ISO-8601 UTC o vacío), `case_resumed_at` (ISO-8601 UTC o vacío), e `integration_mode` (uno de `Completo`, `Rápido`, `Solo-SM`, `Solo-OpenSpec`). El bloque `phases` SHALL tener 16 entries (no 10), una por cada fase ejecutable del sistema.

#### Scenario: case.md con nuevos campos tras migración
- **WHEN** a new case is created under the two-chain system
- **THEN** `case.md` SHALL contain `case_run: 1`, `case_paused_at: ""`, `case_resumed_at: ""`, `integration_mode`, `phase_policy` with 16 entries, and `phases` with 16 entries

### Requirement: Campo chain en frontmatter de artefactos de fase

Cada artefacto de fase emitido en modo Full SHALL incluir el campo `chain` en su frontmatter, con valores `cause` (fases 01–08), `solution` (fases 11–16), o `closure` (fases 17–18). El orquestador SHALL inferir `chain` del número de fase si está ausente. El rango de numeración de artefactos SHALL ser `NN ∈ 01..18` (no `01..10`; 09 y 10 vacantes por renumeración).

#### Scenario: Artefacto de fase con campo chain explícito
- **WHEN** a phase artefact is created for fase 11 in a Full-mode case
- **THEN** the frontmatter SHALL contain `chain: solution` and the filename SHALL be `11-solution-research.md`

### Requirement: Bucle B preserva 11 y 12

En cada iteración del Bucle B, los artefactos 11 y 12 SHALL NOT be marked as `superseded`. El artefacto 11 es el mapa del espacio de soluciones y debe persistir. El artefacto 12 hace append de nuevas hipótesis sin sobrescribir las ya probadas. Solo los artefactos 13, 14, 15 y 16 de la ronda anterior SHALL be marked `superseded`.

#### Scenario: Bucle B nueva ronda preserva 11 y 12
- **WHEN** Bucle B triggers a new round after fase 16 emits no winner
- **THEN** artefactos 11 and 12 SHALL remain with current status, and artefactos 13–16 SHALL be marked `superseded` with version bump

### Requirement: Idempotencia de fase 11 y fase 12

La fase 11 SHALL be idempotent: re-ejecutada SHALL NOT destroy the solution space map, sino SHALL extend it with new candidates marked `pending`. La fase 12 SHALL be idempotent: re-ejecutada por Bucle B SHALL append new hypotheses without overwriting previously tested ones, and SHALL mark newly moved sources as `explored` in 11.

#### Scenario: Fase 11 re-ejecutada amplia el mapa sin destruir
- **WHEN** fase 11 is re-invoked after a Bucle B round
- **THEN** existing candidates in `11-solution-research.md` SHALL remain, and new candidates SHALL be appended with `status: pending`

### Requirement: Exactly one verdict section in fase 08 per iteration

La fase 08 SHALL emitir exactamente una de dos secciones por iteración: `## Causa confirmada` o `## Causa refutada`. SHALL NOT haber ambas ni ninguna. La presencia de `## Causa confirmada` es la precondición estructural para abrir la cadena de solución (fase 11).

#### Scenario: Fase 08 emite causa confirmada
- **WHEN** the data supports the active cause hypothesis
- **THEN** fase 08 SHALL emit `## Causa confirmada: <brief statement>` with evidence, magnitude, threats to validity, and side effects

#### Scenario: Fase 08 emite causa refutada
- **WHEN** the data does NOT support the active cause hypothesis
- **THEN** fase 08 SHALL emit `## Causa refutada: <brief statement>` with evidence; if `pending` candidates remain in `04-hypothesis.md`, Bucle A triggers; otherwise phase 17 route **(c)** with `pause_reason: candidatas_agotadas`

### Requirement: Exactly one winner section in fase 16 per batch

La fase 16 SHALL emitir `## Solución ganadora` solo cuando al menos una hipótesis supera los criterios del perfil. SHALL emit `## Hipótesis descartadas` obligatoriamente tras cada batch, listando cada hipótesis descartada con razón de descarte. Si no hay ganadora, SHALL add a **Batch sin ganadora** paragraph under `## Hipótesis descartadas` explaining why no hypothesis met the profile threshold.

#### Scenario: Fase 16 emite solución ganadora
- **WHEN** at least one hypothesis in the normalized table meets the profile acceptance criteria
- **THEN** fase 16 SHALL emit `## Solución ganadora` with winner name, mechanism, key comparative metrics, quantitative justification (score + breakdown), and predicted diff; AND SHALL emit `## Hipótesis descartadas` with each discard reason

#### Scenario: Fase 16 emite batch sin ganadora
- **WHEN** no hypothesis in the normalized table meets the profile acceptance criteria
- **THEN** fase 16 SHALL NOT emit `## Solución ganadora` and SHALL emit `## Hipótesis descartadas` with a **Batch sin ganadora** paragraph explaining why no hypothesis won

### Requirement: Fase 17 consume datos de ambas cadenas

La fase 17 SHALL consumir datos de la cadena de causa (02-problem-definition.md, 08-analysis.md) y, cuando el estado de la cadena de solución sea `completa_12-16`, también de la cadena de solución (16-solution-analysis.md). SHALL NOT requerir fase 16 si el estado es `no_abierta` o `parcial_11`.

#### Scenario: Fase 17 con estado completa_12-16 consume 16
- **WHEN** fase 17 is invoked and solution chain state is `completa_12-16`
- **THEN** fase 17 SHALL read `16-solution-analysis.md` for the winning solution to include in the spec

### Requirement: Fase 18 cita ganadora de fase 16 en commit

La fase 18 SHALL citar en el borrador de commit/PR la solución ganadora de `16-solution-analysis.md`, no la primera idea del agente. Si la fase 17 pausó el caso (ruta (c)), la fase 18 SHALL emitir comunicación de "no resuelto" con la lección y la oferta canónica de re-apertura Bucle C (contexto sugerido ctx-a/ctx-b/ctx-c según el disparador C1/C2/C3).

#### Scenario: Fase 18 en cierre con ganadora cita de fase 16
- **WHEN** fase 17 emitted route **(a)** with a winning solution
- **THEN** the commit/PR draft in fase 18 SHALL cite the winner from `16-solution-analysis.md`, not a first idea from the agent

### Requirement: Estados de caso y transiciones

El `case.status` SHALL soportar los valores `in_progress`, `pausado`, `done`, y `aborted`. Las transiciones válidas son: `in_progress` → `pausado` (solo vía fase 17 ruta (c)); `in_progress` → `done` (vía fase 17 rutas (a) o (b)); `pausado` → `in_progress` (vía aceptación de re-apertura Bucle C); `done` y `aborted` son terminales.

#### Scenario: Caso transiciona a pausado tras ruta (c)
- **WHEN** fase 17 emits route **(c)**
- **THEN** `case.status` SHALL be set to `pausado` and `case_paused_at` SHALL be populated with current UTC timestamp

#### Scenario: Caso transiciona de pausado a in_progress tras re-apertura
- **WHEN** the user accepts re-opening and the orchestrator processes the acceptance
- **THEN** `case_run` SHALL be incremented, `case_resumed_at` SHALL be set, `case.status` SHALL move to `in_progress`, and phases 03–08 SHALL be re-invoked with new context

### Requirement: Veredicto de fase 16 alimenta Etapa B

La `## Solución ganadora` en `16-solution-analysis.md` SHALL ser la única fuente de la solución ganadora para la fase 17. Las rutas (a)/(b)/(c) se resuelven en fase 17, no en fase 16. Fase 16 SHALL NOT set `case.status`.

#### Scenario: Fase 16 alimenta veredicto a fase 17
- **WHEN** fase 16 emits `## Solución ganadora`
- **THEN** that section SHALL be the sole source of the winning solution for fase 17 to include in the spec; fase 16 SHALL NOT set `case.status`

### Requirement: Bucle C re-ejecuta 03–08, no 01–02

En la re-apertura Bucle C, el orquestador SHALL re-ejecutar las fases 03–08 (investigación, hipótesis, diseño, ejecución, datos, análisis de causa) con el nuevo contexto. Las fases 01–02 (observación y definición del problema) SHALL NOT be re-ejecutadas porque la observación y la definición del problema siguen siendo válidas para el caso pausado.

#### Scenario: Re-apertura Bucle C preserva 01–02
- **WHEN** a case is reopened after Bucle C acceptance
- **THEN** phases 01 and 02 SHALL NOT be re-invoked; phases 03–08 SHALL be re-invoked with the new context provided by the user

### Requirement: Solución abierta en corrida posterior, no en ciclo 03–08 del Bucle C

La cadena de solución (fases 11–16) SHALL NOT open within the same 03–08 cycle of Bucle C. Si tras la re-apertura la causa se confirma, la cadena de solución SHALL open in the incremented `case_run` (corrida actual), not before.

#### Scenario: Solución abre en corrida posterior tras confirmación de causa
- **WHEN** Bucle C re-opening confirms the cause in the incremented `case_run`
- **THEN** the solution chain (11–16) SHALL open in that same `case_run`, not within the Bucle C 03–08 cycle

### Requirement: Eliminación del campo solution_hypotheses en case.md

El bloque canónico de `case.md` SHALL NOT incluir el campo `solution_hypotheses: []`. Las hipótesis de solución SHALL persistir exclusivamente en el artefacto `12-solution-hypothesis.md` de la fase 12. El espacio de búsqueda de soluciones SHALL persistir en `11-solution-research.md` con el mapa de candidatas en estado `pending | explored | discarded`.

#### Scenario: case.md con solution_hypotheses es rechazado
- **WHEN** a `case.md` contains the field `solution_hypotheses: []`
- **THEN** the orchestrator SHALL reject the case as invalid and emit an error indicating the field was removed in v1.1 of the two-chain system