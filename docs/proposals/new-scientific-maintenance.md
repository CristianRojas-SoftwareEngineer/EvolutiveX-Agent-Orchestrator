# Nuevo diseño: Mantenimiento Científico con dos cadenas secuenciales

> **Estado:** propuesta de migración (no implementado) · **Versión:** v0.1 (borrador) · **Reemplaza a:**
> `scientific-maintenance.md` v1.0 cuando sea aprobado · **Sistema vigente actual:** 15 skills `sm-*`
> descritas en `docs/proposals/scientific-maintenance.md` v1.0

---

## Resumen ejecutivo

El sistema actual (`docs/proposals/scientific-maintenance.md` v1.0) modela **un único método
científico de diez fases** que itera el espacio de causas y emite decisiones arquitectónicas (qué
procesos matar, cómo recuperarse) en la fase 09 sin haber medido trade-offs entre alternativas. El caso
`20260607-clean-modules-windows` lo evidenció: la spec validada en la fase 09 chocó con la realidad al
ejecutar `openspec-apply`, obligando a divergir del plan.

Se intentó resolver el gap con la "extensión por modos" (commits `46de4ea`, `ca0b86e`, `3c42a93`):
las fases 03–08 detectaban su modo desde el estado del artefacto y bifurcaban su lógica entre
"causa-mode" y "solution-mode". Funcionó formalmente, pero introdujo ambigüedades estructurales
(re-entry rules distintas, sección `## Solution comparison` condicional, modo detectado
dinámicamente) que la lesson `clean-modules-windows-atomicity-2026-06.md` reconoce como
insuficientes.

Este documento propone la corrección arquitectónica limpia: **dos métodos científicos en serie**,
cada uno con sus propias fases especializadas, sin bifurcación interna por modo.

- **Cadena de causa (fases 01–08):** método científico sobre el espacio de hipótesis de causa. Es la
  cadena actual 01–08 sin cambios estructurales; conserva el bucle de refutación interna (fase 08
  refuta → 04–08 marcados `superseded` → re-ejecuta 04 con la siguiente candidata).
- **Cadena de solución (fases 11–16):** segundo método científico, especializado y físicamente
  separado, sobre el espacio de hipótesis de solución. Solo abre si la cadena de causa confirmó una
  causa. Cero modos internos: cada fase de solución tiene su propio `SKILL.md`, su propio artefacto y
  su propio contrato.
- **Cierre global (fases 17–18):** conclusión y comunicación únicas al final, que consumen datos de
  **ambas cadenas**. Las antiguas fases 09 y 10 se renumeran a 17 y 18.
- **Re-apertura post "no resuelto" (Bucle C):** si la cadena de causa no confirma una causa, la fase
  17 emite "no resuelto" + lección + estado `pausado`. El orquestador ofrece al usuario re-ejecutar
  03–08 con nuevo contexto (más recall, información nueva), conservando 01–02. La cadena de
  solución **nunca** se abre en este bucle.

El contrato `phase-policy-schema.md` (`{ focus, reasoning_effort, evidence, acceptance,
risk_controls }`) **no cambia**; lo que cambia es la cantidad de entries en la `phase_policy matrix`
por caso (de 10 a 16, con rango numérico `01..18`). El `case_mode` (`full`/`consolidated`)
**no cambia**. El `CHANGELOG.md`
derivado **no cambia**. La integración con OpenSpec (Etapas A/B/C) **no cambia** en este plan; la
referencia a "fase 09" como frontera de Etapa B se ajustará a "fase 17" solo cuando el usuario
apruebe el diseño.

**Este documento describe, no implementa.** Las 15 skills `sm-*` actuales, las plantillas, las
referencias, el doc de integración y la lesson permanecen **intactos** hasta que el usuario apruebe
el diseño. La implementación, cuando se apruebe, será objeto de un plan de migración aparte.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#resumen-ejecutivo)
2. [Cómo leer este documento](#cómo-leer-este-documento)
3. [El proceso unificado de dos cadenas](#3-el-proceso-unificado-de-dos-cadenas)
   - [3.1 Los tres bucles del workflow](#31-los-tres-bucles-del-workflow)
4. [Numeración y contrato de fases](#4-numeración-y-contrato-de-fases)
5. [Precondiciones y validaciones](#5-precondiciones-y-validaciones)
6. [Especificación de cada perfil](#6-especificación-de-cada-perfil)
   - [6.1 Corrective](#61-corrective-sm-profile-corrective)
   - [6.2 Adaptive](#62-adaptive-sm-profile-adaptive)
   - [6.3 Perfective](#63-perfective-sm-profile-perfective)
   - [6.4 Preventive](#64-preventive-sm-profile-preventive)
   - [6.5 Tabla comparativa de perfiles](#65-tabla-comparativa-de-perfiles)
7. [Especificación de cada fase](#7-especificación-de-cada-fase)
   - [7.1–7.8 Cadena de causa (fases 01–08)](#7-especificación-de-cada-fase)
   - [7.9–7.16 Cadena de solución (fases 11–16)](#7-especificación-de-cada-fase)
   - [7.17–7.18 Cierre global (fases 17–18)](#7-especificación-de-cada-fase)
8. [Artefactos](#8-artefactos)
9. [Memoria, changelog y hooks](#9-memoria-changelog-y-hooks)
10. [Ejemplos de uso](#10-ejemplos-de-uso)
    - [10.5 Ejemplo de caso "no resuelto" con pausa y re-apertura](#105-ejemplo-de-caso-no-resuelto-con-pausa-y-re-apertura)
11. [Recomendaciones de implementación](#11-recomendaciones-de-implementación)
12. [Referencias cruzadas](#12-referencias-cruzadas)

---

## Cómo leer este documento

Las secciones obligatorias para entender el diseño son §3, §4 y §5 (proceso, numeración,
precondiciones). Las secciones §6 y §7 son la especificación de skills (perfiles y fases, con la
misma profundidad que el doc original). Las secciones §8 y §9 describen los artefactos y la
memoria. Las secciones §10 y §10.5 son ejemplos de uso que muestran las dos cadenas en la práctica.
Las secciones §11 y §12 son la hoja de ruta de migración y las referencias cruzadas con el sistema
vigente.

Para entender **por qué** se rediseña, leer primero el resumen ejecutivo y la lesson
`clean-modules-windows-atomicity-2026-06.md`. Para entender **cómo** se rediseña, continuar por §3.
Para entender **qué cambia** respecto al sistema actual, leer §11 y la tabla comparativa de §6.5.

---

## 3. El proceso unificado de dos cadenas

El workflow es un **grafo dirigido** con dos cadenas secuenciales especializadas, unidas por una
frontera explícita de "causa confirmada". La cadena de causa itera el espacio de hipótesis de causa;
la cadena de solución itera el espacio de hipótesis de solución. La cadena de causa es **completa
en sí misma**: si no confirma una causa, emite "no resuelto" en 17 y termina sin abrir la cadena de
solución. La cadena de solución nunca se bifurca internamente por modo — cada fase tiene un único
procedimiento.

```
Cadena de causa (01–08)
─────────────────────────────────────────────────────────────────────
  01 → 02 → 03 → 04 ⇆(refut. A) → 05 → 06 → 07 → 08
                                                          │
                                                          ▼
                                              frontera: causa confirmada
                                                          │
Cadena de solución (11–16)                                │
─────────────────────────────────────────────────────────▼──
                                          11 → 12 ⇆(refut. B) → 13 → 14 → 15 → 16
                                                                                    │
                                                                                    ▼
Cierre global (17–18)                                                              │
─────────────────────────────────────────────────────────────────────────────────▼──
                                                                   17 → 18
```

La frontera horizontal **"causa confirmada"** no es un artefacto: es una **precondición estructural**
(ver §5.2). Si la fase 08 no confirma una causa, el orquestador no invoca la fase 11; en su lugar,
la fase 17 emite el veredicto "no resuelto" y la fase 18 lo comunica. La cadena de causa es, por
tanto, el único camino obligatorio; la cadena de solución es condicional a la confirmación de causa.

Las flechas `⇆(refut. A)` y `⇆(refut. B)` representan los dos bucles de refutación interna. El
**Bucle C** (re-apertura post "no resuelto") opera a nivel de caso completo y se documenta en
§3.1.3; no aparece en el grafo porque pausa y reanuda el caso, no un re-flujo dentro de la misma
corrida.

### 3.1 Los tres bucles del workflow

El sistema soporta **tres tipos de bucle**, ortogonales entre sí. El bucle A itera hipótesis de
causa; el bucle B itera hipótesis de solución; el bucle C re-abre el caso tras "no resuelto".

#### 3.1.1 Bucle A — refutación interna de causa

- **Disparador:** la fase 08 (análisis) refuta la hipótesis activa porque los datos no la soportan.
- **Acción:** marcar los artefactos `04`–`08` de esa hipótesis como `superseded` (incrementando
  versión). **No** se tocan 01, 02, 03 (la observación, el problema y la investigación siguen siendo
  válidos aunque una hipótesis concreta se refute).
- **Reanudación:** el orquestador re-ejecuta la fase 04 con la siguiente hipótesis candidata de
  `04-hypothesis.md`.
- **Terminación:** una hipótesis se confirma, o se agotan las candidatas. Si se agotan, la fase 17
  emite "no resuelto" + estado `pausado` (Bucle C, ver §3.1.3).
- **Independencia del perfil:** este bucle aplica igual bajo cualquier perfil (corrective, adaptive,
  perfective, preventive).

#### 3.1.2 Bucle B — iteración del espacio de soluciones

- **Disparador:** la fase 16 (análisis comparativo de soluciones) refuta la solución activa porque
  la tabla normalizada de 15 muestra que la candidata activa no cumple los criterios de veredicto
  (efecto, blast radius, reversibilidad, riesgo residual, o la métrica dominante del perfil).
- **Acción:** marcar los artefactos `12`–`16` de esa solución como `superseded` (incrementando
  versión). **No** se toca 11 (la investigación del espacio de soluciones se conserva como mapa del
  espacio de búsqueda, aunque una candidata concreta se descarte).
- **Reanudación:** el orquestador re-ejecuta la fase 12 con la siguiente candidata de
  `12-solution-hypothesis.md`. El experimento comparativo de 13 puede **re-utilizarse** sin cambios
  (las hipótesis descartadas ya estaban contempladas en el diseño); si no, 13 se rehace.
- **Terminación:** una solución gana el veredicto de 16, o se agotan las candidatas. Si se agotan,
  la fase 17 emite "no resuelto" + estado `pausado` (Bucle C, ver §3.1.3).
- **Independencia del perfil:** este bucle aplica igual bajo cualquier perfil. La política de qué
  candidatas priorizar dentro del bucle sí depende del perfil (ver §6), pero el mecanismo del
  bucle no.

#### 3.1.3 Bucle C — re-apertura post "no resuelto"

- **Disparador:** la fase 17 emite "no resuelto" porque (a) el Bucle A agotó las candidatas de causa
  sin confirmar, o (b) el Bucle B agotó las candidatas de solución sin veredicto, o (c) la fase 11
  no encontró soluciones viables.
- **Acción:** la fase 17 escribe la lección destilada, fija el estado del caso como `pausado` en
  `case.md` (campo nuevo `case_paused_at: <ISO-8601 UTC>`), y emite el veredicto "no resuelto"
  hacia la fase 18. La fase 18 comunica el estado al usuario y al changelog.
- **Re-apertura:** el orquestador, al recibir el veredicto, **ofrece al usuario** re-abrir el caso
  con nuevo contexto: (a) más investigación/recall de la base de conocimiento, (b) información
  nueva del usuario sobre el problema, (c) sugerencia de un perfil distinto.
- **Alcance de la re-apertura:** si el usuario acepta, el orquestador re-ejecuta **03–08** con el
  nuevo contexto. Las fases 01–02 **no** se re-ejecutan: la observación y la definición del problema
  siguen siendo válidas (es un caso pausado, no un caso nuevo).
- **Cadena de solución en la re-apertura:** la cadena de solución (11–16) **nunca** se abre
  dentro del Bucle C. Aunque la causa se confirme tras la re-apertura, la cadena de solución abre
  en una **corrida posterior** del caso (con un nuevo `case_resumed_at` registrado). Esto evita
  mezclar dos ciclos de vida en el mismo expediente y mantiene la trazabilidad limpia.
- **Campos de control:** el bloque canónico de `case.md` registra `case_paused_at` (cuándo se
  pausó) y, si se re-abre, `case_resumed_at` (cuándo se reabrió). El estado pasa por los valores
  `in_progress` → `pausado` → `in_progress` → `done` o `aborted`.
- **Múltiples pausas:** un caso puede pausarse y re-abrirse varias veces. Cada par pausa/re-apertura
  queda registrado en el bloque canónico.

---

## 4. Numeración y contrato de fases

El sistema se compone de **16 fases especializadas** distribuidas en tres cadenas, numeradas en el
rango `01..18` (los números 09 y 10 quedan vacantes por renumeración, ver abajo). La numeración es
**estable y semántica**: las fases 01–08 conservan la numeración actual (cadena de causa); las
fases 11–16 son nuevas (cadena de solución); las fases 17 y 18 son las antiguas 09 y 10 renumeradas
(cierre global). La renumeración de 09–10 a 17–18 es la **inversión** del bug que tenía el modelo
de "1 cadena con modos": las fases terminales del método quedan al final, no mezcladas con las
fases de causa.

| #   | Fase                                    | Skill                                       | Cadena    | Artefacto                              |
| --- | --------------------------------------- | ------------------------------------------- | --------- | -------------------------------------- |
| 01  | Observación                             | `sm-phase-observation`                      | Causa     | `01-observation.md`                    |
| 02  | Definición del problema                 | `sm-phase-problem-definition`               | Causa     | `02-problem-definition.md`             |
| 03  | Investigación                           | `sm-phase-research`                         | Causa     | `03-research.md`                       |
| 04  | Formulación de hipótesis de causa       | `sm-phase-hypothesis`                       | Causa     | `04-hypothesis.md`                     |
| 05  | Diseño experimental de causa            | `sm-phase-experiment-design`                | Causa     | `05-experiment-design.md`              |
| 06  | Ejecución del experimento de causa      | `sm-phase-experiment-execution`             | Causa     | `06-experiment-execution.md`           |
| 07  | Recolección de datos de causa           | `sm-phase-data-collection`                  | Causa     | `07-data-collection.md`                |
| 08  | Análisis de causa                       | `sm-phase-analysis`                         | Causa     | `08-analysis.md`                       |
| 11  | Investigación del espacio de soluciones | `sm-phase-solution-research`                | Solución  | `11-solution-research.md`              |
| 12  | Formulación de hipótesis de solución    | `sm-phase-solution-hypothesis`              | Solución  | `12-solution-hypothesis.md`            |
| 13  | Diseño experimental comparativo         | `sm-phase-solution-experiment-design`       | Solución  | `13-solution-experiment-design.md`     |
| 14  | Ejecución secuencial de hipótesis       | `sm-phase-solution-execution`               | Solución  | `14-solution-execution.md`             |
| 15  | Recolección y normalización de datos    | `sm-phase-solution-data-collection`         | Solución  | `15-solution-data-collection.md`       |
| 16  | Análisis comparativo y veredicto        | `sm-phase-solution-analysis`                | Solución  | `16-solution-analysis.md`              |
| 17  | Conclusión (veredicto + spec)           | `sm-phase-conclusion`                       | Cierre    | `17-conclusion.md`                     |
| 18  | Comunicación (commit + changelog)       | `sm-phase-communication`                    | Cierre    | `18-communication.md`                  |

> **Nota de numeración:** los saltos 09–10 → 11–12 son intencionados. Permiten que las fases 03 y 11
> (investigación), 04 y 12 (hipótesis), 05 y 13 (diseño), 06 y 14 (ejecución), 07 y 15 (datos), 08 y
> 16 (análisis) tengan el mismo ordinal dentro de su cadena — eso facilita razonar "la fase X de
> causa y la fase X de solución son ortogonales" sin tener que aprender dos numeraciones distintas.

El **contrato de una fase** no cambia respecto al sistema actual: cada fase lee su entrada en
`phase_policy` (de `case.md`), aplica su procedimiento genérico modulado por esa política, escribe su
artefacto y actualiza el estado. Lo que cambia es la cantidad de entries en `phase_policy`: pasa de
10 a 16.

---

## 5. Precondiciones y validaciones

Tres precondiciones estructurales rigen el avance del workflow. La primera ya existe; las dos
nuevas son consecuencia del rediseño.

### 5.1 Precondición de fase (ya existente)

La fase `N` solo se ejecuta si la fase `N-1` está `done` en el bloque canónico de `case.md` (campo
`phases`). El orquestador verifica esta precondición antes de invocar la skill de fase. Si la fase
`N-1` no está `done`, el orquestador se detiene y reporta. Esta precondición aplica **dentro de cada
cadena**: la fase 05 requiere 04; la fase 11 requiere 08; la fase 17 requiere 16.

### 5.2 Precondición de cadena (NUEVA)

La cadena de solución (fase 11) **solo abre** si la fase 08 confirmó una causa. La confirmación
queda registrada en `08-analysis.md` con una sección `## Causa confirmada` y un veredicto explícito.
Si la fase 08 no contiene esa sección, el orquestador **no** invoca la fase 11: en su lugar, salta
directamente a la fase 17 para emitir "no resuelto" + estado `pausado`. Esta precondición es
**estructural**, no convencional: la fase 11 no puede ejecutarse si su input no existe.

### 5.3 Precondición del cierre (NUEVA)

La fase 17 **solo** emite la spec validada si `16-solution-analysis.md` existe y contiene una
sección `## Solución ganadora` con veredicto explícito (solución elegida + justificación
cuantitativa). Sin esa sección, la fase 17 emite un veredicto de "no resuelto" o "diferido"
(según indique el caso: si la causa está confirmada pero la fase 16 no se ejecutó porque se
agotaron las candidatas, es "no resuelto"; si la causa y la solución están confirmadas pero la spec
necesita información que el usuario no ha provisto, es "diferido"). La precondición es
estructural: el artefacto de la fase 16 es la **única** fuente de la solución ganadora.

### 5.4 Validación de esquema YAML

El bloque `phase_policy` del `case.md` pasa de 10 a **16 entries válidas** (ver §4). El orquestador
valida que las 16 claves estén presentes y que cada entry cumpla el contrato
`{ focus, reasoning_effort, evidence, acceptance, risk_controls }`. Las 16 claves válidas son:
`observation`, `problem-definition`, `research`, `hypothesis`, `experiment-design`,
`experiment-execution`, `data-collection`, `analysis`, `solution-research`, `solution-hypothesis`,
`solution-experiment-design`, `solution-execution`, `solution-data-collection`, `solution-analysis`,
`conclusion`, `communication`. El campo `phases` del bloque canónico también tiene 16 entries (no
10). El campo opcional `case_paused_at` se añade al bloque canónico (string ISO-8601 UTC o vacío).
La validación de esquema sigue siendo un **paso obligatorio** del orquestador (no se debilita por
ampliar el rango de claves).

> **Nota sobre el conteo de fases y entries:** el plan original mencionaba "18" en varios lugares;
> las cuentas reales son 16 (8 de causa + 6 de solución + 2 de cierre). El rango numérico sigue
> siendo `01..18` (los números 09 y 10 están vacantes por la renumeración de 09→17, 10→18). Esta
> nota documenta la discrepancia para que la fase de cierre del plan pueda detectarla.

---

## 6. Especificación de cada perfil

Cada perfil declara objetivo, prioridades, señales de activación, métricas, criterios de riesgo, y
una proyección sobre las **16 fases** (8 de causa + 6 de solución + 2 de cierre) en forma de
`phase_policy matrix`. La `phase_policy matrix` pasa de 10 a 16 entries; el contrato de cada entry
(`{ focus, reasoning_effort, evidence, acceptance, risk_controls }`) **no cambia**.

La política de cada perfil sobre las fases de causa (01–08) es esencialmente la misma que en
`scientific-maintenance.md` v1.0 §7. Las novedades son: (a) la política sobre las 6 fases de
solución (11–16), donde cada perfil decide cómo priorizar candidatas y qué trade-offs
favorecer; (b) la política sobre las 2 fases de cierre (17–18), donde cada perfil decide qué
énfasis dar al veredicto y a la comunicación.

### 6.1 Corrective (`sm-profile-corrective`)

- **Objetivo:** restaurar el comportamiento correcto eliminando un defecto.
- **Prioridades:** reproducir → causa raíz → fix mínimo → no-regresión. Velocidad de restauración.
- **Señales que lo activan:** bug reportado, excepción, fallo en producción, test rojo, regresión.
- **Métricas de éxito:** test de reproducción que pasa tras el fix; cero regresiones; tiempo a la
  resolución.
- **Criterios de riesgo:** cambios amplios para un fallo localizado; fix sin test que lo cubra;
  solución que añada blast radius innecesario.
- **Política de la cadena de causa:** igual que v1.0 — observación enfocada a reproducir;
  hipótesis prioriza la causa raíz más probable y barata de probar; diseño asegura test que
  reproduce el bug primero; análisis evalúa cierre del fallo y no-regresión.
- **Política de la cadena de solución (NUEVA):** en `solution-research` enfocar el recall a
  **fixes ya conocidos** para esa clase de defecto y patrones históricos del componente; en
  `solution-hypothesis` priorizar **la solución más conservadora y mínima** (menor blast radius,
  mayor reversibilidad); en `solution-experiment-design` exigir un **test de no-regresión** dentro
  del experimento comparativo; en `solution-execution` ejecutar con **rollback explícito**
  documentado; en `solution-data-collection` capturar **pass/fail del test de reproducción** como
  métrica obligatoria; en `solution-analysis` exigir veredicto de solución ganadora con **diff
  mínimo** citado.
- **Política del cierre global (NUEVA):** en `conclusion` (fase 17) redactar veredicto de "causa
  confirmada + solución ganadora + diff mínimo"; en `communication` (fase 18) enfatizar causa raíz
  y prueba de no-regresión.

#### Phase-policy matrix (16 entries)

```yaml
phase_policy:
  observation:            { focus: "reproducir el síntoma; capturar stack traces, logs, condiciones",        reasoning_effort: medium, evidence: [repro_steps, stack_traces, env],         acceptance: "síntima reproducible documentado",  risk_controls: [sandbox, no_prod_write] }
  problem-definition:     { focus: "definir el fallo y su criterio de no-regresión",                          reasoning_effort: medium, evidence: [enunciado, criterio_exito],            acceptance: "problema falsable + criterio de no-regresión", risk_controls: [] }
  research:               { focus: "regresiones recientes; commits sospechosos; recall por defect-class",     reasoning_effort: medium, evidence: [commits, lecciones_recalled, file:línea], acceptance: "recall ejecutado; fuentes citadas", risk_controls: [] }
  hypothesis:             { focus: "causa raíz más probable y barata de probar",                             reasoning_effort: medium, evidence: [prediccion, criterio_refutacion],      acceptance: "≥1 hipótesis falsable",                risk_controls: [] }
  experiment-design:      { focus: "test que reproduce el bug primero; rollback = revertir commit",            reasoning_effort: medium, evidence: [procedimiento, controles, rollback],   acceptance: "test de reproducción ejecutable",     risk_controls: [sandbox] }
  experiment-execution:   { focus: "ejecutar el test de reproducción; desviaciones documentadas",              reasoning_effort: medium, evidence: [comandos, logs, cambios],              acceptance: "test rojo reproduce el fallo",        risk_controls: [sandbox, reversible] }
  data-collection:        { focus: "pass/fail del test de reproducción; métricas de no-regresión",             reasoning_effort: medium, evidence: [pass_fail, deltas, no_regresion],      acceptance: "datos trazables a la ejecución",       risk_controls: [] }
  analysis:               { focus: "verificar cierre del fallo y no-regresión; alternativas descartadas",     reasoning_effort: medium, evidence: [veredicto, magnitud, amenazas],         acceptance: "causa confirmada o refutada",          risk_controls: [] }
  solution-research:      { focus: "fixes ya conocidos para esta clase de defecto; patrones históricos",       reasoning_effort: medium, evidence: [candidatas, tradeoffs, recall],         acceptance: "≥2 candidatas viables",                risk_controls: [] }
  solution-hypothesis:    { focus: "solución más conservadora y mínima; menor blast radius",                  reasoning_effort: medium, evidence: [prediccion, blast_radius, reversibilidad], acceptance: "≥1 hipótesis falsable + criterios", risk_controls: [] }
  solution-experiment-design: { focus: "experimento comparativo con test de no-regresión obligatorio",      reasoning_effort: medium, evidence: [procedimiento, controles, rollback],   acceptance: "experimento reproducible",            risk_controls: [sandbox, feature_flag] }
  solution-execution:     { focus: "ejecución con rollback explícito entre hipótesis",                        reasoning_effort: medium, evidence: [comandos, logs, cambios_rollback],      acceptance: "ejecución limpia; rollback probado",   risk_controls: [sandbox, reversible] }
  solution-data-collection: { focus: "pass/fail del test de reproducción por hipótesis; deltas de no-regresión", reasoning_effort: medium, evidence: [tabla_normalizada, pass_fail],     acceptance: "tabla con ≥1 fila por hipótesis",       risk_controls: [] }
  solution-analysis:      { focus: "veredicto de ganadora con diff mínimo citado; descarte justificado",        reasoning_effort: medium, evidence: [veredicto, descartadas_con_razon],      acceptance: "ganadora con justificación cuantitativa", risk_controls: [] }
  conclusion:             { focus: "veredicto: causa confirmada + solución ganadora + diff mínimo",           reasoning_effort: medium, evidence: [veredicto, decision, deuda, seguimiento], acceptance: "veredicto coherente con análisis",    risk_controls: [] }
  communication:          { focus: "causa raíz y prueba de no-regresión; diff mínimo",                        reasoning_effort: medium, evidence: [resumen, cambios, evidencia, commit],  acceptance: "commit con metadatos Case: y entrada changelog", risk_controls: [] }
```

### 6.2 Adaptive (`sm-profile-adaptive`)

- **Objetivo:** adaptar el software a un cambio externo (API, dependencia, plataforma, requisito,
  normativa) preservando compatibilidad.
- **Prioridades:** compatibilidad → migración segura → cobertura del nuevo contrato.
- **Señales:** deprecación, upgrade de dependencia, nuevo entorno/OS, cambio regulatorio, nueva
  integración.
- **Métricas de éxito:** suite verde en el nuevo entorno; sin rupturas de contrato público; ruta de
  migración documentada.
- **Criterios de riesgo:** cambios no aislados tras feature flag; ausencia de pruebas de
  compatibilidad; migraciones irreversibles; solución que rompa el contrato público.
- **Política de la cadena de causa:** igual que v1.0 — observación enfocada al delta de entorno;
  investigación estudia la nueva API/entorno; diseño prioriza pruebas de compatibilidad; análisis
  evalúa compatibilidad confirmada.
- **Política de la cadena de solución (NUEVA):** en `solution-research` enfocar el recall a
  **patrones de adaptación previa** del mismo componente o equipo; en `solution-hypothesis`
  priorizar **soluciones reversibles con feature flag**; en `solution-experiment-design` exigir
  **contract tests** del nuevo y del viejo contrato dentro del experimento comparativo; en
  `solution-execution` ejecutar con feature flag; en `solution-data-collection` capturar
  **matrices de compatibilidad** como métrica obligatoria; en `solution-analysis` exigir veredicto
  de solución ganadora con **ruta de migración reversible** citada.
- **Política del cierre global (NUEVA):** en `conclusion` redactar veredicto de "adaptación
  compatible + ruta de migración reversible"; en `communication` enfatizar compatibilidad y
  migración.

#### Phase-policy matrix (16 entries)

```yaml
phase_policy:
  observation:            { focus: "delta de entorno; deprecación; nueva API",                                reasoning_effort: medium, evidence: [uso_actual, fecha_deprecacion],        acceptance: "delta delimitado",                    risk_controls: [] }
  problem-definition:     { focus: "soportar nueva versión manteniendo contrato público",                     reasoning_effort: medium, evidence: [enunciado, contrato_publico],          acceptance: "compatibilidad como criterio",        risk_controls: [] }
  research:               { focus: "diferencias v_old↔v_new; breaking changes; recall de migraciones previas", reasoning_effort: medium, evidence: [diff, breaking_changes, lecciones], acceptance: "cobertura suficiente del cambio",     risk_controls: [] }
  hypothesis:             { focus: "estrategia de adaptación con feature flag",                               reasoning_effort: medium, evidence: [prediccion, flag_strategy],            acceptance: "≥1 estrategia falsable",              risk_controls: [] }
  experiment-design:      { focus: "contract tests v_old y v_new; rollback = flag off",                       reasoning_effort: medium, evidence: [procedimiento, contract_tests, rollback], acceptance: "contract tests ejecutables",       risk_controls: [feature_flag] }
  experiment-execution:   { focus: "implementar adaptador; ejecutar ambos contract tests",                     reasoning_effort: medium, evidence: [comandos, contract_results],           acceptance: "contract tests verdes",               risk_controls: [feature_flag, reversible] }
  data-collection:        { focus: "matriz de compatibilidad v_old/v_new",                                    reasoning_effort: medium, evidence: [matriz, deltas, sin_ruptura_publica],  acceptance: "matriz con todas las filas",          risk_controls: [] }
  analysis:               { focus: "compatibilidad confirmada; sin rupturas públicas",                        reasoning_effort: medium, evidence: [veredicto, matriz, amenazas],          acceptance: "compatibilidad confirmada",           risk_controls: [] }
  solution-research:      { focus: "patrones de adaptación previa del componente; framework guides",          reasoning_effort: medium, evidence: [candidatas, recall, tradeoffs],         acceptance: "≥2 candidatas reversibles",           risk_controls: [] }
  solution-hypothesis:    { focus: "soluciones reversibles con feature flag; mínima ruptura de contrato",     reasoning_effort: medium, evidence: [prediccion, reversibilidad, flag],     acceptance: "≥1 hipótesis falsable reversible",    risk_controls: [] }
  solution-experiment-design: { focus: "experiment comparativo con contract tests v_old y v_new",            reasoning_effort: medium, evidence: [procedimiento, contract_tests],        acceptance: "experimento reproduce ambos contratos", risk_controls: [feature_flag, sandbox] }
  solution-execution:     { focus: "ejecutar con feature flag; rollback = flag off",                           reasoning_effort: medium, evidence: [comandos, contract_results_ambas],    acceptance: "ejecución limpia; rollback probado",   risk_controls: [feature_flag, reversible] }
  solution-data-collection: { focus: "matriz de compatibilidad normalizada por hipótesis",                     reasoning_effort: medium, evidence: [tabla_normalizada, contract_pass],     acceptance: "tabla con filas por hipótesis",        risk_controls: [] }
  solution-analysis:      { focus: "veredicto de ganadora reversible con ruta de migración citada",           reasoning_effort: medium, evidence: [veredicto, ruta_migracion, descartes], acceptance: "ganadora reversible con justificación", risk_controls: [] }
  conclusion:             { focus: "adaptación compatible + ruta de migración reversible",                    reasoning_effort: medium, evidence: [veredicto, plan_retirada, deuda],       acceptance: "veredicto coherente con análisis",     risk_controls: [] }
  communication:          { focus: "compatibilidad y migración; guía de migración adjunta",                    reasoning_effort: medium, evidence: [resumen, cambios, guia, commit],        acceptance: "commit con metadatos Case: y changelog", risk_controls: [] }
```

### 6.3 Perfective (`sm-profile-perfective`)

- **Objetivo:** mejorar atributos de calidad sin cambiar comportamiento funcional (rendimiento,
  legibilidad, mantenibilidad, UX).
- **Prioridades:** mejora medible → preservación funcional → ausencia de regresión de calidad.
- **Señales:** lentitud, complejidad alta, code smell, deuda técnica, petición de
  optimización/refactor.
- **Métricas de éxito:** mejora estadísticamente significativa de la métrica objetivo;
  comportamiento invariante (suite verde).
- **Criterios de riesgo:** optimización sin baseline; refactor sin red de tests; mejora dentro del
  ruido; solución que cambie comportamiento funcional inadvertidamente.
- **Política de la cadena de causa:** igual que v1.0 — observación enfoca métricas; definición
  incluye métrica objetivo + umbral; diseño prioriza benchmark A/B; datos capturan deltas con
  varianza; análisis evalúa significancia.
- **Política de la cadena de solución (NUEVA):** en `solution-research` enfocar el recall a
  **benchmarks publicados y patrones de optimización del mismo dominio**; en `solution-hypothesis`
  priorizar **soluciones con hipótesis de mejora cuantificable**; en `solution-experiment-design`
  exigir **benchmark A/B con baseline de N runs y verificación de igualdad funcional**; en
  `solution-execution` ejecutar con **aislamiento de carga**; en `solution-data-collection`
  capturar **deltas con varianza y snapshots de igualdad funcional**; en `solution-analysis` exigir
  veredicto de ganadora con **significancia estadística** citada.
- **Política del cierre global (NUEVA):** en `conclusion` redactar veredicto de "mejora medible +
  comportamiento invariante"; en `communication` enfatizar el delta de métricas con números.

#### Phase-policy matrix (16 entries)

```yaml
phase_policy:
  observation:            { focus: "métricas de calidad/rendimiento; baselines",                              reasoning_effort: medium, evidence: [metricas, baseline, snapshots],         acceptance: "baseline capturado",                  risk_controls: [] }
  problem-definition:     { focus: "métrica objetivo + umbral de mejora",                                      reasoning_effort: medium, evidence: [enunciado, umbral, invariante_funcional], acceptance: "umbral explícito",                  risk_controls: [] }
  research:               { focus: "benchmarks publicados; patrones de optimización; recall por componente",  reasoning_effort: medium, evidence: [benchmarks, lecciones, literatura],     acceptance: "cobertura del dominio",               risk_controls: [] }
  hypothesis:             { focus: "optimización candidata con hipótesis de mejora cuantificable",              reasoning_effort: medium, evidence: [prediccion, magnitud_esperada],         acceptance: "≥1 hipótesis falsable",               risk_controls: [] }
  experiment-design:      { focus: "benchmark A/B; baseline N runs; igualdad de salida",                       reasoning_effort: medium, evidence: [procedimiento, benchmark, baseline],    acceptance: "benchmark ejecutable",                risk_controls: [aislamiento_carga] }
  experiment-execution:   { focus: "ejecutar benchmark antes/después con aislamiento",                          reasoning_effort: medium, evidence: [runs, metricas, desviaciones],           acceptance: "benchmark ejecutado",                 risk_controls: [aislamiento_carga] }
  data-collection:        { focus: "deltas con varianza; snapshots de igualdad funcional",                     reasoning_effort: medium, evidence: [deltas, varianza, igualdad_funcional],   acceptance: "datos con varianza registrada",        risk_controls: [] }
  analysis:               { focus: "significancia estadística; comportamiento invariante",                      reasoning_effort: medium, evidence: [p_value, delta, igualdad],               acceptance: "mejora significativa o refutada",     risk_controls: [] }
  solution-research:      { focus: "benchmarks publicados del dominio; patrones de optimización",              reasoning_effort: medium, evidence: [candidatas, benchmarks, recall],         acceptance: "≥2 candidatas con hipótesis",         risk_controls: [] }
  solution-hypothesis:    { focus: "soluciones con hipótesis de mejora cuantificable",                          reasoning_effort: medium, evidence: [prediccion, magnitud],                  acceptance: "≥1 hipótesis falsable",               risk_controls: [] }
  solution-experiment-design: { focus: "benchmark A/B por hipótesis; baseline N runs; igualdad funcional",  reasoning_effort: medium, evidence: [procedimiento, benchmark, baseline],    acceptance: "experimento A/B ejecutable",           risk_controls: [aislamiento_carga, sandbox] }
  solution-execution:     { focus: "ejecutar cada hipótesis con aislamiento de carga y snapshot funcional",    reasoning_effort: medium, evidence: [runs, metricas, snapshots],              acceptance: "ejecución limpia; snapshots tomados", risk_controls: [aislamiento_carga] }
  solution-data-collection: { focus: "deltas con varianza normalizados; tabla comparativa de métricas",         reasoning_effort: medium, evidence: [tabla_normalizada, p_values],            acceptance: "tabla con varianza por hipótesis",     risk_controls: [] }
  solution-analysis:      { focus: "veredicto con significancia estadística citada; descartes con razón",       reasoning_effort: medium, evidence: [veredicto, p_value, descartes],          acceptance: "ganadora con significancia",          risk_controls: [] }
  conclusion:             { focus: "mejora medible + comportamiento invariante",                               reasoning_effort: medium, evidence: [veredicto, delta, igualdad_funcional],   acceptance: "veredicto cuantitativo",              risk_controls: [] }
  communication:          { focus: "delta de métricas con números; reproducibilidad del benchmark",             reasoning_effort: medium, evidence: [resumen, deltas, benchmark, commit],    acceptance: "commit con metadatos Case: y changelog", risk_controls: [] }
```

### 6.4 Preventive (`sm-profile-preventive`)

- **Objetivo:** reducir la probabilidad o el impacto de fallos futuros antes de que ocurran.
- **Prioridades:** identificación de riesgo → mitigación → cuantificación del riesgo residual.
- **Señales:** auditoría, hardening, análisis de fragilidad, clase de defecto recurrente,
  vulnerabilidad potencial, falta de cobertura crítica.
- **Métricas de éxito:** riesgo mitigado demostrablemente; riesgo residual cuantificado;
  cobertura/guardas añadidas.
- **Criterios de riesgo:** introducir cambio que añade riesgo neto; mitigación sin prueba que la
  valide; alcance que excede el riesgo abordado; mitigación que no cubra las vías de materialización.
- **Política de la cadena de causa:** igual que v1.0 — observación enfoca señales débiles; hipótesis
  formula el mecanismo de materialización del riesgo; diseño prioriza prueba que **provoca** la
  condición de riesgo en sandbox; análisis evalúa reducción efectiva.
- **Política de la cadena de solución (NUEVA):** en `solution-research` enfocar el recall a
  **clases de defecto análogas y mitigaciones probadas**; en `solution-hypothesis` priorizar
  **soluciones que cubren el mayor número de vías de materialización**; en
  `solution-experiment-design` exigir **pruebas que provoquen la condición de riesgo en sandbox**;
  en `solution-execution` ejecutar con **aislamiento estricto**; en `solution-data-collection`
  capturar **presencia/ausencia de la condición de riesgo** como métrica obligatoria; en
  `solution-analysis` exigir veredicto de ganadora con **cobertura de vías de materialización y
  riesgo residual cuantificado** citados.
- **Política del cierre global (NUEVA):** en `conclusion` redactar veredicto de "riesgo mitigado +
  residual cuantificado + vías cubiertas"; en `communication` enfatizar el riesgo evitado y el
  residual.

#### Phase-policy matrix (16 entries)

```yaml
phase_policy:
  observation:            { focus: "señales débiles; tendencias; clases de defecto recurrentes",                reasoning_effort: medium, evidence: [señales, tendencias, recalls],            acceptance: "señales documentadas",                risk_controls: [] }
  problem-definition:     { focus: "riesgo a mitigar; probabilidad/impacto; mecanismo de materialización",      reasoning_effort: medium, evidence: [enunciado, riesgo, prob_impacto],         acceptance: "riesgo falsable con prob/impacto",    risk_controls: [] }
  research:               { focus: "clases de defecto análogas; vulnerabilidades; recall por defect-class",    reasoning_effort: medium, evidence: [clases, vulnerabilidades, lecciones],     acceptance: "recall ejecutado",                    risk_controls: [] }
  hypothesis:             { focus: "mecanismo de materialización del riesgo",                                  reasoning_effort: medium, evidence: [prediccion, mecanismo],                   acceptance: "≥1 mecanismo falsable",               risk_controls: [] }
  experiment-design:      { focus: "prueba que provoca la condición de riesgo en sandbox; rollback trivial",    reasoning_effort: medium, evidence: [procedimiento, inyeccion_fallo, rollback], acceptance: "prueba ejecutable que provoca",    risk_controls: [sandbox, aislamiento_estricto] }
  experiment-execution:   { focus: "inyectar fallo; verificar que la condición se materializa",                  reasoning_effort: medium, evidence: [comandos, inyeccion, resultado],         acceptance: "condición reproducida en sandbox",    risk_controls: [sandbox, aislamiento_estricto] }
  data-collection:        { focus: "presencia/ausencia de la condición de riesgo; cobertura de vías",          reasoning_effort: medium, evidence: [presencia, cobertura, amenazas],          acceptance: "datos trazables",                     risk_controls: [] }
  analysis:               { focus: "reducción efectiva del riesgo; cobertura de vías",                           reasoning_effort: medium, evidence: [veredicto, cobertura, residual],          acceptance: "riesgo confirmado y reducible",       risk_controls: [] }
  solution-research:      { focus: "mitigaciones probadas; guardas análogas; patrones de hardening",            reasoning_effort: medium, evidence: [candidatas, mitigaciones, recall],        acceptance: "≥2 candidatas con cobertura amplia",  risk_controls: [] }
  solution-hypothesis:    { focus: "soluciones que cubren el mayor número de vías de materialización",           reasoning_effort: medium, evidence: [prediccion, cobertura_vias],              acceptance: "≥1 hipótesis falsable con cobertura", risk_controls: [] }
  solution-experiment-design: { focus: "pruebas comparativas que provocan la condición en sandbox",            reasoning_effort: medium, evidence: [procedimiento, inyeccion, baseline],     acceptance: "experimento inyecta el riesgo",       risk_controls: [sandbox, aislamiento_estricto] }
  solution-execution:     { focus: "ejecutar con aislamiento estricto; verificar que la mitigación sostiene",   reasoning_effort: medium, evidence: [comandos, inyeccion, resultado, rollback], acceptance: "ejecución limpia; rollback trivial", risk_controls: [sandbox, aislamiento_estricto] }
  solution-data-collection: { focus: "tabla normalizada: presencia/ausencia de riesgo por hipótesis",            reasoning_effort: medium, evidence: [tabla_normalizada, cobertura],            acceptance: "tabla con cobertura por hipótesis",    risk_controls: [] }
  solution-analysis:      { focus: "veredicto con cobertura de vías y riesgo residual cuantificado",            reasoning_effort: medium, evidence: [veredicto, cobertura, residual],          acceptance: "ganadora con cobertura + residual",    risk_controls: [] }
  conclusion:             { focus: "riesgo mitigado + residual cuantificado + vías cubiertas",                  reasoning_effort: medium, evidence: [veredicto, residual, cobertura, deuda],    acceptance: "veredicto cuantitativo",               risk_controls: [] }
  communication:          { focus: "riesgo evitado y residual; cobertura de vías; prueba que provocaba",        reasoning_effort: medium, evidence: [resumen, riesgo, residual, commit],       acceptance: "commit con metadatos Case: y changelog", risk_controls: [] }
```

### 6.5 Tabla comparativa de perfiles

| Dimensión         | Corrective           | Adaptive               | Perfective             | Preventive         |
| ----------------- | -------------------- | ---------------------- | ---------------------- | ------------------ |
| Detona por        | Fallo presente       | Cambio externo         | Oportunidad de calidad | Riesgo futuro      |
| Optimiza          | Restaurar            | Compatibilizar         | Mejorar métrica        | Reducir riesgo     |
| Foco en causa     | Causa raíz mínima    | Delta de entorno       | Hipótesis cuantificable | Mecanismo de materialización |
| Foco en solución  | Fix mínimo + diff    | Reversible + flag      | A/B + significancia    | Cobertura + residual |
| Evidencia clave   | Test rojo→verde      | Contract tests         | Benchmark A/B          | Prueba de riesgo   |
| Riesgo a evitar   | Fix sin test         | Migración irreversible | Optimizar sin baseline | Añadir riesgo neto |
| Conclusión típica | Causa raíz corregida | Adaptación compatible  | Mejora significativa   | Riesgo mitigado    |
| Veredicto de 17   | Causa+ganadora+diff  | Adaptación+reversible  | Mejora+invariante      | Mitigado+residual  |
| Énfasis de 18     | Causa raíz + no-reg  | Compatibilidad + guía  | Deltas + reproducibilidad | Riesgo evitado + residual |

El contrato de cada entry de la `phase_policy matrix` no cambia — sigue siendo
`{ focus, reasoning_effort, evidence, acceptance, risk_controls }`. Lo que cambia es la cantidad
de entries: de 10 a 16. El schema `phase-policy-schema.md` no requiere cambios estructurales; solo
se amplía el rango de claves válidas de 10 a 16.

---

## 7. Especificación de cada fase

Para cada fase se detalla propósito, entradas, salidas/artefacto, criterios de validación y cómo
se adapta según el perfil. La adaptación es **siempre** vía la `phase_policy matrix`: la fase lee
`focus/reasoning_effort/evidence/acceptance/risk_controls` y ajusta su comportamiento.

> **Modos Full y Consolidado.** En **modo Full** (por defecto) cada fase produce un artefacto
> independiente `NN-<phase>.md`. En **modo Consolidado** (casos triviales/localizados) cada fase
> escribe o actualiza una subsección del `case.md`. El modo elegido (`case_mode`) está registrado
> en el bloque YAML canónico de `case.md`. El rango de `NN` pasa de `01..10` a `01..18` (los
> números 09 y 10 están vacantes; las fases son 16).

### 7.1 Fase 01 — Observación (`sm-phase-observation`)

- **Propósito:** capturar el estado observable del sistema y los síntomas sin interpretarlos.
- **Entradas:** solicitud del usuario; acceso a código, logs, métricas, tests, issues.
- **Salidas / artefacto:** `01-observation.md` — hechos observados, contexto, alcance, no-interpretación.
- **Validación:** hechos verificables y fechados; ninguna causa asumida; alcance delimitado.
- **Adaptación por perfil:** ver `phase_policy.observation` en §6.
- **Cambios respecto a v1.0:** ninguno.

### 7.2 Fase 02 — Definición del problema (`sm-phase-problem-definition`)

- **Propósito:** convertir las observaciones en un enunciado de problema preciso y acotado.
- **Entradas:** `01-observation.md`.
- **Salidas / artefacto:** `02-problem-definition.md` — enunciado, criterios de "resuelto", límites,
  impacto, severidad.
- **Validación:** problema falsable y medible; criterio de éxito explícito; no mezcla varios
  problemas.
- **Adaptación por perfil:** ver `phase_policy.problem-definition` en §6.
- **Cambios respecto a v1.0:** ninguno.

### 7.3 Fase 03 — Investigación (`sm-phase-research`)

- **Propósito:** reunir conocimiento previo relevante (código, docs, historial, literatura) **y
  aplicar el protocolo de recall** sobre la base de conocimiento.
- **Entradas:** `02-problem-definition.md`; la base de conocimiento (índice `MEMORY.md`; recall
  explícito).
- **Salidas / artefacto:** `03-research.md` — hallazgos, código relacionado, antecedentes, lecciones
  recuperadas (con enlace), restricciones.
- **Validación:** fuentes citadas y localizables; cobertura suficiente del área afectada; recall
  ejecutado por los tags pertinentes.
- **Adaptación por perfil:** ver `phase_policy.research` en §6.
- **Cambios respecto a v1.0:** ninguno.

### 7.4 Fase 04 — Formulación de hipótesis de causa (`sm-phase-hypothesis`)

- **Propósito:** proponer una o más hipótesis falsables que expliquen el problema o el cambio.
- **Entradas:** `02`, `03`.
- **Salidas / artefacto:** `04-hypothesis.md` — hipótesis priorizadas, predicción de cada una,
  criterio de refutación.
- **Validación:** cada hipótesis es falsable y tiene predicción observable; priorización justificada.
- **Adaptación por perfil:** ver `phase_policy.hypothesis` en §6.
- **Cambios respecto a v1.0:** ninguno. Esta fase es la que **dispara el Bucle A** (refutación
  interna de causa) si 08 refuta.

### 7.5 Fase 05 — Diseño experimental de causa (`sm-phase-experiment-design`)

- **Propósito:** diseñar el experimento que confirma o refuta la hipótesis de causa con mínimo
  riesgo.
- **Entradas:** `04`.
- **Salidas / artefacto:** `05-experiment-design.md` — procedimiento, variables, controles,
  criterio de éxito/fracaso, plan de rollback.
- **Validación:** experimento reproducible; controles definidos; rollback explícito; coste acotado.
- **Adaptación por perfil:** ver `phase_policy.experiment-design` en §6.
- **Cambios respecto a v1.0:** ninguno.

### 7.6 Fase 06 — Ejecución del experimento de causa (`sm-phase-experiment-execution`)

- **Propósito:** ejecutar el experimento diseñado sin desviarse del protocolo.
- **Entradas:** `05`.
- **Salidas / artefacto:** `06-experiment-execution.md` — comandos ejecutados, cambios aplicados,
  desviaciones, logs crudos.
- **Validación:** se siguió el diseño; desviaciones documentadas; entorno registrado; reversible.
- **Adaptación por perfil:** ver `phase_policy.experiment-execution` en §6.
- **Cambios respecto a v1.0:** ninguno.

### 7.7 Fase 07 — Recolección de datos de causa (`sm-phase-data-collection`)

- **Propósito:** capturar de forma estructurada los datos producidos por la ejecución.
- **Entradas:** `06`.
- **Salidas / artefacto:** `07-data-collection.md` — datos normalizados, métricas, resultados de
  tests, antes/después.
- **Validación:** datos trazables a la ejecución; unidades y condiciones registradas; sin edición de
  resultados crudos.
- **Adaptación por perfil:** ver `phase_policy.data-collection` en §6.
- **Cambios respecto a v1.0:** ninguno.

### 7.8 Fase 08 — Análisis de causa (`sm-phase-analysis`)

- **Propósito:** interpretar los datos frente a la hipótesis de causa y al criterio de éxito.
- **Entradas:** `04`, `07`.
- **Salidas / artefacto:** `08-analysis.md` — sección `## Causa confirmada` con veredicto explícito,
  magnitud del efecto, amenazas a la validez, efectos secundarios.
- **Validación:** conclusión soportada por los datos; alternativas consideradas; límites
  declarados; la sección `## Causa confirmada` existe y nombra la causa ganadora.
- **Adaptación por perfil:** ver `phase_policy.analysis` en §6.
- **Cambios respecto a v1.0 (NUEVO):** la sección `## Causa confirmada` es ahora **obligatoria**
  para que la cadena de solución abra (ver §5.2). Si 08 no la contiene, el orquestador salta la
  cadena de solución y emite "no resuelto" en 17. El formato de la sección es
  `## Causa confirmada: <enunciado breve>` seguido de la justificación.

### 7.9 Fase 11 — Investigación del espacio de soluciones (`sm-phase-solution-research`)

- **Propósito:** mapear el espacio de **todas** las soluciones posibles para la causa confirmada en
  08. Recopilar alternativas, frameworks, patrones y lecciones relevantes.
- **Entradas:** `08-analysis.md` (sección `## Causa confirmada`); `11` aplica el protocolo de recall
  sobre la base de conocimiento, esta vez con foco en **soluciones** (mismo mecanismo, espacio de
  búsqueda distinto).
- **Salidas / artefacto:** `11-solution-research.md` — mapa de soluciones candidatas con
  descripciones, fuentes, trade-offs predichos, lecciones citadas.
- **Validación:** ≥2 soluciones viables enumeradas; cada candidata con descripción y trade-offs
  predichos; recall ejecutado por tags `component`/`defect-class`; lecciones citadas como
  antecedentes.
- **Adaptación por perfil:** ver `phase_policy.solution-research` en §6.
- **Idempotencia:** la fase 11 es **idempotente**: re-ejecutada (por ejemplo, tras un Bucle B
  extenso) no destruye el mapa del espacio, sino que lo amplía con nuevas candidatas.

### 7.10 Fase 12 — Formulación de hipótesis de solución (`sm-phase-solution-hypothesis`)

- **Propósito:** para cada solución viable de 11, formular una hipótesis falsable con predicción
  observable y criterio de refutación.
- **Entradas:** `11-solution-research.md`.
- **Salidas / artefacto:** `12-solution-hypothesis.md` — hipótesis de solución priorizadas, cada
  una con predicción observable, criterio de refutación y trade-off dominante.
- **Validación:** ≥1 hipótesis falsable; cada hipótesis con predicción observable; priorización
  justificada por la política del perfil.
- **Adaptación por perfil:** ver `phase_policy.solution-hypothesis` en §6.
- **Idempotencia:** la fase 12 es **idempotente**: re-ejecutada por el Bucle B (refutación
  interna de solución, ver §3.1.2), appende nuevas hipótesis y marca las refutadas como
  `superseded` con su razón de descarte.

### 7.11 Fase 13 — Diseño experimental comparativo (`sm-phase-solution-experiment-design`)

- **Propósito:** diseñar un **único experimento comparativo** que cubra todas las hipótesis de 12
  con métricas comunes, condiciones iniciales idénticas y plan de rollback entre ejecuciones.
- **Entradas:** `12-solution-hypothesis.md`.
- **Salidas / artefacto:** `13-solution-experiment-design.md` — procedimiento único con sub-secciones
  por hipótesis, métricas comunes, condiciones iniciales idénticas, plan de rollback entre
  ejecuciones, criterios de aceptación por hipótesis.
- **Validación:** un único procedimiento cubre todas las hipótesis; las métricas son comparables
  entre hipótesis; el rollback está definido para volver al estado pre-cada-hipótesis; las
  condiciones iniciales son idénticas para todas las hipótesis.
- **Adaptación por perfil:** ver `phase_policy.solution-experiment-design` en §6.

### 7.12 Fase 14 — Ejecución secuencial de hipótesis (`sm-phase-solution-execution`)

- **Propósito:** ejecutar las hipótesis de 12 **secuencialmente** en orden de prioridad, con
  rollback explícito entre ejecuciones.
- **Entradas:** `13-solution-experiment-design.md`.
- **Salidas / artefacto:** `14-solution-execution.md` — sub-entradas por hipótesis, comandos
  ejecutados, cambios aplicados, desviaciones, logs crudos, verificación de rollback entre
  ejecuciones. Los datos crudos por hipótesis se almacenan en
  `experiments/solution-<id>/<hypothesis-id>/`.
- **Validación:** ejecuciones en orden de prioridad; rollback probado entre hipótesis; desviaciones
  documentadas; logs crudos en disco.
- **Adaptación por perfil:** ver `phase_policy.solution-execution` en §6.

### 7.13 Fase 15 — Recolección y normalización de datos (`sm-phase-solution-data-collection`)

- **Propósito:** capturar y **normalizar** las métricas de cada hipótesis a un schema común.
- **Entradas:** `14-solution-execution.md` (más los crudos en `experiments/solution-<id>/`).
- **Salidas / artefacto:** `15-solution-data-collection.md` con la **tabla comparativa de
  métricas**: filas = hipótesis, columnas = métricas normalizadas (latencia, exit code, estado
  final, efectos secundarios, y la métrica dominante del perfil).
- **Validación:** cada hipótesis tiene una fila; las métricas son del mismo tipo por columna (no
  se mezclan escalas); las unidades y condiciones están registradas; las celdas sin dato están
  explícitamente marcadas (no son cero).
- **Adaptación por perfil:** ver `phase_policy.solution-data-collection` en §6.

### 7.14 Fase 16 — Análisis comparativo y veredicto (`sm-phase-solution-analysis`)

- **Propósito:** comparar trade-offs entre hipótesis de 12 según la tabla de 15. Emitir veredicto
  de **solución ganadora** con justificación cuantitativa + lista de hipótesis descartadas con
  razón de descarte.
- **Entradas:** `12-solution-hypothesis.md`, `15-solution-data-collection.md`.
- **Salidas / artefacto:** `16-solution-analysis.md` con **sección obligatoria
  `## Solución ganadora`** y sección obligatoria `## Hipótesis descartadas`. La sección ganadora
  incluye: nombre de la ganadora, métricas comparativas clave, justificación cuantitativa, diff
  predicho. La sección de descartadas incluye: nombre, métricas, razón de descarte.
- **Validación:** la sección `## Solución ganadora` existe y cita al menos una métrica
  cuantitativa; la sección `## Hipótesis descartadas` existe y cada descarte cita su razón; no
  existen ganadoras con cero evidencia.
- **Adaptación por perfil:** ver `phase_policy.solution-analysis` en §6.
- **Precondición del cierre:** la sección `## Solución ganadora` es la **única** fuente que la fase
  17 consulta para emitir la spec (ver §5.3).

### 7.15 Fase 17 — Conclusión (`sm-phase-conclusion`)

- **Propósito:** decidir el resultado del caso y la acción resultante, y **destilar una lección
  generalizable** hacia la base de conocimiento.
- **Entradas:** `02`, `08` (causa), **`16` (solución — NUEVO)**, `case_paused_at` (si existe).
- **Salidas / artefacto:** `17-conclusion.md` — veredicto, decisión (aplicar/revertir/escalar),
  residuos, deuda, seguimiento; y **una lección** escrita como archivo bajo `.claude/memory/`
  (frontmatter + tags `component`/`defect-class`/`profile`, índice en `MEMORY.md`).
- **Precondición crítica (NUEVA):** si la fase 11 se ejecutó, la sección `## Solución ganadora` de
  `16-solution-analysis.md` debe existir y citar la ganadora. Sin esa sección, 17 emite "no
  resuelto" o "diferido" (ver §5.3).
- **Caso pausado (NUEVO):** si el veredicto es "no resuelto", 17 fija `case_paused_at` en el bloque
  canónico de `case.md` y deja el caso en estado `pausado`. La lección se escribe igual (es
  aprendizaje no derivable).
- **Validación:** veredicto coherente con el análisis; criterio de la fase 02 contrastado; acciones
  accionables; lección con tags que permitan el recall; la spec solo se emite si la solución
  ganadora existe.
- **Adaptación por perfil:** ver `phase_policy.conclusion` en §6.
- **Cambios respecto a v1.0:** consume datos de **ambas cadenas**; la spec validada se cita desde
  `16`, no desde la primera idea del agente.

### 7.16 Fase 18 — Comunicación (`sm-phase-communication`)

- **Propósito:** producir la comunicación final para humanos (PR, changelog, informe, commit).
- **Entradas:** `17` y la cadena completa (causa + solución).
- **Salidas / artefacto:** `18-communication.md` — resumen ejecutivo, cambios, evidencia, riesgos,
  enlaces a artefactos; borrador de mensaje de commit/PR (en español, conventional commits del
  repo) **con metadatos de commit `Case: <case-id>`**.
- **Cambios respecto a v1.0 (NUEVO):** el mensaje de commit cita explícitamente la solución
  ganadora de 16 (no el primer fix que apareció); si la fase 17 pausó el caso, 18 emite
  comunicación de "no resuelto" con la lección y la oferta de re-apertura del Bucle C.
- **Changelog derivado:** sin cambios respecto a v1.0 — esta fase **no redacta** el
  `CHANGELOG.md` a mano; ejecuta el generador on-demand con `--pending` e incluye el archivo en su
  commit.
- **Validación:** autocontenida; enlaza evidencia de **ambas cadenas**; audiencia correcta; sin
  afirmaciones no soportadas; el borrador de commit incluye los metadatos de commit `Case:`.
- **Adaptación por perfil:** ver `phase_policy.communication` en §6.

Las 6 fases de la cadena de solución son ortogonales a las 6 fases de causa con el mismo ordinal
(03↔11, 04↔12, 05↔13, 06↔14, 07↔15, 08↔16). No comparten artefactos ni skills: cada fase de
solución tiene su propio `SKILL.md` y su propio artefacto. La cadena de causa no contamina la de
solución, y viceversa. La separación física de las dos cadenas es la inversión del bug que tenía
el modelo de "1 cadena con modos internos" (fases que bifurcaban su lógica internamente).

---

## 8. Artefactos

### 8.1 Convención de nombres y ubicación

- Carpeta por caso: `maintenance-cases/<case-id>/` donde `case-id = YYYYMMDD-<slug>` (p. ej.
  `20260606-login-timeout`). Si la carpeta ya existe, añadir sufijo incremental: `-2`, `-3`, etc.
- Manifest del expediente: `case.md` (contiene el bloque YAML canónico con `case_mode`,
  `phase_policy`, `phases`, `case_paused_at`).
- **Modo Full** (por defecto): artefactos de fase como archivos individuales `NN-<phase>.md` con
  `NN` ∈ `01..18`. Los números 09 y 10 ya no se usan (fueron renumerados a 17 y 18; el rango
  efectivo es 16 fases).
- **Modo Consolidado** (casos triviales/localizados): sin archivos `NN-*.md` independientes; cada
  fase escribe o actualiza una subsección `## NN — <Phase>` dentro del propio `case.md`.
- La elección de modo la hace el orquestador en el paso de clasificación y queda registrada en
  `case_mode`.

### 8.2 Formato

Markdown con **frontmatter YAML** obligatorio + cuerpo estructurado. El `case.md` contiene además
un **bloque YAML canónico** machine-readable (sección "Canonical state") que es la **única fuente
de estado del caso**: incluye `case_mode`, `phase_policy` (16 entries), `phases` (16 entries),
`case_paused_at` (opcional, ISO-8601 UTC). La validación del esquema de este bloque es un **paso
obligatorio** del orquestador. Frontmatter de un **artefacto de fase** (modo Full) en el sistema
nuevo:

```yaml
---
case_id: 20260606-login-timeout
profile: corrective
phase: 16-solution-analysis          # 01..18
chain: solution                      # NUEVO — cause | solution | closure
version: v1.0
timestamp: 2026-06-06T14:32:00Z
status: done                         # pending | in_progress | done | superseded
inputs: [12-solution-hypothesis.md, 15-solution-data-collection.md]
produces: 16-solution-analysis.md
links:
  previous: 15-solution-data-collection.md
  next: 17-conclusion.md
---
```

El campo `chain` (NUEVO) es opcional pero recomendado. Valores: `cause` (fases 01–08), `solution`
(fases 11–16), `closure` (fases 17–18). El orquestador lo infiere del número de fase si está
ausente, pero escribirlo explícito facilita la auditoría y la separación física de cadenas.

### 8.3 Contenido mínimo esperado por artefacto

| Artefacto                          | Cadena   | Secciones mínimas                                                                                              |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `case.md`                          | (meta)   | Caso, perfil, parámetros del perfil, bloque YAML canónico (`case_mode` + `phase_policy` 16 entries + `phases` 16 entries + `case_paused_at`), veredicto |
| `01-observation.md`                | Causa    | Hechos observados, contexto, alcance, lo que NO se interpreta                                                  |
| `02-problem-definition.md`         | Causa    | Enunciado, criterio de "resuelto", límites, severidad                                                          |
| `03-research.md`                   | Causa    | Hallazgos con fuentes (`file:línea`/URL/commit), restricciones                                                 |
| `04-hypothesis.md`                 | Causa    | Hipótesis priorizadas, predicción, criterio de refutación                                                      |
| `05-experiment-design.md`          | Causa    | Procedimiento, variables, controles, éxito/fracaso, rollback                                                   |
| `06-experiment-execution.md`       | Causa    | Comandos, cambios, desviaciones, logs crudos                                                                   |
| `07-data-collection.md`            | Causa    | Datos normalizados, métricas, antes/después                                                                    |
| `08-analysis.md`                   | Causa    | `## Causa confirmada` (obligatoria), veredicto, magnitud, amenazas a la validez                                |
| `11-solution-research.md`          | Solución | Mapa de soluciones candidatas, fuentes, trade-offs predichos, lecciones citadas                                |
| `12-solution-hypothesis.md`        | Solución | Hipótesis de solución priorizadas, predicción, criterio de refutación, trade-off dominante                     |
| `13-solution-experiment-design.md` | Solución | Procedimiento único comparativo, métricas comunes, condiciones iniciales idénticas, rollback entre ejecuciones |
| `14-solution-execution.md`         | Solución | Sub-entradas por hipótesis, comandos, cambios, rollback, logs crudos (en `experiments/solution-<id>/`)        |
| `15-solution-data-collection.md`   | Solución | Tabla comparativa de métricas (filas = hipótesis, columnas = métricas normalizadas)                            |
| `16-solution-analysis.md`          | Solución | `## Solución ganadora` (obligatoria) + `## Hipótesis descartadas` (obligatoria)                                 |
| `17-conclusion.md`                 | Cierre   | Veredicto, decisión, residuos, deuda, seguimiento; cita la solución ganadora de 16 si existe                   |
| `18-communication.md`              | Cierre   | Resumen, cambios, evidencia, riesgos, borrador de commit/PR con metadatos `Case:`                              |

### 8.4 Convención de versionado

- `version: vMAJOR.MINOR` en frontmatter. Sin cambios respecto a v1.0.
- **MINOR** se incrementa al reejecutar una fase (refinamiento sobre los mismos insumos).
- **MAJOR** se incrementa si cambian los insumos aguas arriba (la fase se rehace desde cero).
- Un artefacto reemplazado pasa a `status: superseded` y la nueva versión enlaza al anterior en
  `links.previous_version`.
- En el **Bucle A**, los artefactos 04–08 de la hipótesis refutada se marcan `superseded`; en el
  **Bucle B**, los artefactos 12–16 de la solución refutada se marcan `superseded`. En ambos casos
  la nueva versión incrementa MAJOR (los insumos aguas arriba cambiaron).

### 8.5 Relación entre artefactos y auditoría posterior

La cadena **causa 01–08 + solución 11–16 + cierre 17–18** más `case.md` constituye el **expediente
del caso**. La separación física de las dos cadenas hace que la trazabilidad sea **bidimensional**:

- **Eje horizontal (por cadena):** cada cadena se audita independientemente. La cadena de causa
  se recorre de 01 a 08; la cadena de solución se recorre de 11 a 16.
- **Eje vertical (entre cadenas):** la frontera "causa confirmada" (sección `## Causa confirmada` de
  08) conecta ambos ejes. La frontera "solución ganadora" (sección `## Solución ganadora` de 16)
  cierra el expediente hacia 17.

Una auditoría posterior puede:

1. Abrir `case.md` para ver perfil, veredicto, estado, `case_paused_at` (si existe).
2. Recorrer la cadena de causa (01→08) hasta `## Causa confirmada`.
3. Si la cadena de solución abrió (11→16), recorrerla hasta `## Solución ganadora`.
4. Verificar que la fase 17 cita la ganadora de 16 (no el primer fix del agente).
5. Derivar el registro de casos (filesystem + changelog) y consultar `CHANGELOG.md` con el
   metadatos de commit `Case:` para detectar patrones entre casos.

---

## 9. Memoria, changelog y hooks

Principio rector: **estado derivado sobre estado duplicado** (heredado de v1.0 §2.5.1). El
changelog y el registro de casos se **derivan** de fuentes de verdad existentes (commits,
filesystem); solo las **lecciones** se persisten deliberadamente, con un dueño único.

### 9.1 Memoria en dos niveles + protocolo de recall

**(a) Base de conocimiento (lecciones) — persistida deliberadamente.**
Una lección por archivo bajo `.claude/memory/`, con `MEMORY.md` como índice (una línea por
lección). Claude Code **no** carga `MEMORY.md` automáticamente; el recall es un paso explícito.
**NUEVO en el sistema de dos cadenas:** el recall se aplica en **dos puntos**:

- **Fase 03 (cadena de causa):** recall por tags `component`/`defect-class`/`profile` para
  antecedentes sobre el problema.
- **Fase 11 (cadena de solución):** recall por los mismos tags, pero sobre un **espacio de
  búsqueda distinto** — soluciones, no causas. Una misma lección puede aparecer citada en ambos
  puntos (la causa y la solución pueden tener la misma lección como antecedente).

**(b) Registro de casos — derivado, nunca a mano.**
Sin cambios: derivado del filesystem y del changelog (ver §9.2).

**(c) `CLAUDE.md` del subsistema** — instrucciones persistentes. Sin cambios estructurales.

### 9.2 Registro de casos (derivado)

Sin cambios respecto a v1.0. El índice histórico se deriva bajo demanda de `maintenance-cases/`
y `CHANGELOG.md`. El estado del caso en el registro refleja los nuevos campos: `case_mode`,
`case_paused_at`, `case_resumed_at` (cuando aplique).

### 9.3 Changelog (derivado)

Sin cambios respecto a v1.0. El `CHANGELOG.md` se deriva de los commits convencionales mediante
el generador on-demand; la fase 18 (antes 10) lo ejecuta con `--pending` e incluye el archivo en
su commit. Las entradas siguen preservando los metadatos de commit `Case:`.

### 9.4 Generador on-demand vs git hook para el changelog

Sin cambios respecto a v1.0. El generador se invoca desde la fase 18; no se usa `post-commit` con
`--amend`. La fase 18 (no la 17) ejecuta el generador, porque la fase 17 es la que emite la spec
y la fase 18 es la que produce la comunicación final (incluyendo el commit).

### 9.5 Estado `pausado` del caso (NUEVO)

La cadena de causa puede **no** confirmar una causa (Bucle A agotado) o la cadena de solución
puede **no** emitir un veredicto (Bucle B agotado, o fase 11 sin soluciones viables). En ambos
casos la fase 17 emite "no resuelto" + lección + estado `pausado`. El nuevo estado `pausado` se
modela así en el bloque canónico de `case.md`:

```yaml
# Bloque canónico (extensión):
status: pausado            # in_progress | pausado | done | aborted
case_paused_at: 2026-06-08T15:42:00Z   # ISO-8601 UTC, vacío si no aplica
case_resumed_at: ""                     # ISO-8601 UTC, vacío si no se ha re-abierto
```

Reglas:

- **Transición a `pausado`:** solo la fase 17 puede fijar `status: pausado` y poblar
  `case_paused_at`. La transición va siempre acompañada de una lección (incluso si "no resuelto"
  es aprendizaje).
- **Transición a `in_progress` (re-apertura, Bucle C):** el orquestador, al recibir la confirmación
  del usuario, fija `case_resumed_at` con el timestamp actual, mueve `status` a `in_progress` y
  re-ejecuta 03–08 (no 01–02). El par pausa/re-apertura se preserva en el expediente.
- **Múltiples pausas:** permitidas. El expediente puede tener varios pares `case_paused_at` /
  `case_resumed_at` (el último es el vigente); el historial completo se conserva en commits
  git del caso.
- **Cadena de solución y Bucle C:** la cadena de solución (11–16) **nunca** se abre dentro del
  Bucle C. Aunque la causa se confirme tras una re-apertura, la cadena de solución abre en una
  **corrida posterior** del caso, no en la misma. Esto evita mezclar dos ciclos de vida en el
  mismo expediente.
- **Estados terminales:** `done` (caso cerrado con éxito) y `aborted` (caso cancelado
  explícitamente por el usuario) son terminales. Un caso `pausado` no es terminal.

---

## 10. Ejemplos de uso

Cada ejemplo muestra: entrada inicial, perfil seleccionado, fases 01–08 (cadena de causa),
confirmación de causa, fases 11–16 (cadena de solución), fase 17 (conclusión con spec citada desde
16) y fase 18 (comunicación con commit). Los cuatro ejemplos usan **modo Full** (los más
representativos para documentar el flujo completo). Un caso trivial usaría **modo Consolidado**.

El caso `20260607-clean-modules-windows` (ya documentado en el sistema v1.0) **NO** se usa como
ejemplo del nuevo diseño porque fue ejecutado con el workflow antiguo (1 cadena con modos).
Sirve como evidencia del gap que el nuevo diseño corrige, no como ejemplo del flujo nuevo.

### 10.1 Caso Corrective

- **Entrada:** _"El login falla con timeout intermitente desde ayer; hay un 500 en producción."_
- **Perfil seleccionado:** `corrective` (señal: fallo presente + regresión reciente).
- **Modo:** `full`.

**Cadena de causa (01–08):**

| Fase             | Resultado clave                                                                | Artefacto                    |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| 01 Observación   | 500 intermitente; pico de latencia en `auth/session.ts`                         | `01-observation.md`          |
| 02 Definición    | "login devuelve 500 cuando la conexión al store supera 2s"                     | `02-problem-definition.md`   |
| 03 Investigación | commit reciente cambió el timeout del pool `session.ts:88`; recall ejecutado   | `03-research.md`             |
| 04 Hipótesis     | "el pool agota conexiones por timeout mal configurado"                         | `04-hypothesis.md`           |
| 05 Diseño        | test que reproduce timeout bajo carga; rollback = revertir commit               | `05-experiment-design.md`    |
| 06 Ejecución     | test rojo reproduce el 500; aplicar fix de pool                                | `06-experiment-execution.md` |
| 07 Datos         | test rojo→verde; latencia p99 normalizada                                      | `07-data-collection.md`      |
| 08 Análisis      | **Causa confirmada:** "pool de conexiones con timeout mal configurado"; sin regresiones en suite | `08-analysis.md`             |

**Cadena de solución (11–16):** (la causa está confirmada, la cadena abre)

| Fase                              | Resultado clave                                                                  | Artefacto                              |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| 11 Investigación de soluciones    | 3 candidatas: (A) restaurar valor de timeout, (B) aumentar pool size, (C) migrar a otro driver | `11-solution-research.md`              |
| 12 Hipótesis de solución          | A: reversibilidad total + diff mínimo; B: requiere tuning empírico; C: cambio amplio | `12-solution-hypothesis.md`            |
| 13 Diseño experimental            | experimento comparativo con test de no-regresión obligatorio; rollback por flag  | `13-solution-experiment-design.md`     |
| 14 Ejecución                      | A: test verde; B: test verde pero requiere ajustar timeout distinto; C: test verde pero introduce latencia de cold start | `14-solution-execution.md`             |
| 15 Datos                          | tabla: A pasa no-regresión con diff 1 línea, B pasa con diff 5 líneas + tuning, C pasa con diff 200 líneas + nueva dependencia | `15-solution-data-collection.md`       |
| 16 Análisis                       | **Solución ganadora: A** (justificación cuantitativa: diff mínimo, no-regresión, reversibilidad total) | `16-solution-analysis.md`              |

**Cierre global (17–18):**

| Fase              | Resultado clave                                                                                          | Artefacto            |
| ----------------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| 17 Conclusión     | veredicto: aplicar solución A (citada desde 16); decisión: aplicar + añadir test de carga al CI; lección: `connection-pool-timeout-regressions` (tags: `auth`/`connection-pool`/`corrective`) | `17-conclusion.md`   |
| 18 Comunicación   | PR `fix(auth): restaurar timeout del pool` con metadatos de commit `Case:`; changelog derivado (Fixed)   | `18-communication.md`|

- **Artefactos del caso:** `maintenance-cases/20260606-login-timeout/case.md` + `01..08-*.md` +
  `11..16-*.md` + `17..18-*.md` (18 artefactos, 9 por cadena).
- **Commit (fuente de verdad):**

```text
fix(auth): restaurar timeout del pool de conexiones en login

El pool agotaba conexiones por un timeout mal configurado introducido en
session.ts:88, devolviendo 500 intermitentes. Se restaura el valor (solución
ganadora del análisis comparativo de 16-solution-analysis.md) y se añade
un test de carga al CI.

Case: 20260606-login-timeout
```

- **Changelog (derivado por generador on-demand):**

```markdown
### Fixed

- restaurar timeout del pool de conexiones en login (Case: 20260606-login-timeout)
```

- **Lección:** `.claude/memory/connection-pool-timeout-regressions.md` con tags
  `component: auth`, `defect-class: connection-pool`, `profile: corrective`.
- **Salida final:** fix verificado por test de reproducción, **elegido por análisis comparativo
  de la fase 16** (no por la primera idea del agente), cero regresiones, PR con expediente
  enlazado; el registro de casos y el changelog quedan **derivados**.

### 10.2 Caso Adaptive

- **Entrada:** _"Hay que migrar de la API v1 de pagos a la v2 antes de su deprecación."_
- **Perfil:** `adaptive` (señal: cambio externo / deprecación).

**Cadena de causa (01–08):**

| Fase | Resultado clave                                                | Artefacto                    |
| ---- | -------------------------------------------------------------- | ---------------------------- |
| 01   | uso de v1 en `payments/*`; fecha de deprecación                | `01-observation.md`          |
| 02   | "soportar v2 manteniendo contrato público de `PaymentService`" | `02-problem-definition.md`   |
| 03   | diferencias v1↔v2; breaking changes; recall ejecutado         | `03-research.md`             |
| 04   | "adaptador v2 detrás de feature flag mantiene compatibilidad"  | `04-hypothesis.md`           |
| 05   | contract tests v1 y v2; rollback = flag off                    | `05-experiment-design.md`    |
| 06   | implementar adaptador; ejecutar ambos contract tests           | `06-experiment-execution.md` |
| 07   | matriz de compatibilidad v1/v2 verde                           | `07-data-collection.md`      |
| 08   | **Causa confirmada:** "el contrato público se preserva con adaptador v2 detrás de flag" | `08-analysis.md`             |

**Cadena de solución (11–16):**

| Fase                              | Resultado clave                                                                  | Artefacto                              |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| 11 Investigación de soluciones    | 3 candidatas: (A) adaptador único, (B) proxy + caché, (C) reescritura directa      | `11-solution-research.md`              |
| 12 Hipótesis de solución          | A: reversible; B: añade latencia; C: rompe contrato                               | `12-solution-hypothesis.md`            |
| 13 Diseño experimental            | contract tests v1 y v2; rollback = flag off                                       | `13-solution-experiment-design.md`     |
| 14 Ejecución                      | A: verdes; B: verdes con +12ms p99; C: contract v1 rojo                           | `14-solution-execution.md`             |
| 15 Datos                          | tabla: A pasa con diff 80 líneas, B pasa con diff 200 líneas + latencia, C falla contract v1 | `15-solution-data-collection.md`       |
| 16 Análisis                       | **Solución ganadora: A** (reversible, contrato intacto, sin latencia añadida)     | `16-solution-analysis.md`              |

**Cierre global (17–18):** 17 emite veredicto "aplicar A con flag" + lección
`api-migration-behind-flag`; 18 redacta commit `feat(payments): adaptar a API v2 detrás de
feature flag` con metadatos `Case:` y guía de migración adjunta.

### 10.3 Caso Perfective

- **Entrada:** _"El endpoint de reporting tarda 4s; hay que optimizarlo."_
- **Perfil:** `perfective`.

**Cadena de causa (01–08):** observación (p95 = 4.1s) → definición (umbral: p95 < 1s sin cambiar
salida) → investigación (recall N+1) → hipótesis (batching reduce el tiempo) → diseño (benchmark
A/B) → ejecución → datos (p95 4.1s → 0.7s) → análisis (**Causa confirmada:** "N+1 queries en
`report.repository.ts`").

**Cadena de solución (11–16):** 3 candidatas: (A) batching + índice, (B) cache de agregación, (C)
SQL nativo optimizado. 12 prioriza A (cuantificable). 13 diseña benchmark A/B con 50 runs.
14 ejecuta: A reduce p95 a 0.7s, B reduce a 1.2s, C reduce a 0.9s. 15 normaliza. 16 emite
**Solución ganadora: A** (p95 −83 %, varianza mínima, sin cambio funcional).

**Cierre global (17–18):** 17 acepta A con benchmark reproducible; 18 redacta
`perf(reports): batching de queries` con números y metadatos `Case:`.

### 10.4 Caso Preventive

- **Entrada:** _"Auditemos el manejo de errores del gateway antes de la próxima release."_
- **Perfil:** `preventive`.

**Cadena de causa (01–08):** observación (rutas sin manejo de error) → definición (evitar caídas
no controladas) → investigación (recall `unhandled-rejection`) → hipótesis (promesa sin catch
tumba el proceso) → diseño (prueba que inyecta fallo upstream en sandbox) → ejecución → datos
(antes: crash; después con guardas: error contenido) → análisis (**Causa confirmada:** "promesas
sin catch en upstream tumban el proceso").

**Cadena de solución (11–16):** 3 candidatas: (A) error boundary global, (B) try/catch por ruta,
(C) combinación A + cobertura de tests. 12 prioriza A por cobertura amplia. 13 diseña pruebas
que inyectan fallo en cada ruta. 14 ejecuta: A cubre 100% de las rutas probadas, B cubre 60%, C
cubre 100% pero con más código. 15 normaliza cobertura. 16 emite **Solución ganadora: A**
(cobertura completa con menor diff).

**Cierre global (17–18):** 17 aplica A y cuantifica residual (paths no cubiertos = backlog);
18 redacta `fix(gateway): error boundary` con nota de riesgo residual y metadatos `Case:`.

### 10.5 Ejemplo de caso "no resuelto" con pausa y re-apertura

- **Entrada:** _"Hay un fallo intermitente en el endpoint `/orders` que no reproduce en local."_
- **Perfil:** `corrective`.
- **Modo:** `full`.

**Cadena de causa (01–08):**

| Fase | Resultado clave                                                                                     | Artefacto                    |
| ---- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| 01   | 500 intermitente en `/orders`; logs inconsistentes                                                   | `01-observation.md`          |
| 02   | "el endpoint `/orders` falla intermitentemente bajo carga, sin patrón reproducible en local"         | `02-problem-definition.md`   |
| 03   | recall: 2 lecciones de `connection-pool` y `unhandled-rejection`; cobertura de tests de carga ausente | `03-research.md`             |
| 04   | hipótesis 1: pool exhaustion; hipótesis 2: promesa sin catch en middleware; hipótesis 3: race en cache | `04-hypothesis.md`           |
| 05   | experimento para H1: test de carga; sin reproducción                                                 | `05-experiment-design.md`    |
| 06   | test ejecutado: no reproduce                                                                        | `06-experiment-execution.md` |
| 07   | sin datos concluyentes                                                                              | `07-data-collection.md`      |
| 08   | **Causa NO confirmada** — H1 refutada; queda pasar a H2                                             | `08-analysis.md`             |

**Bucle A — primera vuelta:** 04 re-ejecuta con H2 ("promesa sin catch").

| Fase | Resultado clave                                                                                     | Artefacto                    |
| ---- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| 04   | H2 priorizada                                                                                       | `04-hypothesis.md` (v2, H1 superseded) |
| 05   | experimento H2: inyección de rechazo en middleware                                                  | `05-experiment-design.md` (v2)         |
| 06   | ejecutado: el proceso se cae, pero la traza no apunta al middleware                                 | `06-experiment-execution.md` (v2)      |
| 07   | datos inconsistentes                                                                                | `07-data-collection.md` (v2)            |
| 08   | **Causa NO confirmada** — H2 refutada                                                                | `08-analysis.md` (v2, H2 superseded)    |

**Bucle A — segunda vuelta:** 04 re-ejecuta con H3.

| Fase | Resultado clave                                                                                     | Artefacto                    |
| ---- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| 04   | H3 priorizada                                                                                       | `04-hypothesis.md` (v3, H1+H2 superseded) |
| 05–08 | experimento no concluyente; H3 refutada por falta de patrón                                          | ...                          |

**Cadena de solución: NO ABRE** (precondición §5.2 — `08-analysis.md` no contiene
`## Causa confirmada`).

**Cierre global con pausa (17–18):**

| Fase | Resultado clave                                                                                     | Artefacto                    |
| ---- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| 17   | veredicto: "no resuelto"; `status: pausado`; `case_paused_at: 2026-06-08T16:30:00Z`; lección: `intermittent-failures-no-repro` (qué aprendimos: el recall no fue suficiente; falta instrumentación en producción) | `17-conclusion.md`           |
| 18   | comunicación: caso pausado, oferta al usuario de re-apertura con nuevo contexto (instrumentación adicional, log sampling, datos de producción) | `18-communication.md`        |

**Bucle C — re-apertura:** el usuario acepta re-abrir; el orquestador fija
`case_resumed_at: 2026-06-09T09:15:00Z` y re-ejecuta **03–08** con el nuevo contexto (recall
ampliado + acceso a logs de producción):

| Fase | Resultado clave                                                                                     | Artefacto                    |
| ---- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| 03   | recall ampliado; nueva lección citada sobre `clock-skew` en cluster; logs de producción muestreados | `03-research.md` (v2)        |
| 04   | hipótesis 4: clock skew entre nodos del cluster genera timestamps duplicados en cache                | `04-hypothesis.md` (v4)      |
| 05   | experimento H4: forzar clock skew en cluster de pruebas; rollback trivial                            | `05-experiment-design.md` (v3) |
| 06   | ejecutado: el endpoint falla con el mismo patrón                                                    | `06-experiment-execution.md` (v3) |
| 07   | datos: timestamp duplicado confirmado                                                               | `07-data-collection.md` (v3)  |
| 08   | **Causa confirmada:** "clock skew entre nodos del cluster genera timestamps duplicados en cache"    | `08-analysis.md` (v4)        |

**Cadena de solución abre (en corrida posterior del caso, no en la misma del Bucle C):**

| Fase | Resultado clave                                                                                     | Artefacto                              |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 11   | 3 candidatas: (A) NTP estricto, (B) timestamp lógico, (C) reescritura del cache                     | `11-solution-research.md`              |
| 12–16 | experimento comparativo; **Solución ganadora: A** (justificación cuantitativa)                      | `12..16-*.md`                          |
| 17   | veredicto: aplicar A; cierre definitivo del caso; `status: done`                                     | `17-conclusion.md`                     |
| 18   | commit `fix(orders): sincronización NTP en cluster` con metadatos `Case:`                            | `18-communication.md`                  |

- **Salida final del caso (post re-apertura):** causa confirmada en la segunda vuelta del Bucle A,
  solución elegida por análisis comparativo de la fase 16, expediente completo con dos pausas
  documentadas. El registro de casos y el changelog quedan **derivados**.

---

## 11. Recomendaciones de implementación

### 11.1 Orden de migración

La migración del sistema actual (15 skills: 1 orquestador + 4 perfiles + 10 fases) al sistema
nuevo (1 orquestador modificado + 4 perfiles modificados + 6 skills de solución nuevas + 2 skills
de cierre renumeradas = 23 skills totales) se ejecutará **solo cuando el usuario apruebe este
diseño**. El orden propuesto es:

1. **Añadir las 6 skills `sm-phase-solution-*`** (research, hypothesis, experiment-design,
   execution, data-collection, analysis) bajo `.claude/skills/`. Cada una con su propio
   `SKILL.md` siguiendo el patrón v1.0; cero referencias a modos internos.
2. **Renumerar las 2 skills de cierre:** `sm-phase-conclusion` permanece como fase 17
   (sin cambio de nombre; cambia el número de fase) y `sm-phase-communication` permanece como
   fase 18. Actualizar las referencias internas que apuntaban a "fase 09" o "fase 10".
3. **Actualizar `sm-orchestrator`:** conocer las 16 fases (rango 01..18 con 09-10 vacantes), los
   3 bucles (A, B, C), las precondiciones de cadena (§5.2) y de cierre (§5.3), y el manejo del
   estado `pausado`.
4. **Actualizar los 4 perfiles** (`sm-profile-corrective`, `sm-profile-adaptive`,
   `sm-profile-perfective`, `sm-profile-preventive`) con `phase_policy matrix` de 16 entries
   cada uno (8 de causa + 6 de solución + 2 de cierre).
5. **Actualizar `templates/case.md`:** la `phase_policy` crece de 10 a 16 entries; el bloque
   `phases` crece de 10 a 16 entries; se añaden los campos opcionales `case_paused_at` y
   `case_resumed_at` al bloque canónico.
6. **Actualizar `references/phase-policy-schema.md`:** el campo `phase_policy` admite 16 claves
   válidas (ver §5.4). El schema por entry **no cambia**.
7. **Actualizar `references/artifact-conventions.md`** con el campo opcional `chain` en el
   frontmatter y la nota de que `NN ∈ 01..18` (no `01..10`; con 09-10 vacantes).

### 11.2 Archivos que se modificarán (código fuente embebido en §13)

Los archivos del sistema actual que se tocarán en la migración, con su código fuente
**embebido en §13 de este documento** (no requiere abrir los archivos del sistema actual para
entender el diseño):

| #  | Archivo                                                            | Cambio                                                                              | Código en |
| -- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 1  | `.claude/skills/sm-orchestrator/SKILL.md`                          | 16 fases (rango 01..18), 3 bucles, precondiciones de cadena y cierre, estado `pausado` | §13.5     |
| 2  | `.claude/skills/sm-profile-corrective/SKILL.md`                    | `phase_policy matrix` con 16 entries                                                 | §13.4.1   |
| 3  | `.claude/skills/sm-profile-adaptive/SKILL.md`                      | `phase_policy matrix` con 16 entries                                                 | §13.4.2   |
| 4  | `.claude/skills/sm-profile-perfective/SKILL.md`                    | `phase_policy matrix` con 16 entries                                                 | §13.4.3   |
| 5  | `.claude/skills/sm-profile-preventive/SKILL.md`                    | `phase_policy matrix` con 16 entries                                                 | §13.4.4   |
| 6  | `.claude/skills/sm-phase-observation/SKILL.md` (Fase 01)           | Sin cambios                                                                         | §13.2.1   |
| 7  | `.claude/skills/sm-phase-problem-definition/SKILL.md` (Fase 02)    | Sin cambios                                                                         | §13.2.2   |
| 8  | `.claude/skills/sm-phase-research/SKILL.md` (Fase 03)              | Sin cambios                                                                         | §13.2.3   |
| 9  | `.claude/skills/sm-phase-hypothesis/SKILL.md` (Fase 04)            | Sin cambios                                                                         | §13.2.4   |
| 10 | `.claude/skills/sm-phase-experiment-design/SKILL.md` (Fase 05)     | Sin cambios                                                                         | §13.2.5   |
| 11 | `.claude/skills/sm-phase-experiment-execution/SKILL.md` (Fase 06)  | Sin cambios                                                                         | §13.2.6   |
| 12 | `.claude/skills/sm-phase-data-collection/SKILL.md` (Fase 07)       | Sin cambios                                                                         | §13.2.7   |
| 13 | `.claude/skills/sm-phase-analysis/SKILL.md` (Fase 08)              | Emite la sección `## Causa confirmada` (obligatoria)                                 | §13.2.8   |
| 14 | `.claude/skills/sm-phase-solution-research/SKILL.md` (Fase 11)     | **NUEVO**                                                                          | §13.1.1   |
| 15 | `.claude/skills/sm-phase-solution-hypothesis/SKILL.md` (Fase 12)   | **NUEVO**                                                                          | §13.1.2   |
| 16 | `.claude/skills/sm-phase-solution-experiment-design/SKILL.md` (13) | **NUEVO**                                                                          | §13.1.3   |
| 17 | `.claude/skills/sm-phase-solution-execution/SKILL.md` (Fase 14)    | **NUEVO**                                                                          | §13.1.4   |
| 18 | `.claude/skills/sm-phase-solution-data-collection/SKILL.md` (15)   | **NUEVO**                                                                          | §13.1.5   |
| 19 | `.claude/skills/sm-phase-solution-analysis/SKILL.md` (Fase 16)     | **NUEVO**                                                                          | §13.1.6   |
| 20 | `.claude/skills/sm-phase-conclusion/SKILL.md` (Fase 17)            | Renumerada de 09 → 17; consumir 02+08+**16**; emitir `case_paused_at` si "no resuelto" | §13.3.1   |
| 21 | `.claude/skills/sm-phase-communication/SKILL.md` (Fase 18)         | Renumerada de 10 → 18; citar la solución ganadora de 16; manejar caso pausado         | §13.3.2   |
| 22 | `.claude/skills/sm-orchestrator/templates/case.md`                 | 16 entries; `case_paused_at`; `case_resumed_at`                                       | §13.7.1   |
| 23 | `.claude/skills/sm-orchestrator/templates/phase-artifact.md`        | Campo `chain` en frontmatter                                                         | §13.7.2   |
| 24 | `.claude/skills/sm-orchestrator/references/phase-policy-schema.md` | 16 claves válidas; rango 01..18 con 09-10 vacantes                                    | §13.6.1   |
| 25 | `.claude/skills/sm-orchestrator/references/classification-guide.md` | Sin cambios                                                                          | §13.6.2   |
| 26 | `.claude/skills/sm-orchestrator/references/artifact-conventions.md` | Campo `chain`; rango 01..18; 3 bucles                                                 | §13.6.3   |
| 27 | `.claude/skills/sm-orchestrator/references/knowledge-base.md`      | Sin cambios                                                                          | §13.6.4   |
| 28 | `.claude/skills/sm-orchestrator/references/changelog.md`           | Sin cambios                                                                          | §13.6.5   |
| 29 | `.claude/CLAUDE.md`                                                | Rango 01..18; estado `pausado`; precondiciones de cadena y cierre                    | §13.8     |

Adicionalmente, **fuera del sistema `sm-*`** se modificará (cuando el usuario apruebe el diseño):

- `.claude/skills/sm-orchestrator/references/artifact-conventions.md` — campo `chain` en
  frontmatter; rango `NN ∈ 01..18`.
- `docs/proposals/scientific-method-and-openspec-integration.md` — referencia a "fase 09" como
  frontera de Etapa B pasa a "fase 17". Este cambio se hace en un commit aparte, **después** de
  que la migración esté completa.

### 11.3 Dependencias externas

Sin cambios respecto a v1.0:

- `.claude/skills/artifact-structuring/` — política de idioma.
- `.claude/skills/conventional-commits/` — formato de mensajes.
- `.claude/CLAUDE.md` — instrucciones persistentes (puede requerir un ajuste menor para
  mencionar el rango `01..18` con 09-10 vacantes y el estado `pausado`).

### 11.4 Precondición para implementar

El usuario debe **aprobar explícitamente** el diseño de este documento antes de empezar la
migración. La aprobación se documenta en un commit aparte con mensaje aproximado
`feat(sm): aprobar migración a dos cadenas`. Hasta entonces:

- El sistema actual (15 skills v1.0) sigue siendo el **contrato vigente**.
- `docs/proposals/scientific-maintenance.md` (v1.0) sigue siendo el documento canónico.
- Este `new-scientific-maintenance.md` (v0.1) es una **propuesta de migración**, no un contrato.

---

## 12. Referencias cruzadas

Este documento es **completamente autocontenido**: el código fuente de las 16 skills que
define, las 5 referencias del orquestador, las 2 plantillas y `.claude/CLAUDE.md` están
**embebidos en §13**. La siguiente tabla lista los recursos externos que **no** están
embebidos (porque no son parte del código del sistema) y cuyo conocimiento sí es relevante
para entender el rediseño.

| Documento / Recurso                                                                 | Relación                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/proposals/scientific-maintenance.md` (v1.0)                                  | Sistema vigente actual (1 cadena × 10 fases con modos). Sigue siendo el contrato hasta que el usuario apruebe este diseño. El nuevo diseño lo reemplaza conceptualmente, pero no se elimina hasta la migración. |
| `docs/proposals/scientific-method-and-openspec-integration.md` (v0.3)              | Integración con OpenSpec. La frontera de Etapa B (que cita "fase 09") se ajustará a "fase 17" cuando se apruebe el diseño. Sin cambio ahora. La decisión sobre cómo interactúa este nuevo diseño de 2 cadenas con OpenSpec queda fuera del alcance de este documento — se redactará en un plan aparte si el usuario lo requiere. |
| `maintenance-cases/20260607-clean-modules-windows/`                                | Caso de referencia del gap. NO es un ejemplo del nuevo diseño (se ejecutó con el workflow antiguo); sirve como evidencia del gap que el rediseño corrige. |
| `.claude/skills/artifact-structuring/SKILL.md`                                     | Política de idioma (inglés en cuerpos, español en interacción). Sin cambios.                                                              |
| `.claude/skills/conventional-commits/SKILL.md`                                     | Formato de mensajes de commit. Sin cambios.                                                                                                 |
| `.claude/memory/clean-modules-windows-atomicity-2026-06.md`                        | Lección que motivó el rediseño. Documenta el gap metodológico (fase 09 emitió decisiones sin medir) y la transición a dos cadenas. **Su contenido NO se embebe aquí** porque es una lección (memoria), no código del sistema. |

> **Nota sobre los archivos en `.claude/`:** los archivos de código del sistema `sm-*`
> (skills, plantillas, referencias) y `.claude/CLAUDE.md` **no se referencian como archivos
> externos**; su contenido está embebido en §13. Esto es deliberado: este documento describe
> el sistema, y un documento que describe un sistema no debe delegar su especificación a
> archivos que pueden cambiar independientemente. La fase de migración (§11) es la que
> efectivamente escribirá esos archivos en disco, partiendo del código embebido.

---

## 13. Código fuente del sistema (migración)

Esta sección embebe el código fuente completo de los archivos del sistema `sm-*` **tal como
quedarán tras la migración** aprobada por el usuario. El propósito es que este documento sea
**completamente autocontenido**: no requiere leer `docs/proposals/scientific-maintenance.md`
(v1.0) ni ningún otro documento para entender el sistema.

**Convención de presentación:** cada bloque está delimitado por vallas de cuatro backticks (````)
para permitir embeber markdown (incluyendo bloques de código) sin escaparlo. El cuerpo de cada
skill está en inglés; los `<user_communication>` y la interacción con el usuario se hacen en
español (conforme a `artifact-structuring §language_policy`).

### 13.1 Las 6 skills de solución (nuevas)

Estas 6 skills no existen en el sistema v1.0; se crean desde cero para el sistema de dos cadenas.
Operan sobre el espacio de hipótesis de **solución** (no de causa). Cada una es ortogonal a su
fase de causa con el mismo ordinal (03↔11, 04↔12, etc.) pero no comparte artefactos.

#### 13.1.1 `sm-phase-solution-research` (Fase 11)

````markdown
---
name: sm-phase-solution-research
description: >
  Solution-space phase 11 (Solution Research) for the two-chain scientific-maintenance system.
  Invoked by sm-orchestrator ONLY after phase 08 has confirmed a cause (the `## Causa confirmada`
  section in 08-analysis.md is the precondition). Maps the full space of viable solutions for the
  confirmed cause; gathers alternatives, frameworks, patterns, prior lessons; produces
  11-solution-research.md. Adapts via case.md phase_policy.solution-research.
---

# Phase 11 — Solution Research

Maps the solution space. Operates on the SOLUTION axis (the cause axis is closed by phase 08).
Generic, profile-parameterized.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-research).
- `08-analysis.md` with the mandatory `## Causa confirmada` section (precondition §5.2).
- The knowledge base (.claude/memory/ via MEMORY.md) — applied to the SOLUTION space
  (alternatives, patterns), not the cause space.

## Procedure
1. Read the policy entry (`phase_policy.solution-research`).
2. **Recall protocol (solution space):** derive `component` / `defect-class` from the confirmed
   cause; take `profile` from case.md. Query MEMORY.md by those tags; open and cite matching
   lessons as **solution precedents** (not as cause precedents — same tags, different space).
3. **Map the solution space:** enumerate ALL viable solutions for the confirmed cause. For each,
   record: name, mechanism, predicted trade-offs (latency, complexity, blast radius, dependencies,
   reversibility, risk), references (code:line, docs, lessons). Aim for breadth — the next phase
   narrows to falsifiable hypotheses; this phase does not.
4. Profile-driven emphasis: the profile's `focus` selects which dimension of trade-offs to
   prioritize (corrective → reversibility + minimal diff; adaptive → reversibility + flag
   isolation; perfective → metric dominance + benchmark cost; preventive → coverage of
   materialization paths).
</phase_procedure>

## Output
Write `maintenance-cases/<case-id>/11-solution-research.md` from templates/phase-artifact.md
with `chain: solution` in the frontmatter:
- Applied policy (echo), Recalled lessons (links), Solution space map (rows: candidate; columns:
  mechanism, predicted trade-offs, references), Coverage statement (which kinds of solution
  were considered and excluded — and why).

## Acceptance
At least two viable candidates enumerated; each with description, predicted trade-offs and
references; recall executed by the relevant tags; coverage statement explains the boundaries
of the space.

<constraints>No hypothesis formulation here. Map the space; do not yet propose what to test.</constraints>
````

#### 13.1.2 `sm-phase-solution-hypothesis` (Fase 12)

````markdown
---
name: sm-phase-solution-hypothesis
description: >
  Solution-space phase 12 (Solution Hypothesis) for the two-chain scientific-maintenance system.
  Invoked by sm-orchestrator after phase 11. For each viable solution from the solution space,
  formulates a falsifiable hypothesis with observable prediction and refutation criterion. Produces
  12-solution-hypothesis.md. Adapts via case.md phase_policy.solution-hypothesis. Idempotent:
  re-invoked by the Solution Refutation Loop (Bucle B), appends new hypotheses without
  overwriting refuted ones.
---

# Phase 12 — Solution Hypothesis

Narrows the solution space to falsifiable hypotheses. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-hypothesis).
- `11-solution-research.md`.
- On re-invocation (Bucle B, solution refutation): the existing `12-solution-hypothesis.md`.

## Procedure
1. Read the policy entry.
2. **If 12-solution-hypothesis.md already exists (re-invocation for solution refutation):** read
   the artifact, append the next solution candidate as a new hypothesis; do NOT overwrite or
   remove previously refuted hypotheses — they are the audit trail of the solution-space
   iteration. The new hypothesis addresses the refutation criterion of the previously rejected
   one.
3. **If 12-solution-hypothesis.md does not exist (first pass):** for each viable solution from
   `11-solution-research.md`, formulate a hypothesis: name, mechanism, **observable prediction**
   (what the experiment will measure if the solution wins), **refutation criterion** (what
   measurement value falsifies it), priority (per the profile's `focus`).
4. Cover the prioritization rationale: why this order, what trade-off each priority embodies.
</phase_procedure>

## Output
Write (first pass) or update (re-invocation) `12-solution-hypothesis.md` from
templates/phase-artifact.md with `chain: solution` in the frontmatter:
- Applied policy, Solution hypotheses table (rows: hypothesis; columns: prediction, refutation
  criterion, priority, profile-driven trade-off), Prioritization rationale,
  Discarded alternatives (with one-line reason — these did not pass the viability filter of
  phase 11).

## Acceptance
At least one hypothesis falsifiable; each hypothesis with observable prediction and
refutation criterion; prioritization justified by the profile's focus. On re-invocation:
existing content preserved; only new hypothesis appended.

<constraints>Formulate hypotheses; do not design or run experiments.</constraints>
````

#### 13.1.3 `sm-phase-solution-experiment-design` (Fase 13)

````markdown
---
name: sm-phase-solution-experiment-design
description: >
  Solution-space phase 13 (Comparative Experiment Design) for the two-chain scientific-maintenance
  system. Invoked by sm-orchestrator after phase 12. Designs a SINGLE comparative experiment
  that covers ALL hypotheses from 12 with shared metrics, identical initial conditions, and an
  explicit rollback protocol between runs. Produces 13-solution-experiment-design.md. Adapts via
  case.md phase_policy.solution-experiment-design.
---

# Phase 13 — Solution Experiment Design

Designs ONE comparative experiment, not one per hypothesis. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-experiment-design).
- `12-solution-hypothesis.md`.

## Procedure
1. Read the policy entry; honor `risk_controls` (sandbox, feature flag, isolation).
2. Design a **single** comparative procedure that executes all hypotheses in priority order
   under shared conditions:
   - **Shared metrics** (one set, used for every hypothesis — the comparative metrics table of
     phase 15 needs comparable values).
   - **Identical initial conditions** (same dataset / same fixture / same state snapshot per
     hypothesis, so the only difference is the hypothesis's intervention).
   - **Explicit rollback between runs** (each hypothesis's state is reverted before the next
     begins; rollback steps enumerated).
   - **Per-hypothesis criterion** (from the refutation criterion of phase 12; pass/fail at
     execution time).
3. State the **shared instrumentation**: what gets measured, with what tool, in what units, at
   what granularity. Same for every hypothesis.
4. State the **profile-driven emphasis** (e.g. corrective → mandatory no-regression test inside
   the comparative run; perfective → baseline N runs before any hypothesis; preventive →
   isolation of risk injection).
</phase_procedure>

## Output
Write `13-solution-experiment-design.md` from templates/phase-artifact.md with `chain: solution`
in the frontmatter:
- Applied policy, Shared metrics table, Initial-condition snapshot, Per-hypothesis run
  procedure (rows: hypothesis, refutation criterion, expected metric range), Rollback between
  runs, Instrumentation, Profile-driven emphasis.

## Acceptance
A single procedure covers all hypotheses; shared metrics; identical initial conditions;
rollback between runs enumerated; per-hypothesis criterion traceable to phase 12.

<constraints>Design the comparative procedure; do not execute.</constraints>
````

#### 13.1.4 `sm-phase-solution-execution` (Fase 14)

````markdown
---
name: sm-phase-solution-execution
description: >
  Solution-space phase 14 (Sequential Hypothesis Execution) for the two-chain scientific-
  maintenance system. Invoked by sm-orchestrator after phase 13. Executes the hypotheses
  SEQUENTIALLY in priority order, with explicit rollback between runs. Produces
  14-solution-execution.md. Adapts via case.md phase_policy.solution-execution.
---

# Phase 14 — Solution Execution

Sequentially executes each hypothesis; rollback between runs. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-execution).
- `13-solution-experiment-design.md`.

## Procedure
1. Read the policy entry and the design.
2. **Execute hypotheses sequentially in priority order.** For each hypothesis:
   a. Establish the initial-condition snapshot (per phase 13).
   b. Apply the hypothesis's intervention.
   c. Run the shared instrumentation; capture raw metrics.
   d. Compare the captured metrics to the hypothesis's refutation criterion (pass/fail).
   e. **Rollback to the snapshot** before the next hypothesis.
3. Store per-hypothesis raw outputs under
   `maintenance-cases/<case-id>/experiments/solution-<id>/<hypothesis-id>/` (script, raw data,
   notes, result-summary). Voluminous data is stored externally with a `data-location.md`
   pointer instead of being committed.
4. Log every command, every applied change, every rollback step, every deviation (with reason).
5. **Throwaway branches** for larger implementations: `exp/<case-id>/hypothesis-X`. They carry
   the `Case: <case-id>` trailer but are **never merged**.
</phase_procedure>

## Output
Write `14-solution-execution.md` from templates/phase-artifact.md with `chain: solution` in
the frontmatter:
- Applied policy, Per-hypothesis sub-entries (rows: hypothesis; columns: command log, raw
  metrics, refutation-criterion result, rollback verification), Deviations, paths to
  `experiments/solution-<id>/<hypothesis-id>/`, throwaway branches created.

## Acceptance
Hypotheses executed in priority order; rollback verified between runs; deviations documented;
raw outputs in `experiments/solution-<id>/<hypothesis-id>/`; per-hypothesis pass/fail against
the refutation criterion recorded.

<constraints>Execute; do not interpret results here (phase 15 normalizes; phase 16 analyzes).</constraints>
````

#### 13.1.5 `sm-phase-solution-data-collection` (Fase 15)

````markdown
---
name: sm-phase-solution-data-collection
description: >
  Solution-space phase 15 (Comparative Data Collection and Normalization) for the two-chain
  scientific-maintenance system. Invoked by sm-orchestrator after phase 14. Captures and
  NORMALIZES the metrics of each hypothesis to a common schema. Produces
  15-solution-data-collection.md. Adapts via case.md phase_policy.solution-data-collection.
---

# Phase 15 — Solution Data Collection

Normalizes per-hypothesis metrics into a single comparable table. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-data-collection).
- `14-solution-execution.md` and the per-hypothesis raw outputs in
  `experiments/solution-<id>/<hypothesis-id>/`.

## Procedure
1. Read the policy entry; the `evidence` field defines mandatory data.
2. **Normalize** every hypothesis's metrics to the **common schema** defined in phase 13 (shared
   metrics). Columns are shared; rows are hypotheses. Without normalization, phase 16 cannot
   compare trade-offs.
3. Required columns (minimum): hypothesis name, mechanism, latency, exit code, final state,
   side effects, profile-dominant metric (e.g. diff size for corrective; reversibility for
   adaptive; p-value for perfective; coverage of materialization paths for preventive).
4. Cells with no measurement are marked explicitly (e.g. `n/a` with reason) — they are NOT
   treated as zero, which would distort the comparison.
5. Never edit raw results; record them faithfully.
</phase_procedure>

## Output
Write `15-solution-data-collection.md` from templates/phase-artifact.md with `chain: solution`
in the frontmatter:
- Applied policy, Normalized comparative table (rows: hypothesis; columns: shared metrics),
  Schema definition, Source paths to raw outputs, Cells with no measurement (with reason),
  Units and conditions.

## Acceptance
Every hypothesis has a row; metrics are of the same type per column; units and conditions
recorded; cells with no measurement are explicit; raw outputs unedited. The table is the input
phase 16 consumes.

<constraints>Normalize; do not draw conclusions.</constraints>
````

#### 13.1.6 `sm-phase-solution-analysis` (Fase 16)

````markdown
---
name: sm-phase-solution-analysis
description: >
  Solution-space phase 16 (Comparative Analysis and Verdict) for the two-chain scientific-
  maintenance system. Invoked by sm-orchestrator after phase 15. Compares trade-offs between
  hypotheses using the normalized table; emits the winning-solution verdict with quantitative
  justification; lists discarded hypotheses with their discard reason. Produces
  16-solution-analysis.md. Adapts via case.md phase_policy.solution-analysis. The
  `## Solución ganadora` section is MANDATORY for phase 17 to emit the spec (§5.3).
---

# Phase 16 — Solution Analysis

Compares normalized trade-offs; emits the winning verdict. Operates on the SOLUTION axis.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.solution-analysis).
- `12-solution-hypothesis.md` (refutation criteria of each hypothesis).
- `15-solution-data-collection.md` (normalized comparative table).

## Procedure
1. Read the policy entry.
2. Apply the profile's `focus` to weight the columns of the normalized table (e.g. corrective
   weights diff size + reversibility + no-regression; perfective weights the metric-dominant
   column + p-value; preventive weights coverage of materialization paths + residual risk;
   adaptive weights reversibility + flag isolation + contract preservation).
3. For each hypothesis, compute its score against the weighted criteria. State the score and
   the column-level breakdown.
4. Identify the winner (highest weighted score; tie-breakers per profile).
5. **Emit the MANDATORY section `## Solución ganadora`** with: winner name, mechanism, key
   metrics from the normalized table, quantitative justification (the score + breakdown),
   predicted diff / change description.
6. **Emit the MANDATORY section `## Hipótesis descartadas`** with: each discarded hypothesis
   name, its score, the reason for discard (which criterion it failed, or which column tipped
   the weighting against it).
7. State threats to validity (what could invalidate the verdict; e.g. small N, environment
   drift, untested edge cases).
8. This phase is idempotent: re-runnable if a hypothesis is later refuted under new evidence
   (Bucle B). The verdict is replaced with version bump; the previous verdict is preserved as
   `superseded` with its reason.
</phase_procedure>

## Output
Write `16-solution-analysis.md` from templates/phase-artifact.md with `chain: solution` in the
frontmatter:
- Applied policy, Weighted score table (rows: hypothesis; columns: shared metrics, weighted
  score, breakdown), `## Solución ganadora` (mandatory), `## Hipótesis descartadas` (mandatory),
  Threats to validity.

## Acceptance
`## Solución ganadora` exists and cites at least one quantitative metric; `## Hipótesis
descartadas` exists and each discard cites a reason; no winner with zero evidence. The
verdict is the input phase 17 consumes to emit the spec.

<constraints>Analyze; the case decision belongs to phase 17.</constraints>
````

### 13.2 Las 8 skills de causa (sin cambios respecto a v1.0)

Las 8 fases de la cadena de causa (01–08) se mantienen **idénticas** al sistema v1.0. No se
renombran, no se renumeran, no se modifica su procedimiento. El único cambio que las afecta
es **externo**: la sección `## Causa confirmada` en `08-analysis.md` pasa a ser **obligatoria**
para que la cadena de solución abra (ver §5.2). A continuación, el código fuente tal cual
queda en el sistema v1.0 (copiado para que este documento sea autocontenido).

#### 13.2.1 `sm-phase-observation` (Fase 01)

````markdown
---
name: sm-phase-observation
description: >
  Scientific-method phase 01 (Observation) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Captures the observable state and symptoms without interpretation, adapting
  to the active profile via case.md phase_policy.observation. Produces
  maintenance-cases/<case-id>/01-observation.md.
---

# Phase 01 — Observation

Generic, profile-parameterized. Reads policy; never decides order; never consolidates.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (profile + phase_policy.observation)
- The user request; access to code, logs, metrics, tests, issues.

## Procedure
1. Read case.md → `phase_policy.observation` (focus, reasoning_effort, evidence, acceptance, risk_controls).
2. Collect observable facts in line with `focus` and gather every required `evidence` item.
3. Record facts only — no causes, no fixes. Date and source each fact.
4. Delimit scope.
</phase_procedure>

## Output
Write `maintenance-cases/<case-id>/01-observation.md` from templates/phase-artifact.md with:
- Applied policy (echo), Observed facts, Context, Scope, "Not interpreted" note.

## Acceptance
Meets `acceptance`: facts verifiable and dated; no assumed cause; scope bounded.

<constraints>No interpretation or proposed fixes. No phase ordering decisions.</constraints>
````

#### 13.2.2 `sm-phase-problem-definition` (Fase 02)

````markdown
---
name: sm-phase-problem-definition
description: >
  Scientific-method phase 02 (Problem Definition) for the scientific-maintenance system. Invoked
  by sm-orchestrator. Turns observations into a precise, bounded, falsifiable problem statement,
  adapting via case.md phase_policy.problem-definition. Produces 02-problem-definition.md.
---

# Phase 02 — Problem Definition

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.problem-definition); 01-observation.md.

## Procedure
1. Read the policy entry.
2. Convert observations into ONE precise problem statement aligned with `focus`.
3. Define the explicit "solved" criterion, limits, impact and severity.
</phase_procedure>

## Output
Write `02-problem-definition.md`: Applied policy, Problem statement, Solved criterion, Limits, Severity.

## Acceptance
Falsifiable and measurable statement; explicit success criterion; single problem.

<constraints>Do not formulate hypotheses or solutions here.</constraints>
````

#### 13.2.3 `sm-phase-research` (Fase 03)

````markdown
---
name: sm-phase-research
description: >
  Scientific-method phase 03 (Research) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Gathers relevant prior knowledge (code, docs, history, literature) and
  recalls the knowledge base by tags. Adapts via case.md phase_policy.research. Produces
  03-research.md.
---

# Phase 03 — Research

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.research); 02-problem-definition.md; the knowledge base
  (.claude/memory/ via MEMORY.md). See ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. **Recall protocol:** derive `component`/`defect-class` from 02-problem-definition.md and
   take `profile` from case.md; query MEMORY.md by those tags; open and cite matching lessons
   as prior art. Recall is a procedure, not a guarantee a lesson exists.
3. Gather knowledge focused by `focus`: related code (file:line), docs, recent commits.
4. Cite every source so it is locatable. Collect required `evidence`.
</phase_procedure>

## Output
Write `03-research.md`: Applied policy, Recalled lessons (with links), Findings (with sources),
Related code, Constraints.

## Acceptance
Sources cited and locatable; recall executed by the relevant tags; coverage of the affected
area sufficient.

<constraints>Gather knowledge and recall lessons; do not propose hypotheses yet.</constraints>
````

#### 13.2.4 `sm-phase-hypothesis` (Fase 04)

````markdown
---
name: sm-phase-hypothesis
description: >
  Scientific-method phase 04 (Hypothesis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Proposes falsifiable, prioritized hypotheses, adapting via case.md
  phase_policy.hypothesis. Produces 04-hypothesis.md.
---

# Phase 04 — Hypothesis

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.hypothesis); 02 and 03.
- On re-invocation (cause refutation loop, Bucle A): existing 04-hypothesis.md is also an input.

## Procedure
1. Read the policy entry.
2. **If 04-hypothesis.md already exists (re-invocation for cause refutation):** read it, append
   the next cause candidate to the existing artifact (do NOT overwrite existing content).
3. **If 04-hypothesis.md does not exist (first pass):** formulate cause hypotheses aligned
   with `focus`; for each, state observable prediction and refutation criterion. Prioritize.
</phase_procedure>

## Output
Write (first pass) or update (re-invocation) `04-hypothesis.md`:
- Cause hypotheses — one or more, each with prediction, refutation criterion, priority.
- On re-invocation: existing content preserved; only new cause hypothesis appended.

## Acceptance
Each hypothesis falsifiable with observable prediction; prioritization justified. On
re-invocation: existing content preserved; only new cause hypothesis appended.

<constraints>Do not design or run experiments here.</constraints>
````

#### 13.2.5 `sm-phase-experiment-design` (Fase 05)

````markdown
---
name: sm-phase-experiment-design
description: >
  Scientific-method phase 05 (Experiment Design) for the scientific-maintenance system. Invoked
  by sm-orchestrator. Designs the minimal-risk experiment to confirm/refute the hypothesis,
  adapting via case.md phase_policy.experiment-design. Produces 05-experiment-design.md.
---

# Phase 05 — Experiment Design

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.experiment-design); 04-hypothesis.md.

## Procedure
1. Read the policy entry; honor `risk_controls` (e.g. sandbox, feature_flag, rollback).
2. Design a reproducible procedure with variables, controls, success/failure criteria.
3. Define an explicit rollback. Keep cost bounded by `reasoning_effort`.
</phase_procedure>

## Output
Write `05-experiment-design.md`: Applied policy, Procedure, Variables, Controls,
Success/Failure, Rollback.

## Acceptance
Reproducible; controls defined; rollback explicit; cost bounded.

<constraints>Design only; do not execute.</constraints>
````

#### 13.2.6 `sm-phase-experiment-execution` (Fase 06)

````markdown
---
name: sm-phase-experiment-execution
description: >
  Scientific-method phase 06 (Experiment Execution) for the scientific-maintenance system.
  Invoked by sm-orchestrator. Executes the designed experiment without deviating from protocol,
  adapting via case.md phase_policy.experiment-execution. Produces 06-experiment-execution.md.
---

# Phase 06 — Experiment Execution

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.experiment-execution); 05-experiment-design.md.

## Procedure
1. Read the policy entry and the design.
2. Execute the experiment as designed under the required `risk_controls`. Record environment.
3. Log commands, applied changes, raw output, and any deviation (with reason).
</phase_procedure>

## Output
Write `06-experiment-execution.md`: Applied policy, Commands, Changes, Deviations, Raw logs.

## Acceptance
Followed the design; deviations documented; environment recorded; reversible.

<constraints>Do not interpret results here; capture them.</constraints>
````

#### 13.2.7 `sm-phase-data-collection` (Fase 07)

````markdown
---
name: sm-phase-data-collection
description: >
  Scientific-method phase 07 (Data Collection) for the scientific-maintenance system. Invoked
  by sm-orchestrator. Captures execution data in structured form, adapting via case.md
  phase_policy.data-collection. Produces 07-data-collection.md.
---

# Phase 07 — Data Collection

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.data-collection); 06-experiment-execution.md.

## Procedure
1. Read the policy entry; the `evidence` field defines mandatory data.
2. Capture raw results faithfully without editing. Normalize to the standard schema (exit
   code, final state, side effects).
</phase_procedure>

## Output
Write `07-data-collection.md`: Applied policy, Normalized data, Metrics, Before/after.

## Acceptance
Data traceable to execution; units and conditions recorded; raw results unedited.

<constraints>Collect and normalize; do not draw conclusions.</constraints>
````

#### 13.2.8 `sm-phase-analysis` (Fase 08)

````markdown
---
name: sm-phase-analysis
description: >
  Scientific-method phase 08 (Analysis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Interprets data against the hypothesis and success criterion, adapting via
  case.md phase_policy.analysis. Produces 08-analysis.md. The MANDATORY `## Causa confirmada`
  section gates the opening of the solution chain (§5.2).
---

# Phase 08 — Analysis

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.analysis); 04-hypothesis.md; 07-data-collection.md.

## Procedure
1. Read the policy entry.
2. Compare data to the cause hypothesis and to the phase-02 criterion.
3. State confirmed/refuted, effect magnitude, threats to validity, side effects.
4. **Emit the MANDATORY section `## Causa confirmada`** when the cause is confirmed: name the
   confirmed cause and cite the evidence. Without this section, the orchestrator will NOT open
   the solution chain (precondition §5.2) and will route the case to phase 17 as "no resuelto".
5. On refutation, do not emit `## Causa confirmada`; the cause refutation loop (Bucle A) re-
   enters phase 04 with the next candidate.
</phase_procedure>

## Output
Write `08-analysis.md`: Applied policy, Verdict on cause hypothesis, Magnitude, Threats to
validity, Side effects. **`## Causa confirmada`** (mandatory when the cause is confirmed) with
the cause name and the evidence that supports it.

## Acceptance
Conclusion supported by data; alternatives considered; limits declared. When confirmed,
`## Causa confirmada` is present and names the cause; when refuted, the section is absent and
the next cause candidate will be appended in 04-hypothesis.md.

<constraints>Analyze; the case decision belongs to phase 17.</constraints>
````

### 13.3 Las 2 skills de cierre renumeradas (17, 18)

Las antiguas fases 09 y 10 se renumeran a 17 y 18. La fase 17 (Conclusión) **consume datos de
ambas cadenas**: además de `02` y `08` (causa), ahora lee `16` (solución). La fase 18
(Comunicación) **cita la solución ganadora de 16** en el commit, no la primera idea del agente.
Ambas manejan el caso `pausado` (Bucle C).

#### 13.3.1 `sm-phase-conclusion` (Fase 17)

````markdown
---
name: sm-phase-conclusion
description: >
  Closure phase 17 (Conclusion) for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator. Decides the case outcome and resulting action, and distills a lesson into
  the knowledge base. Consumes data from BOTH chains: 02, 08 (cause) and 16 (solution). Adapts
  via case.md phase_policy.conclusion. Produces 17-conclusion.md. The MANDATORY
  `## Solución ganadora` section in 16-solution-analysis.md is the precondition for emitting
  the spec (§5.3). Handles the `pausado` state for the Solution Refutation Loop (Bucle B) and
  the Re-opening Loop (Bucle C).
---

# Phase 17 — Conclusion

Closes the case by deciding the outcome and the action. Consumes data from both chains.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.conclusion).
- `02-problem-definition.md` (problem statement + success criterion).
- `08-analysis.md` (cause verdict — either `## Causa confirmada` present, or refutation in
  which case the case routes to `pausado`).
- `16-solution-analysis.md` with the MANDATORY `## Solución ganadora` section (precondition
  §5.3) — only when the solution chain opened (i.e. the cause was confirmed).
- Knowledge-base schema: ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. **Route decision:**
   a. If `08-analysis.md` lacks `## Causa confirmada` → verdict is "no resuelto" → go to
      step 3b (pause).
   b. If `16-solution-analysis.md` lacks `## Solución ganadora` (because the solution chain
      was refuted — Bucle B exhausted candidates) → verdict is "no resuelto" → go to step
      3b (pause).
   c. Otherwise → proceed to step 3a (close with verified spec).
3. **Close (3a):** contrast the analysis with the phase-02 success criterion; decide apply /
   revert / escalate; record residuals, debt, follow-ups; produce the validated specification
   (the conclusion is not just a verdict but a complete spec of the change, citing the
   winning solution from `16-solution-analysis.md ## Solución ganadora` and each discarded
   alternative from `## Hipótesis descartadas` with its discard reason). Set
   `status: done` in case.md.
   **Pause (3b):** set `status: pausado` and `case_paused_at: <ISO-8601 UTC>` in the
   canonical block of case.md. The orchestrator will offer the user re-opening (Bucle C)
   for re-execution of phases 03–08 with new context.
4. **Distill one lesson** (the non-derivable learning, not a case summary) into a new file
   under `.claude/memory/` with tags `component`/`defect-class`/`profile`; add one line to
   `MEMORY.md`. **The lesson is written in both close and pause paths** — even a "no
   resuelto" is non-derivable learning.
5. **Verify the §5.3 precondition:** confirm `16-solution-analysis.md` contains
   `## Solución ganadora` with a winning verdict and discard justifications, before emitting
   the spec. If absent, halt — the spec cannot be emitted without comparative evidence.
</phase_procedure>

## Output
- Write `17-conclusion.md` with:
  - **Verdict** — winning cause (from 08), winning solution (from 16 — when both exist),
    discarded hypotheses (with justification), confidence level, known residual risks.
  - **Validated specification** (only on the close path, step 3a): problem (→ proposal),
    bounded scope, expected behavior delta, key architectural decisions, acceptance
    criteria, experimental evidence (refs to 06/07/08/14/15/16 + experiments/), **Solución
    seleccionada (vs alternativas)** — winner cited from 16-analysis.md ## Solución
    ganadora; each discarded alternative cited with its discard reason. Cross-reference
    mandatory.
  - **Pause note** (only on the pause path, step 3b): explicit "no resuelto" verdict; reason
    (cause refutation exhausted / solution refutation exhausted / no viable solution);
    `case_paused_at` timestamp.
  - **References** — case, expediente, experiments/, lesson link.
- Write the lesson file in `.claude/memory/` and index it in `MEMORY.md`.

## Acceptance
Verdict coherent with the analysis; phase-02 criterion checked; actions actionable;
validated-spec structure present on the close path; pause note present on the pause path;
lesson written with tags that enable phase-03 / phase-11 recall in both paths.

<constraints>Decide, write the validated spec (close) or the pause note (pause), and the
lesson. Do not produce the human communication (phase 18). Do not write the changelog or any
case ledger (both are derived).</constraints>
````

#### 13.3.2 `sm-phase-communication` (Fase 18)

````markdown
---
name: sm-phase-communication
description: >
  Closure phase 18 (Communication) for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator. Produces the final human-facing communication (PR, changelog, report,
  commit draft), adapting via case.md phase_policy.communication. Produces 18-communication.md.
  The commit cites the winning solution from 16-solution-analysis.md (not the agent's first
  idea). Handles the `pausado` state: emits a "no resuelto" communication offering Bucle C
  re-opening to the user.
---

# Phase 18 — Communication

<user_communication>Spanish for user interaction AND for the produced PR/commit drafts (repo
policy). See ../artifact-structuring/SKILL.md §language_policy and the conventional-commits
skill.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.communication).
- The full chain: 02, 08 (cause), 16 (solution — when the solution chain opened), 17
  (verdict and spec, or pause note).

## Procedure
1. Read the policy entry. Read `status` from the canonical block: `done` (close) or
   `pausado` (pause).
2. **Close path (`status: done`):** summarize for the target audience: what changed, why,
   evidence from both chains, risks, links to artifacts.
3. **Pause path (`status: pausado`):** emit a "no resuelto" communication summarizing what was
   tried (cause candidates explored, solution candidates explored if the chain opened),
   what the lesson learned, and the offer of Bucle C re-opening (re-execute 03–08 with new
   context, preserving 01–02).
4. Draft the commit/PR message in Spanish following the repo's conventional-commits skill,
   ending with the git commit metadata (*trailer*) `Case: <case-id>` (see
   ../sm-orchestrator/references/changelog.md).
5. **The commit body cites the winning solution from `16-solution-analysis.md ## Solución
   ganadora`** (not the agent's first idea). The reference format is
   `(ver 16-solution-analysis.md ## Solución ganadora)` so the chain of evidence is
   navigable from the commit.
6. On the pause path, the commit body additionally documents the `case_paused_at` timestamp
   and the Bucle C re-opening offer.
</phase_procedure>

## Output
Write `18-communication.md`: Applied policy, Executive summary, Changes (or pause note),
Evidence (links to both chains), Risks, Commit/PR draft (Spanish, with `Case:` commit
metadata, citing 16-analysis.md ## Solución ganadora on the close path, or
case_paused_at + Bucle C offer on the pause path).

## Acceptance
Self-contained; links evidence from both chains; correct audience; no unsupported claims;
commit draft carries the `Case:` commit metadata (*trailer*); on the close path, the commit
body cites 16-solution-analysis.md ## Solución ganadora; on the pause path, the commit body
documents case_paused_at and the Bucle C offer.

<constraints>Communicate; do not introduce new changes or conclusions. Run the changelog
generator with the pending entry (`--pending "<subject>" --case <id>`) and include
CHANGELOG.md in the commit. Never hand-write changelog entries.</constraints>
````

### 13.4 Los 4 perfiles (con `phase_policy` de 16 entries)

Cada perfil proyecta su política sobre las **16 fases** (8 de causa + 6 de solución + 2 de
cierre) en una `phase_policy matrix` de 16 entries. El contrato por entry no cambia
(`{ focus, reasoning_effort, evidence, acceptance, risk_controls }`); solo cambia la
cantidad de entries y el contenido de las 6 entries de solución + 2 de cierre.

#### 13.4.1 `sm-profile-corrective`

````markdown
---
name: sm-profile-corrective
description: >
  Corrective maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write corrective parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for bugs, regressions, exceptions, production incidents, red tests.
  Triggers: corregir, arreglar bug, regresión, fallo en producción. Does not execute phases.
---

# Profile — Corrective

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases or writes phase artifacts.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Restore correct behavior by removing a defect with a minimal, verified change.

## Parameters to write into case.md
- Priorities: reproduce → root cause → minimal fix → no regression.
- Success metrics: reproduction test red→green; zero regressions; time-to-resolution.
- Risk thresholds: reject broad changes for a localized defect; reject a fix without a
  covering test; reject a solution that adds unnecessary blast radius.

## Phase-policy matrix (16 entries) — schema: ../sm-orchestrator/references/phase-policy-schema.md

```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "síntomas + pasos de reproducción",                       reasoning_effort: medium, evidence: [stack_trace, repro_steps],                          acceptance: "fallo reproducible o caracterizado con precisión", risk_controls: [] }
  problem-definition:        { focus: "defecto + criterio de no-regresión",                      reasoning_effort: medium, evidence: [],                                                 acceptance: "enunciado falsable y medible",                     risk_controls: [] }
  research:                  { focus: "regresiones recientes + recall por defect-class",         reasoning_effort: medium, evidence: [related_commits, code_refs, recalled_lessons],       acceptance: "recall ejecutado; fuentes citadas",               risk_controls: [] }
  hypothesis:                { focus: "causa raíz más probable y barata de probar",              reasoning_effort: medium, evidence: [prediccion, criterio_refutacion],                   acceptance: "≥1 hipótesis falsable",                           risk_controls: [] }
  experiment-design:         { focus: "test que reproduce el bug primero + rollback",            reasoning_effort: medium, evidence: [procedimiento, controles, rollback],                acceptance: "test de reproducción ejecutable",                  risk_controls: [sandbox] }
  experiment-execution:      { focus: "ejecutar test de reproducción; documentar desviaciones",  reasoning_effort: medium, evidence: [comandos, logs, cambios],                           acceptance: "test rojo reproduce el fallo",                     risk_controls: [sandbox, reversible] }
  data-collection:           { focus: "pass/fail del test + métricas de no-regresión",           reasoning_effort: medium, evidence: [pass_fail, deltas, no_regresion],                   acceptance: "datos trazables a la ejecución",                    risk_controls: [] }
  analysis:                  { focus: "verificar cierre del fallo + no-regresión",              reasoning_effort: medium, evidence: [veredicto, magnitud, amenazas],                      acceptance: "## Causa confirmada presente o refutación explícita", risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "fixes ya conocidos para esta clase; patrones históricos",  reasoning_effort: medium, evidence: [candidatas, tradeoffs, recall],                      acceptance: "≥2 candidatas viables",                            risk_controls: [] }
  solution-hypothesis:       { focus: "solución más conservadora y mínima; menor blast radius",   reasoning_effort: medium, evidence: [prediccion, blast_radius, reversibilidad],           acceptance: "≥1 hipótesis falsable + criterios",                  risk_controls: [] }
  solution-experiment-design:{ focus: "experimento comparativo + test de no-regresión obligatorio", reasoning_effort: medium, evidence: [procedimiento, controles, rollback],              acceptance: "experimento reproducible",                           risk_controls: [sandbox, feature_flag] }
  solution-execution:        { focus: "ejecución con rollback explícito entre hipótesis",         reasoning_effort: medium, evidence: [comandos, logs, cambios_rollback],                   acceptance: "ejecución limpia; rollback probado",                risk_controls: [sandbox, reversible] }
  solution-data-collection:  { focus: "pass/fail del test por hipótesis; deltas de no-regresión",  reasoning_effort: medium, evidence: [tabla_normalizada, pass_fail],                        acceptance: "tabla con ≥1 fila por hipótesis",                    risk_controls: [] }
  solution-analysis:         { focus: "veredicto de ganadora con diff mínimo citado",              reasoning_effort: medium, evidence: [veredicto, descartadas_con_razon],                   acceptance: "## Solución ganadora con justificación cuantitativa", risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "veredicto: causa confirmada + solución ganadora + diff mínimo", reasoning_effort: medium, evidence: [veredicto, decision, deuda, seguimiento],      acceptance: "veredicto coherente con análisis",                   risk_controls: [] }
  communication:             { focus: "causa raíz + prueba de no-regresión; diff mínimo",         reasoning_effort: medium, evidence: [resumen, cambios, evidencia, commit],                 acceptance: "commit con metadatos Case: + cita 16 ## Solución ganadora", risk_controls: [] }
```

## Evidence prioritized
Reproduction test (red→green), stack traces, minimal diff.

## Conclusions favored
"Root cause X corrected, verified by test T, with winning solution Y (diff Z), no regressions."
````

#### 13.4.2 `sm-profile-adaptive`

````markdown
---
name: sm-profile-adaptive
description: >
  Adaptive maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write adaptive parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for dependency upgrades, deprecations, new platforms/APIs, regulatory
  changes. Triggers: migrar, actualizar dependencia, adaptar, deprecación, compatibilidad.
  Does not execute phases.
---

# Profile — Adaptive

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Adapt the software to an external change while preserving compatibility.

## Parameters to write into case.md
- Priorities: compatibility → safe migration → coverage of the new contract.
- Success metrics: suite green on the new target; no public-contract breakage; documented
  migration.
- Risk thresholds: reject non-isolated changes (no feature flag); reject irreversible
  migrations without proof; reject a solution that breaks the public contract.

## Phase-policy matrix (16 entries)

```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "delta de entorno; deprecación; nueva API",                reasoning_effort: medium, evidence: [uso_actual, fecha_deprecacion],                       acceptance: "delta delimitado",                                   risk_controls: [] }
  problem-definition:        { focus: "soportar nueva versión manteniendo contrato público",    reasoning_effort: medium, evidence: [enunciado, contrato_publico],                         acceptance: "compatibilidad como criterio",                       risk_controls: [] }
  research:                  { focus: "diferencias v_old↔v_new; breaking changes; recall",       reasoning_effort: high,   evidence: [diff, breaking_changes, lecciones],                   acceptance: "cobertura suficiente del cambio",                     risk_controls: [] }
  hypothesis:                { focus: "estrategia de adaptación con feature flag",               reasoning_effort: medium, evidence: [prediccion, flag_strategy],                            acceptance: "≥1 estrategia falsable",                             risk_controls: [] }
  experiment-design:         { focus: "contract tests v_old y v_new; rollback = flag off",       reasoning_effort: medium, evidence: [procedimiento, contract_tests, rollback],              acceptance: "contract tests ejecutables",                         risk_controls: [feature_flag] }
  experiment-execution:      { focus: "implementar adaptador; ejecutar ambos contract tests",   reasoning_effort: medium, evidence: [comandos, contract_results],                            acceptance: "contract tests verdes",                                risk_controls: [feature_flag, reversible] }
  data-collection:           { focus: "matriz de compatibilidad v_old/v_new",                    reasoning_effort: medium, evidence: [matriz, deltas, sin_ruptura_publica],                  acceptance: "matriz con todas las filas",                          risk_controls: [] }
  analysis:                  { focus: "compatibilidad confirmada; sin rupturas públicas",        reasoning_effort: medium, evidence: [veredicto, matriz, amenazas],                            acceptance: "## Causa confirmada presente",                          risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "patrones de adaptación previa del componente",           reasoning_effort: medium, evidence: [candidatas, recall, tradeoffs],                        acceptance: "≥2 candidatas reversibles",                          risk_controls: [] }
  solution-hypothesis:       { focus: "soluciones reversibles con feature flag",                reasoning_effort: medium, evidence: [prediccion, reversibilidad, flag],                    acceptance: "≥1 hipótesis falsable reversible",                   risk_controls: [] }
  solution-experiment-design:{ focus: "experimento comparativo con contract tests v_old y v_new", reasoning_effort: medium, evidence: [procedimiento, contract_tests],                     acceptance: "experimento reproduce ambos contratos",               risk_controls: [feature_flag, sandbox] }
  solution-execution:        { focus: "ejecutar con feature flag; rollback = flag off",          reasoning_effort: medium, evidence: [comandos, contract_results_ambas],                     acceptance: "ejecución limpia; rollback probado",                  risk_controls: [feature_flag, reversible] }
  solution-data-collection:  { focus: "matriz de compatibilidad normalizada por hipótesis",       reasoning_effort: medium, evidence: [tabla_normalizada, contract_pass],                     acceptance: "tabla con filas por hipótesis",                       risk_controls: [] }
  solution-analysis:         { focus: "veredicto de ganadora reversible con ruta de migración", reasoning_effort: medium, evidence: [veredicto, ruta_migracion, descartes],                  acceptance: "## Solución ganadora reversible con justificación",    risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "adaptación compatible + ruta de migración reversible",   reasoning_effort: medium, evidence: [veredicto, plan_retirada, deuda],                       acceptance: "veredicto coherente con análisis",                    risk_controls: [] }
  communication:             { focus: "compatibilidad y migración; guía adjunta",               reasoning_effort: medium, evidence: [resumen, cambios, guia, commit],                       acceptance: "commit con metadatos Case: + cita 16 ## Solución ganadora + guía migración", risk_controls: [] }
```

## Evidence prioritized
Compatibility matrices, contract tests, version before/after.

## Conclusions favored
"Adapted to Y keeping compatibility with X; migration reversible (winning solution Z)."
````

#### 13.4.3 `sm-profile-perfective`

````markdown
---
name: sm-profile-perfective
description: >
  Perfective maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write perfective parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for performance, readability, maintainability, refactor, optimization with
  no functional change. Triggers: optimizar, refactorizar, rendimiento, deuda técnica,
  mejorar calidad. Does not execute phases.
---

# Profile — Perfective

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Improve quality attributes (performance, readability, maintainability, UX) without changing
functional behavior.

## Parameters to write into case.md
- Priorities: measurable improvement → behavior preservation → no quality regression.
- Success metrics: statistically significant improvement of the target metric; functional
  suite green.
- Risk thresholds: reject optimization without a baseline; reject refactor without a test
  net; reject improvements within noise; reject a solution that changes functional behavior
  inadvertently.

## Phase-policy matrix (16 entries)

```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "métricas de calidad/rendimiento; baselines",             reasoning_effort: medium, evidence: [metricas, baseline, snapshots],                        acceptance: "baseline capturado",                                  risk_controls: [] }
  problem-definition:        { focus: "métrica objetivo + umbral de mejora",                     reasoning_effort: medium, evidence: [enunciado, umbral, invariante_funcional],               acceptance: "umbral explícito",                                   risk_controls: [] }
  research:                  { focus: "benchmarks publicados; patrones de optimización",         reasoning_effort: medium, evidence: [benchmarks, lecciones, literatura],                     acceptance: "cobertura del dominio",                                risk_controls: [] }
  hypothesis:                { focus: "optimización candidata con hipótesis cuantificable",      reasoning_effort: medium, evidence: [prediccion, magnitud_esperada],                         acceptance: "≥1 hipótesis falsable",                               risk_controls: [] }
  experiment-design:         { focus: "benchmark A/B; baseline N runs; igualdad de salida",      reasoning_effort: medium, evidence: [procedimiento, benchmark, baseline],                   acceptance: "benchmark ejecutable",                                 risk_controls: [aislamiento_carga] }
  experiment-execution:      { focus: "ejecutar benchmark antes/después con aislamiento",         reasoning_effort: medium, evidence: [runs, metricas, desviaciones],                          acceptance: "benchmark ejecutado",                                  risk_controls: [aislamiento_carga] }
  data-collection:           { focus: "deltas con varianza; snapshots de igualdad funcional",    reasoning_effort: medium, evidence: [deltas, varianza, igualdad_funcional],                  acceptance: "datos con varianza registrada",                        risk_controls: [] }
  analysis:                  { focus: "significancia estadística; comportamiento invariante",     reasoning_effort: medium, evidence: [p_value, delta, igualdad],                              acceptance: "## Causa confirmada presente",                          risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "benchmarks publicados del dominio; patrones",            reasoning_effort: medium, evidence: [candidatas, benchmarks, recall],                        acceptance: "≥2 candidatas con hipótesis",                          risk_controls: [] }
  solution-hypothesis:       { focus: "soluciones con hipótesis de mejora cuantificable",        reasoning_effort: medium, evidence: [prediccion, magnitud],                                  acceptance: "≥1 hipótesis falsable",                                risk_controls: [] }
  solution-experiment-design:{ focus: "benchmark A/B por hipótesis; baseline N runs",             reasoning_effort: medium, evidence: [procedimiento, benchmark, baseline],                   acceptance: "experimento A/B ejecutable",                            risk_controls: [aislamiento_carga, sandbox] }
  solution-execution:        { focus: "ejecutar cada hipótesis con aislamiento y snapshot",       reasoning_effort: medium, evidence: [runs, metricas, snapshots],                              acceptance: "ejecución limpia; snapshots tomados",                  risk_controls: [aislamiento_carga] }
  solution-data-collection:  { focus: "deltas con varianza normalizados; tabla comparativa",       reasoning_effort: medium, evidence: [tabla_normalizada, p_values],                            acceptance: "tabla con varianza por hipótesis",                     risk_controls: [] }
  solution-analysis:         { focus: "veredicto con significancia estadística citada",         reasoning_effort: medium, evidence: [veredicto, p_value, descartes],                          acceptance: "## Solución ganadora con significancia",                 risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "mejora medible + comportamiento invariante",              reasoning_effort: medium, evidence: [veredicto, delta, igualdad_funcional],                   acceptance: "veredicto cuantitativo",                               risk_controls: [] }
  communication:             { focus: "delta de métricas con números; reproducibilidad",        reasoning_effort: medium, evidence: [resumen, deltas, benchmark, commit],                     acceptance: "commit con metadatos Case: + cita 16 ## Solución ganadora con números", risk_controls: [] }
```

## Evidence prioritized
Reproducible benchmarks, performance profiles, complexity metrics, coverage.

## Conclusions favored
"Metric M improved by Δ (p<threshold) with no functional change (winning solution Z)."
````

#### 13.4.4 `sm-profile-preventive`

````markdown
---
name: sm-profile-preventive
description: >
  Preventive maintenance policy for the two-chain scientific-maintenance system. Invoked by
  sm-orchestrator to write preventive parameters and the per-phase policy matrix (16 entries)
  into case.md. Use for audits, hardening, fragility analysis, recurring defect classes,
  potential vulnerabilities, missing critical coverage. Triggers: prevenir, endurecer,
  auditar, hardening, riesgo, vulnerabilidad. Does not execute phases.
---

# Profile — Preventive

Policy layer. Writes parameters + 16-entry phase-policy matrix into `case.md`. Never
executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Reduce the probability or impact of future failures before they occur.

## Parameters to write into case.md
- Priorities: risk identification → mitigation → residual-risk quantification.
- Success metrics: risk demonstrably mitigated; residual risk quantified; guards/coverage
  added.
- Risk thresholds: reject changes adding net risk; reject mitigation without a validating
  test; reject scope exceeding the addressed risk; reject a mitigation that does not cover
  the materialization paths.

## Phase-policy matrix (16 entries)

```yaml
phase_policy:
  # ── Causa (01–08) ────────────────────────────────────────────────────────
  observation:               { focus: "señales débiles; tendencias; clases de defecto recurrentes", reasoning_effort: high, evidence: [señales, tendencias, recalls],                  acceptance: "señales documentadas",                                risk_controls: [] }
  problem-definition:        { focus: "riesgo a mitigar; probabilidad/impacto; mecanismo",       reasoning_effort: medium, evidence: [enunciado, riesgo, prob_impacto],                     acceptance: "riesgo falsable con prob/impacto",                    risk_controls: [] }
  research:                  { focus: "clases de defecto análogas; vulnerabilidades; recall",  reasoning_effort: high,   evidence: [clases, vulnerabilidades, lecciones],                 acceptance: "recall ejecutado",                                    risk_controls: [] }
  hypothesis:                { focus: "mecanismo de materialización del riesgo",                 reasoning_effort: medium, evidence: [prediccion, mecanismo],                                acceptance: "≥1 mecanismo falsable",                               risk_controls: [] }
  experiment-design:         { focus: "prueba que provoca la condición de riesgo en sandbox",   reasoning_effort: high,   evidence: [procedimiento, inyeccion_fallo, rollback],            acceptance: "prueba ejecutable que provoca",                       risk_controls: [sandbox, aislamiento_estricto] }
  experiment-execution:      { focus: "inyectar fallo; verificar que la condición se materializa", reasoning_effort: medium, evidence: [comandos, inyeccion, resultado],                  acceptance: "condición reproducida en sandbox",                    risk_controls: [sandbox, aislamiento_estricto] }
  data-collection:           { focus: "presencia/ausencia de la condición de riesgo",          reasoning_effort: medium, evidence: [presencia, cobertura, amenazas],                      acceptance: "datos trazables",                                     risk_controls: [] }
  analysis:                  { focus: "reducción efectiva del riesgo; cobertura de vías",        reasoning_effort: high,   evidence: [veredicto, cobertura, residual],                      acceptance: "## Causa confirmada presente",                          risk_controls: [] }
  # ── Solución (11–16) ────────────────────────────────────────────────────
  solution-research:         { focus: "mitigaciones probadas; guardas análogas; hardening",    reasoning_effort: medium, evidence: [candidatas, mitigaciones, recall],                    acceptance: "≥2 candidatas con cobertura amplia",                  risk_controls: [] }
  solution-hypothesis:       { focus: "soluciones que cubren el mayor número de vías",          reasoning_effort: medium, evidence: [prediccion, cobertura_vias],                            acceptance: "≥1 hipótesis falsable con cobertura",                 risk_controls: [] }
  solution-experiment-design:{ focus: "pruebas comparativas que provocan la condición en sandbox", reasoning_effort: high, evidence: [procedimiento, inyeccion, baseline],                 acceptance: "experimento inyecta el riesgo",                       risk_controls: [sandbox, aislamiento_estricto] }
  solution-execution:        { focus: "ejecutar con aislamiento estricto; verificar mitigación", reasoning_effort: medium, evidence: [comandos, inyeccion, resultado, rollback],         acceptance: "ejecución limpia; rollback trivial",                  risk_controls: [sandbox, aislamiento_estricto] }
  solution-data-collection:  { focus: "tabla normalizada: presencia/ausencia de riesgo",         reasoning_effort: medium, evidence: [tabla_normalizada, cobertura],                          acceptance: "tabla con cobertura por hipótesis",                    risk_controls: [] }
  solution-analysis:         { focus: "veredicto con cobertura de vías y residual cuantificado", reasoning_effort: high,   evidence: [veredicto, cobertura, residual],                      acceptance: "## Solución ganadora con cobertura + residual",         risk_controls: [] }
  # ── Cierre (17–18) ───────────────────────────────────────────────────────
  conclusion:                { focus: "riesgo mitigado + residual cuantificado + vías cubiertas", reasoning_effort: medium, evidence: [veredicto, residual, cobertura, deuda],            acceptance: "veredicto cuantitativo",                                risk_controls: [] }
  communication:             { focus: "riesgo evitado y residual; cobertura de vías",           reasoning_effort: medium, evidence: [resumen, riesgo, residual, commit],                    acceptance: "commit con metadatos Case: + cita 16 ## Solución ganadora con residual", risk_controls: [] }
```

## Evidence prioritized
Tests that provoke the risk condition, static analysis, critical-path coverage, threat
models.

## Conclusions favored
"Risk R mitigated by control C (winning solution Z); residual quantified and accepted."
````

### 13.5 El orquestador (modificado con 16 fases y 3 bucles)

`sm-orchestrator` se modifica para conocer las 16 fases (rango `01..18` con 09–10 vacantes) y
los **3 bucles** del workflow: A (refutación interna de causa), B (refutación interna de
solución), C (re-apertura post "no resuelto"). Las precondiciones de cadena (§5.2) y de
cierre (§5.3) son pasos obligatorios; el manejo del estado `pausado` se añade al flujo.

````markdown
---
name: sm-orchestrator
description: >
  Drive a software maintenance case end-to-end as two sequential scientific methods: the CAUSE
  chain (phases 01–08) and the SOLUTION chain (phases 11–16, opened only when phase 08 confirms
  a cause), with a CLOSURE phase (17–18) that consumes data from both chains. Pick a maintenance
  profile and case mode (full/consolidated); run 16 specialized phases in order with 3
  possible loops (cause refutation, solution refutation, post-no-resuelto re-opening);
  consolidate a verdict (apply/revert/pause); distill a lesson; run the changelog generator;
  commit with a `Case:` commit metadata (*trailer*) (changelog and case index are derived, never
  hand-edited). Use when the user asks to maintain, fix a bug, correct a regression, optimize,
  refactor, migrate, upgrade a dependency, adapt to a new API/platform, harden, audit, or
  reduce risk. Also trigger for: mantener, corregir bug, arreglar, optimizar, refactorizar,
  migrar, actualizar dependencia, adaptar, endurecer, auditar, prevenir, mantenimiento
  correctivo/adaptativo/perfectivo/preventivo.
---

# Scientific Maintenance — Orchestrator (two-chain system)

Conducts a maintenance case through TWO sequential scientific methods. Owns the FLOW;
delegates POLICY to a profile skill and PROCEDURE to phase skills. Never implements profile
policy or phase procedure.

<user_communication>Talk to the user in Spanish (questions, confirmations, summaries). Keep
artifacts' machine fields in English. Canonical policy: ../artifact-structuring/SKILL.md
§language_policy.</user_communication>

## Workflow

1. **Identify the case.** Derive `case-id = YYYYMMDD-<slug>`. If a `case-id` is given, resume
   from `maintenance-cases/<case-id>/case.md`.
2. **Classify the profile.** Use references/classification-guide.md to pick one of corrective,
   adaptive, perfective, preventive. If ambiguous, ask the user in Spanish (offer the 2 best
   fits).
3. **Create the manifest.** Copy templates/case.md to `maintenance-cases/<case-id>/case.md`;
   fill case_id, profile, case_mode (consolidated for trivial/localized fixes, full otherwise),
   and the 16 phases as `pending` in the canonical YAML block. The numeric range is `01..18`
   (with 09–10 vacante — those numbers were renumbered to 17, 18).
4. **Load policy.** Invoke the matching `sm-profile-<x>` skill. It writes its parameters and
   the **16-entry** phase-policy matrix into the canonical YAML block in case.md. **Validate
   the schema** (mandatory): confirm case_mode is set, all 16 phase_policy entries are present,
   and all 16 phases entries exist with valid status values. Do not proceed until validation
   passes.
5. **Run the CAUSE chain (phases 01–08).** Before executing phase N, verify in the canonical
   YAML block that phases 01..N-1 are `done`; stop and report if any is not. For each phase,
   invoke the matching `sm-phase-*` skill. After each phase: in full mode, confirm
   `NN-<phase>.md` exists; in consolidated mode, confirm the `## NN — <Phase>` subsection was
   written. Mark the phase `done` and record artifact + version in the canonical YAML block.
   Stop and report if a phase fails its acceptance criterion. (Phase 03 reads MEMORY.md
   explicitly for recall; phase 08 produces the mandatory `## Causa confirmada` section.)

   **Bucle A — cause refutation loop (only exception to linear order within the cause chain).**
   If phase 08 refutes the active cause hypothesis: mark the 04–08 artifacts of that
   hypothesis `superseded` (bump version), re-invoke `sm-phase-hypothesis` to append the next
   candidate to `04-hypothesis.md`, and re-run phases 05–08 on it. Repeat until a cause is
   confirmed (the `## Causa confirmada` section is written) or candidates are exhausted.
6. **Decide whether to open the SOLUTION chain (precondition §5.2).** The solution chain opens
   ONLY if `08-analysis.md` contains the mandatory `## Causa confirmada` section. Otherwise:
   skip the solution chain, route the case to phase 17 with verdict "no resuelto", fix
   `status: pausado` and `case_paused_at` in case.md, and proceed to step 9 (Bucle C will be
   offered by phase 18 in step 10).
7. **Run the SOLUTION chain (phases 11–16).** Before executing phase 11, verify the
   `## Causa confirmada` precondition. Then run phases 11–16 with the same pre-check protocol
   (verify phases 11..N-1 are `done`). Phase 11 (research) maps the solution space; phase 12
   (hypothesis) formulates falsifiable solution hypotheses; phase 13 (experiment design) designs
   ONE comparative experiment covering all hypotheses; phase 14 (execution) runs them
   sequentially with rollback; phase 15 (data) normalizes the metrics; phase 16 (analysis)
   emits the MANDATORY `## Solución ganadora` section.

   **Bucle B — solution refutation loop (only exception to linear order within the solution
   chain).** If phase 16 refutes the active solution (the comparative table shows the active
   hypothesis does not meet the criteria): mark 12–16 artifacts `superseded` (bump version);
   re-invoke `sm-phase-solution-hypothesis` to append the next candidate; re-run 13–16 on it.
   Phase 11 is NOT re-invoked — the solution space map is preserved as audit trail. Repeat
   until a solution wins or candidates are exhausted. If candidates are exhausted, route the
   case to phase 17 with verdict "no resuelto" (Bucle C offered by phase 18 in step 10).
8. **Run the CLOSURE (phases 17–18).** Phase 17 (conclusion) consumes data from BOTH chains:
   `02`, `08` (cause), and `16` (solution). It emits the validated spec — but only if
   `## Solución ganadora` exists in 16-analysis.md (§5.3). If the cause was not confirmed or
   the solution was not won, phase 17 emits "no resuelto" + lesson + `case_paused_at` (no
   spec). Phase 17 also distills the lesson. Phase 18 (communication) drafts the close-out,
   runs the changelog generator, and commits with the `Case:` commit metadata (*trailer*).
   On the close path, the commit body cites the winning solution from
   `16-solution-analysis.md ## Solución ganadora`. On the pause path, the commit body
   documents `case_paused_at` and the Bucle C re-opening offer.
9. **Bucle C — re-opening on `pausado` (orchestrator's role, after phase 18).** When phase 18
   reports a `pausado` case, the orchestrator OFFERS the user the option to re-open the case
   with new context (more research/recall, new information from the user, or a different
   profile suggestion). If the user accepts:
   - Fix `case_resumed_at: <ISO-8601 UTC>` in the canonical block; move `status` to
     `in_progress`.
   - Re-execute phases 03–08 ONLY (phases 01–02 are preserved; the observation and problem
     statement are valid across re-openings). The cause chain re-opens with the new context.
   - If a cause is confirmed in the re-opening, the solution chain opens in a SUBSEQUENT
     CASE RUNNING (not in the same re-opening) — the solution chain never opens inside a
     Bucle C re-opening, even if a cause is confirmed. This avoids mixing two life-cycles in
     the same expediente.
   - The case can be paused and re-opened multiple times. Each pair
     `case_paused_at` / `case_resumed_at` is preserved in the canonical block (the last
     pair is the current one; the full history is in git commits of the case).
10. **Consolidate.** Read `17-conclusion.md` (or the consolidated subsection); write the
    verdict into case.md. Confirm phase 17 wrote a lesson to `.claude/memory/` (indexed in
    `MEMORY.md`). Do NOT write a case ledger — it is derived.
11. **Commit, do not hand-edit derived state.** Phase 18 runs the changelog generator with
    `--pending "<subject>" --case <case-id>` and includes `CHANGELOG.md` in its commit. Never
    edit `CHANGELOG.md` or any case index by hand. See references/changelog.md.
12. **Report to the user** in Spanish: profile, verdict, key artifacts from both chains, the
    lesson written, follow-ups (or Bucle C re-opening offer on the pause path).

## Phase order (fixed, 16 phases)

01-observation → 02-problem-definition → 03-research → 04-hypothesis → 05-experiment-design
→ 06-experiment-execution → 07-data-collection → 08-analysis →
[11-solution-research → 12-solution-hypothesis → 13-solution-experiment-design →
14-solution-execution → 15-solution-data-collection → 16-solution-analysis] (skipped if
no causa confirmada) →
17-conclusion → 18-communication

The brackets delimit the solution chain — it is skipped (with phase 17 routing to "no
resuelto") when the cause is not confirmed.

## The 3 loops — re-entry rules (summary)

- **Bucle A (cause refutation):** triggered by phase 08 refuting the cause. Re-invokes
  phase 04 (sm-phase-hypothesis) to APPEND the next candidate to 04-hypothesis.md; re-runs
  05–08 on the new candidate. 01–03 are NOT re-invoked (the observation, problem statement
  and research are valid across refutation rounds).
- **Bucle B (solution refutation):** triggered by phase 16 refuting the active solution.
  Re-invokes phase 12 (sm-phase-solution-hypothesis) to APPEND the next candidate to
  12-solution-hypothesis.md; re-runs 13–16 on the new candidate. Phase 11 is NOT
  re-invoked (the solution space map is preserved as audit trail of what was considered).
- **Bucle C (re-opening on `pausado`):** triggered by the user accepting re-opening after
  phase 18 reports a `pausado` case. Re-runs phases 03–08 only (01–02 preserved). The
  solution chain never opens inside a Bucle C re-opening; it opens in a SUBSEQUENT CASE
  RUNNING if a cause is confirmed.

## References

| File | When to read |
|------|--------------|
| references/phase-policy-schema.md | The profile↔phase contract (16 keys, range 01..18) — always, before step 4 |
| references/classification-guide.md | Choosing the profile (step 2) |
| references/artifact-conventions.md | Naming, frontmatter (with `chain`), versioning, `Case:` commit metadata (*trailer*) (steps 3–11) |
| references/knowledge-base.md | Lesson schema + recall protocol (steps 5, 7, 10) |
| references/changelog.md | Keep a Changelog format + derivation from commits (step 11) |
| templates/case.md | Manifest skeleton with 16 phases + `case_paused_at` (step 3) |
| templates/phase-artifact.md | Phase artifact skeleton (with `chain`) — passed to phases |

<constraints>
- One profile per case; one artifact per phase; phases run in the fixed order above.
- Never write phase procedure or profile policy here — only orchestrate.
- Artifacts are the source of truth; never keep case state only in conversation.
- Derived state over duplicated state: never hand-edit CHANGELOG.md or a case ledger.
- The solution chain (11–16) opens ONLY when phase 08 emitted `## Causa confirmada`.
- Phase 17 emits the validated spec ONLY when phase 16 emitted `## Solución ganadora`.
- Bucle C re-opening runs ONLY phases 03–08; the solution chain never opens inside it.
- No sub-agents.
</constraints>
````

### 13.6 Las 5 referencias (actualizadas)

Las 5 referencias del orquestador se actualizan para reflejar el sistema de 16 fases. Los
cambios son: `phase-policy-schema.md` admite 16 claves (rango 01..18 con 09-10 vacantes);
`artifact-conventions.md` añade el campo `chain` en frontmatter y el rango `NN ∈ 01..18`.

#### 13.6.1 `references/phase-policy-schema.md`

````markdown
# Phase-Policy Schema (profile ↔ phase contract) — 16-key version

This is the ONLY coupling point between profiles and phases. Each profile fills, per phase,
the fields below into `case.md`. Each phase reads its own entry to adapt behavior. Phases
never read a profile skill; profiles never read a phase skill.

## Fields (per phase entry)

| Field | Type | Meaning |
|-------|------|---------|
| `focus` | string | What to prioritize in this phase under this profile |
| `reasoning_effort` | enum `low\|medium\|high` | Effort/detail expected |
| `evidence` | string[] | Evidence types the profile requires this phase to produce/collect |
| `acceptance` | string | Pass criterion for this phase's artifact |
| `risk_controls` | string[] | Mandatory guards (e.g. sandbox, feature flag, rollback) |

## Location in case.md

`phase_policy` lives inside the **canonical state block** of `case.md` (section "Canonical
state"), alongside `case_mode`, `phases`, and `case_paused_at`. There is no separate
markdown table for phase status — the YAML block is the single machine-readable source.
Schema validation of this block is a mandatory step of the orchestrator.

## 16 valid keys (range `01..18`; 09 and 10 are vacante)

The 16 keys in the system of two chains are: `observation`, `problem-definition`, `research`,
`hypothesis`, `experiment-design`, `experiment-execution`, `data-collection`, `analysis`
(cause chain, 8 keys); `solution-research`, `solution-hypothesis`, `solution-experiment-design`,
`solution-execution`, `solution-data-collection`, `solution-analysis` (solution chain, 6 keys);
`conclusion`, `communication` (closure chain, 2 keys).

The numeric range for `NN` is `01..18`; the numbers 09 and 10 are vacante (the original
phases 09 and 10 were renumbered to 17 and 18). Profiles must fill the 16 keys; the
orchestrator validates the schema.

### Canonical-block scalars (siblings of `phase_policy`, NOT matrix entries)

These belong to the canonical state block directly, alongside `case_mode`/`phases`. They are
NOT per-phase policy fields and never appear inside `phase_policy.<phase>`:

| Field | Type | Meaning |
|-------|------|---------|
| `case_paused_at` | string (ISO-8601 UTC) or `""` | Timestamp of the pause (set by phase 17 on the pause path). Empty until the case pauses. |
| `case_resumed_at` | string (ISO-8601 UTC) or `""` | Timestamp of the latest re-opening (set by the orchestrator when the user accepts Bucle C). Empty until the first re-opening. |

```yaml
# Inside the canonical state block in case.md (16-entry matrix):
case_mode: full   # full | consolidated
case_paused_at: ""   # ISO-8601 UTC or empty
case_resumed_at: ""  # ISO-8601 UTC or empty

phase_policy:
  # causa (01–08)
  observation:               { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  problem-definition:        { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  research:                  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  hypothesis:                { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-design:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-execution:      { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  data-collection:           { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  analysis:                  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  # solución (11–16) — the 6 new keys
  solution-research:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-hypothesis:       { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-experiment-design:{ focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-execution:        { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-data-collection:  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  solution-analysis:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  # cierre (17–18) — renumbered from 09–10
  conclusion:                { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  communication:             { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }

phases:
  "01-observation":                  { status: pending, artifact: "", version: "" }
  "02-problem-definition":           { status: pending, artifact: "", version: "" }
  "03-research":                     { status: pending, artifact: "", version: "" }
  "04-hypothesis":                   { status: pending, artifact: "", version: "" }
  "05-experiment-design":            { status: pending, artifact: "", version: "" }
  "06-experiment-execution":         { status: pending, artifact: "", version: "" }
  "07-data-collection":              { status: pending, artifact: "", version: "" }
  "08-analysis":                     { status: pending, artifact: "", version: "" }
  # 09 and 10 are vacante; the next key is 11 (solution chain)
  "11-solution-research":            { status: pending, artifact: "", version: "" }
  "12-solution-hypothesis":          { status: pending, artifact: "", version: "" }
  "13-solution-experiment-design":   { status: pending, artifact: "", version: "" }
  "14-solution-execution":           { status: pending, artifact: "", version: "" }
  "15-solution-data-collection":     { status: pending, artifact: "", version: "" }
  "16-solution-analysis":            { status: pending, artifact: "", version: "" }
  "17-conclusion":                   { status: pending, artifact: "", version: "" }
  "18-communication":                { status: pending, artifact: "", version: "" }
```

## Rule

Changing this schema is an architectural change. Everything else evolves without touching it.
The 16 keys are stable; the only allowed evolution is the addition of NEW chains (e.g. an
"impact" chain in 19+), never the modification of the 16 existing keys' contract.
````

#### 13.6.2 `references/classification-guide.md`

````markdown
# Profile Classification Guide

Pick exactly one profile. If two fit, ask the user (Spanish) presenting the two best.

| Signal in the request | Profile |
|-----------------------|---------|
| Present failure, bug, exception, regression, red test, prod incident | corrective |
| External change: deprecation, dependency upgrade, new platform/OS, new API, regulation | adaptive |
| Quality opportunity: slow, complex, smelly, refactor, optimize (no behavior change) | perfective |
| Future risk: audit, hardening, fragility, recurring defect class, missing critical coverage | preventive |

## Tie-breakers
- "Optimize a broken thing" → corrective first (restore), perfective later (improve).
- "Migrate and improve" → adaptive (compatibility is the gating concern).
- "Audit because something failed" → corrective for the failure, preventive for the class.

## Case mode (full vs consolidated) — set after picking the profile
- **full** (default): one artifact per phase. Use whenever the cause/solution is not
  unequivocally known up front, or the change is non-localized.
- **consolidated**: phases write subsections inside case.md instead of separate files. Reserve
  for trivial, fully localized cases whose location AND cause are unequivocal from
  observation (e.g. a typo, renaming an internal symbol).
- `corrective` defaults to **full**: a defect's cause is not known in advance and may need
  several hypothesis rounds. Only fully localized, trivial corrective cases justify
  consolidated.

## Note on the two-chain system
The profile choice happens BEFORE either chain opens (step 2 of the orchestrator's workflow).
The profile is NOT re-selected per chain — the same profile projects its `phase_policy` over
all 16 phases (8 of cause + 6 of solution + 2 of closure). Re-selection of a different
profile is only possible via a Bucle C re-opening of the case.
````

#### 13.6.3 `references/artifact-conventions.md`

````markdown
# Artifact Conventions (two-chain version)

## Naming
- Case folder: `maintenance-cases/<case-id>/` with `case-id = YYYYMMDD-<slug>`.
- If `maintenance-cases/<case-id>/` already exists, append an incremental suffix: `-2`, `-3`,
  etc. (e.g. `20260606-login-timeout-2`). Concurrent locking is out of scope by deliberate
  design choice.
- Manifest: `case.md`. Phase artifacts (full mode): `NN-<phase>.md`, NN in `01..18`. The
  numbers 09 and 10 are vacante (renumbered to 17 and 18).
- Consolidated mode: phase content lives in `## NN — <Phase>` subsections of `case.md`. No
  separate artifacts.

## Frontmatter (phase artifact) — two-chain version

```yaml
---
case_id: <id>
profile: <corrective|adaptive|perfective|preventive>
phase: <NN-phase>                            # e.g. 16-solution-analysis
chain: <cause|solution|closure>              # NEW in two-chain system
version: vMAJOR.MINOR
timestamp: <ISO-8601 UTC>
status: <pending|in_progress|done|superseded>
inputs: [<prior artifacts>]
produces: <this file>
links: { previous: <file>, next: <file> }    # + previous_version: <file> on the new version when it supersedes a prior one
---
```

The `chain` field is **optional but recommended**. Values:
- `cause` for phases 01–08
- `solution` for phases 11–16
- `closure` for phases 17–18

The orchestrator infers it from the phase number if absent, but writing it explicitly makes
the chain separation auditable at a glance.

## Versioning
- MINOR++ when re-running a phase on the same inputs (refinement).
- MAJOR++ when upstream inputs changed (phase redone from scratch).
- The superseded artifact sets `status: superseded`; the new version links back to it via
  `links.previous_version`.
- In the cause refutation loop (Bucle A), the 04–08 artifacts of the refuted hypothesis go
  `superseded`. In the solution refutation loop (Bucle B), the 12–16 artifacts of the
  refuted solution go `superseded`. In both cases the new version is MAJOR (upstream
  inputs changed).
- Fine-grained history lives in git (one commit per phase recommended).

## Commit ↔ case link (commit metadata)
- Every commit for a case ends with the git commit metadata (*trailer*) `Case: <case-id>`.
- This gives bidirectional traceability: case → commits (`git log --grep "Case: <case-id>"`)
  and changelog entry → case (the trailer is preserved per entry).
- On the close path, the commit body cites the winning solution:
  `(ver 16-solution-analysis.md ## Solución ganadora)`.
- On the pause path, the commit body documents `case_paused_at` and the Bucle C re-opening
  offer.

## Experimentation artifacts (`experiments/`)
- Cause-chain artifacts: `maintenance-cases/<case-id>/experiments/cause-<id>/`.
- Solution-chain artifacts: `maintenance-cases/<case-id>/experiments/solution-<id>/<hypothesis-id>/`
  (one subfolder per solution hypothesis).
- They are exploratory and discardable — evidence for the conclusion, not production code,
  specs, or formal changes.
- Small scripts/data go directly in the folder (script, raw data, notes, result-summary).
  Voluminous data is stored externally with a `data-location.md` pointer.
- **Throwaway branches** for larger throwaway implementations:
  `exp/<case-id>/hypothesis-X`. Their commits carry the `Case: <case-id>` trailer but are
  **never merged**; the branch stays in history as reference. The keep/delete decision is
  documented at close.

## Retention at close
- Default policy: **what sustains evidence cited in `17-conclusion.md` is kept; the rest is
  discarded** at close (phase 18). The case archive must let a future reviewer verify the
  conclusion without rerunning the experiments.
- Kept: scripts/data backing cited evidence (from BOTH chains); analysis notes with
  reusable insight. Discarded: ephemeral artifacts of purely operational value
  (regenerable logs, temp files). Throwaway branches are decided branch-by-branch. The
  decision is recorded in `18-communication.md`.

## Derived state (do NOT hand-edit)
- `CHANGELOG.md` is derived from conventional commits by the on-demand generator (see
  references/changelog.md). Phase 18 runs it with `--pending`; it is idempotent without
  `--pending`.
- The case index is derived from `maintenance-cases/*/case.md` + `CHANGELOG.md`. There is no
  ledger file.
- Only lessons are persisted deliberately (see references/knowledge-base.md).
````

#### 13.6.4 `references/knowledge-base.md`

````markdown
# Knowledge Base (MEMORY.md index pattern)

The knowledge base is the ONLY deliberately persisted memory. It follows the MEMORY.md
index convention: one lesson per file under `.claude/memory/`, indexed by `MEMORY.md` (one
line per lesson). Claude Code does NOT load MEMORY.md automatically; **phase 03 (cause
chain) and phase 11 (solution chain) read it as explicit recall steps**. It holds
non-derivable learnings — NOT case summaries (those live in the case file).

## Lesson file format
```markdown
---
name: <lesson-slug>
description: <one-line summary used for recall relevance>
tags:
  component: <module, e.g. auth | payments | gateway>
  defect-class: <e.g. connection-pool | n+1 | unhandled-rejection | breaking-api-change>
  profile: <corrective | adaptive | perfective | preventive>
---

<the generalizable lesson: what was learned and how to apply it next time.>
Related case: maintenance-cases/<case-id>/case.md
```

## MEMORY.md index (one line per lesson)
```markdown
- [connection-pool timeouts](connection-pool-timeout-regressions.md) — auth/connection-pool · corrective
```

## Recall protocol — two recall points (cause space + solution space)

1. **Phase 03 (cause chain):** derive `component` / `defect-class` from the phase-02 problem
   statement; take `profile` from case.md. Query MEMORY.md by those tags; open and cite
   matching lessons as **cause precedents** in 03-research.md.
2. **Phase 11 (solution chain):** derive `component` / `defect-class` from the confirmed cause
   in `08-analysis.md ## Causa confirmada`; take `profile` from case.md. Query MEMORY.md by
   those tags; open and cite matching lessons as **solution precedents** in
   11-solution-research.md. Same tags, different space.

Recall is a PROCEDURE (which tags to query and how to incorporate), not a promise a lesson
exists.

## Ownership

- Phase 17 WRITES one lesson on verdict (on both close and pause paths). Phase 03 (cause) and
  phase 11 (solution) READ by tags.
- The base grows by LEARNING, not by case volume. Curate: merge redundant lessons, fix tags.
````

#### 13.6.5 `references/changelog.md`

````markdown
# Changelog (derived from conventional commits)

`CHANGELOG.md` is DERIVED state — never hand-edited. Single source of truth: the
repository's conventional commits (see the `conventional-commits` skill).

## Format
- Keep a Changelog (https://keepachangelog.com), grouped by commit type:
  `feat → Added`, `fix → Fixed`, `perf → Changed`, `refactor → Changed`, `docs → Documentation`, etc.
- Each entry preserves the `Case: <case-id>` commit metadata (*trailer*) for the reverse
  link to the case file.

## Derivation mechanism
- Generated by the **on-demand generator**. Phase 18 runs it with
  `--pending "<subject>" --case <id>` and includes `CHANGELOG.md` in its commit. No skill
  or phase hand-writes changelog entries. Without `--pending` the generator rebuilds the
  full file from `git log` (idempotent; suitable for CI sync-checks).
- Scope: a single project-global `CHANGELOG.md`, plus the `Case:` trailer on every commit
  (bidirectional changelog ↔ case link).
- Releases: if `vX.Y.Z` tags exist, entries are grouped under `## [X.Y.Z]` sections; commits
  after the latest tag appear under `## [Unreleased]`.

## Why on-demand (not a git hook)
A `post-commit` git hook with `--amend` rewrites the just-created commit, which risks a
re-trigger loop and merges derived state into the source commit. An on-demand generator
called from phase 18 produces `CHANGELOG.md` as a regular file change staged alongside
the case artifacts, with no `--amend` and no hidden side effects. See §9.4 for the full
rationale.
````

### 13.7 Las 2 plantillas (actualizadas)

#### 13.7.1 `templates/case.md` (16 phases, `case_paused_at`, `case_resumed_at`)

````markdown
---
case_id: <YYYYMMDD-slug>
profile: <corrective|adaptive|perfective|preventive>
created: <ISO-8601 UTC>
status: in_progress           # in_progress | pausado | done | aborted
verdict:                       # filled at consolidation
---

# Case Manifest — <case_id>

## Case
<one-paragraph description of the maintenance request>

## Profile parameters
<filled by the sm-profile-* skill: objective, priorities, success metrics, risk thresholds>

## Canonical state (machine-readable — single source of truth)

```yaml
case_mode: full                # full | consolidated
case_paused_at: ""             # ISO-8601 UTC; empty until phase 17 pauses the case
case_resumed_at: ""            # ISO-8601 UTC; empty until the first Bucle C re-opening

phase_policy:
  # causa (01–08)
  observation:               { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  problem-definition:        { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  research:                  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  hypothesis:                { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-design:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-execution:      { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  data-collection:           { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  analysis:                  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  # solución (11–16) — 6 new keys
  solution-research:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-hypothesis:       { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-experiment-design:{ focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-execution:        { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-data-collection:  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  solution-analysis:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  # cierre (17–18) — renumbered from 09–10
  conclusion:                { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  communication:             { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }

phases:
  # full mode: artifact = NN-<phase>.md  |  consolidated mode: artifact = case.md#<phase>
  "01-observation":                  { status: pending, artifact: "", version: "" }
  "02-problem-definition":           { status: pending, artifact: "", version: "" }
  "03-research":                     { status: pending, artifact: "", version: "" }
  "04-hypothesis":                   { status: pending, artifact: "", version: "" }
  "05-experiment-design":            { status: pending, artifact: "", version: "" }
  "06-experiment-execution":         { status: pending, artifact: "", version: "" }
  "07-data-collection":              { status: pending, artifact: "", version: "" }
  "08-analysis":                     { status: pending, artifact: "", version: "" }
  # 09 and 10 are vacante (renumbered to 17 and 18)
  "11-solution-research":            { status: pending, artifact: "", version: "" }
  "12-solution-hypothesis":          { status: pending, artifact: "", version: "" }
  "13-solution-experiment-design":   { status: pending, artifact: "", version: "" }
  "14-solution-execution":           { status: pending, artifact: "", version: "" }
  "15-solution-data-collection":     { status: pending, artifact: "", version: "" }
  "16-solution-analysis":            { status: pending, artifact: "", version: "" }
  "17-conclusion":                   { status: pending, artifact: "", version: "" }
  "18-communication":                { status: pending, artifact: "", version: "" }
```

<!-- ── CONSOLIDATED MODE ONLY: phase content below (omit in full mode) ──── -->

## Fases
<!-- Each phase produces a subsection here instead of a separate file. -->

### 01 — Observation
<!-- sm-phase-observation writes here -->

### 02 — Problem Definition
<!-- sm-phase-problem-definition writes here -->

### 03 — Research
<!-- sm-phase-research writes here -->

### 04 — Hypothesis
<!-- sm-phase-hypothesis writes here (Bucle A re-invocation appends, never overwrites) -->

### 05 — Experiment Design
<!-- sm-phase-experiment-design writes here -->

### 06 — Experiment Execution
<!-- sm-phase-experiment-execution writes here -->

### 07 — Data Collection
<!-- sm-phase-data-collection writes here -->

### 08 — Analysis
<!-- sm-phase-analysis writes here; mandatory `## Causa confirmada` for solution chain to open -->

### 11 — Solution Research
<!-- sm-phase-solution-research writes here -->

### 12 — Solution Hypothesis
<!-- sm-phase-solution-hypothesis writes here (Bucle B re-invocation appends, never overwrites) -->

### 13 — Solution Experiment Design
<!-- sm-phase-solution-experiment-design writes here -->

### 14 — Solution Execution
<!-- sm-phase-solution-execution writes here -->

### 15 — Solution Data Collection
<!-- sm-phase-solution-data-collection writes here -->

### 16 — Solution Analysis
<!-- sm-phase-solution-analysis writes here; mandatory `## Solución ganadora` for phase 17 to emit spec -->

### 17 — Conclusion
<!-- sm-phase-conclusion writes here; consumes 02, 08, 16 -->

### 18 — Communication
<!-- sm-phase-communication writes here; runs the changelog generator, drafts the commit with `Case:` trailer -->
````

#### 13.7.2 `templates/phase-artifact.md` (con campo `chain`)

````markdown
---
case_id: <id>
profile: <profile>
phase: <NN-phase>                            # 01..18 (09, 10 are vacante)
chain: <cause|solution|closure>              # NEW; optional but recommended
version: v1.0
timestamp: <ISO-8601 UTC>
status: in_progress
inputs: []
produces: <NN-phase>.md
links: { previous: , next: }   # add previous_version: <file> when this version supersedes a prior one
---

# <Phase title> — <case_id>

## Applied policy
<echo of focus / reasoning_effort / evidence / acceptance / risk_controls read from case.md>

## Result
<phase-specific content — see the phase skill>

<!-- ── MANDATORY SECTIONS (when applicable) ── -->
<!-- Phase 08 (cause analysis): -->
<!-- ## Causa confirmada — REQUIRED for solution chain to open (§5.2) -->
<!-- Phase 16 (solution analysis): -->
<!-- ## Solución ganadora — REQUIRED for phase 17 to emit the spec (§5.3) -->
<!-- ## Hipótesis descartadas — REQUIRED for phase 16 acceptance -->

## Acceptance check
<how this artifact meets `acceptance` from the policy>
````

### 13.8 `.claude/CLAUDE.md` (actualizado para dos cadenas y estado `pausado`)

````markdown
<scientific_maintenance>
# Scientific Maintenance Subsystem (two-chain) — persistent instructions

This repository runs software maintenance as two sequential reproducible scientific experiments
through the `sm-*` skill family: a CAUSE chain (phases 01–08) and a SOLUTION chain (phases
11–16, opened only when the cause is confirmed), with a CLOSURE phase (17–18) that consumes
data from both chains. Treat every maintenance request as a *case* driven by `sm-orchestrator`.

## Non-negotiable rules
- Artifacts are the source of truth, not the conversation. Every phase writes one versioned
  artifact under `maintenance-cases/<case-id>/`. The case manifest is `case.md`. Numeric range
  for phase artifacts: `01..18` (with 09 and 10 vacante — the original phases 09 and 10 were
  renumbered to 17 and 18). The system runs 16 phases, not 18.
- Never skip phases. Trivial cases may run phases with `reasoning_effort: low` (short
  artifacts) but the full 16-phase chain must exist.
- Profiles set policy; phases execute procedure. Never put profile logic inside a phase, nor
  phase procedure inside a profile.
- Phase behavior varies only through the 16-entry phase-policy matrix in `case.md` (see
  references/phase-policy-schema.md). Do not fork phases per profile.
- The SOLUTION chain (phases 11–16) opens ONLY when `08-analysis.md` contains the mandatory
  `## Causa confirmada` section. Without it, phase 17 routes the case to "no resuelto" and
  pauses the case.
- The CLOSURE phase (17) emits the validated spec ONLY when `16-solution-analysis.md` contains
  the mandatory `## Solución ganadora` section. Without it, phase 17 emits "no resuelto".
- The case may enter a `pausado` state (no resuelto) which the orchestrator can re-open
  (Bucle C) by re-executing phases 03–08 with new context. The solution chain never opens
  inside a Bucle C re-opening.
- Derived state over duplicated state. `CHANGELOG.md` and the case index are DERIVED (from
  commits and the filesystem); never hand-edit them. Only lessons are persisted deliberately.

## Case identity
- `case-id = YYYYMMDD-<slug>` (kebab slug from the problem).
- All artifacts for a case live in `maintenance-cases/<case-id>/`.

## Knowledge & traceability
- Knowledge base = MEMORY.md index convention (not runtime-loaded): one lesson per file
  under `.claude/memory/`, indexed by `MEMORY.md`, tagged
  `component`/`defect-class`/`profile`. Claude Code does NOT load `MEMORY.md` automatically;
  phase 03 (cause) and phase 11 (solution) read it as explicit recall steps. This `CLAUDE.md`
  references `MEMORY.md` so it enters context each session. Phase 17 writes lessons.
- Case index is DERIVED from `maintenance-cases/` and `CHANGELOG.md` — never a hand-kept
  ledger.
- Every commit for a case carries the git commit metadata (*trailer*) `Case: <case-id>`.
  `CHANGELOG.md` is regenerated from git log by the on-demand generator (Keep a Changelog).
  Phase 18 runs it. On the close path, the commit body cites the winning solution from
  `16-solution-analysis.md ## Solución ganadora`. See references/changelog.md.

## Default policies
- Default rollback for any experiment: revert the change / disable the feature flag.
- On verdict: write a lesson (phase 17) and commit with the `Case:` trailer (phase 18). Do
  NOT edit the changelog or any case ledger by hand — both are derived.

## Memory index (explicit reference — MEMORY.md is not auto-loaded by the runtime)
See: .claude/memory/MEMORY.md
</scientific_maintenance>

<user_communication>
All user-facing output is in Spanish. Skill bodies and artifact header fields are in English
for token efficiency; explanations, questions, and summaries to the user are Spanish. See
.claude/skills/artifact-structuring/SKILL.md §language_policy.
</user_communication>
````
