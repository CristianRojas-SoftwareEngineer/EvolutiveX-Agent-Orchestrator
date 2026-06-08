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

### 11.2 Archivos que se modificarán

Los 15 archivos del sistema actual que se tocarán en la migración:

| #  | Archivo                                                            | Cambio                                                                              |
| -- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1  | `.claude/skills/sm-orchestrator/SKILL.md`                          | 16 fases (rango 01..18), 3 bucles, precondiciones de cadena y cierre, estado `pausado` |
| 2  | `.claude/skills/sm-profile-corrective/SKILL.md`                    | `phase_policy matrix` con 16 entries                                                 |
| 3  | `.claude/skills/sm-profile-adaptive/SKILL.md`                      | `phase_policy matrix` con 16 entries                                                 |
| 4  | `.claude/skills/sm-profile-perfective/SKILL.md`                    | `phase_policy matrix` con 16 entries                                                 |
| 5  | `.claude/skills/sm-profile-preventive/SKILL.md`                    | `phase_policy matrix` con 16 entries                                                 |
| 6  | `.claude/skills/sm-phase-solution-research/SKILL.md`               | **NUEVO**                                                                          |
| 7  | `.claude/skills/sm-phase-solution-hypothesis/SKILL.md`             | **NUEVO**                                                                          |
| 8  | `.claude/skills/sm-phase-solution-experiment-design/SKILL.md`      | **NUEVO**                                                                          |
| 9  | `.claude/skills/sm-phase-solution-execution/SKILL.md`              | **NUEVO**                                                                          |
| 10 | `.claude/skills/sm-phase-solution-data-collection/SKILL.md`        | **NUEVO**                                                                          |
| 11 | `.claude/skills/sm-phase-solution-analysis/SKILL.md`               | **NUEVO**                                                                          |
| 12 | `.claude/skills/sm-phase-conclusion/SKILL.md`                      | Consumir 02+08+**16**; emitir `case_paused_at` si "no resuelto"                       |
| 13 | `.claude/skills/sm-phase-communication/SKILL.md`                   | Citar la solución ganadora de 16; manejar caso pausado                               |
| 14 | `.claude/skills/sm-orchestrator/templates/case.md`                 | `phase_policy` 16 entries; `phases` 16 entries; `case_paused_at`                     |
| 15 | `.claude/skills/sm-orchestrator/references/phase-policy-schema.md` | 16 claves válidas; schema por entry sin cambios                                      |

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

| Documento / Recurso                                                                 | Relación                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/proposals/scientific-maintenance.md` (v1.0)                                  | Sistema vigente actual (1 cadena × 10 fases con modos). Sigue siendo el contrato hasta que el usuario apruebe este diseño.                |
| `docs/proposals/scientific-method-and-openspec-integration.md` (v0.3)              | Integración con OpenSpec. La frontera de Etapa B (que cita "fase 09") se ajustará a "fase 17" cuando se apruebe el diseño. Sin cambio ahora. |
| `docs/proposals/new-scientific-maintenance.md` (v0.1, este documento)              | Propuesta de migración a 2 cadenas. Describe, no implementa.                                                                                |
| `.claude/CLAUDE.md`                                                                | Instrucciones persistentes del subsistema. Sin cambios estructurales; puede requerir un ajuste menor tras la migración.                       |
| `.claude/memory/MEMORY.md`                                                         | Índice de lecciones. La línea de la lesson `clean-modules-windows-atomicity-2026-06` se actualiza al aprobar este diseño.                   |
| `.claude/memory/clean-modules-windows-atomicity-2026-06.md`                        | Lección que motivó el rediseño. Documenta el gap metodológico (fase 09 emitió decisiones sin medir) y la transición a dos cadenas.        |
| `maintenance-cases/20260607-clean-modules-windows/`                                | Caso de referencia del gap. NO es un ejemplo del nuevo diseño (se ejecutó con el workflow antiguo).                                         |
| `.claude/skills/artifact-structuring/SKILL.md`                                     | Política de idioma (inglés en cuerpos, español en interacción). Sin cambios.                                                              |
| `.claude/skills/conventional-commits/SKILL.md`                                     | Formato de mensajes de commit. Sin cambios.                                                                                                 |
| `.claude/skills/sm-orchestrator/SKILL.md` (v1.0)                                    | Orquestador actual. Se modificará en la migración para conocer las 16 fases (rango 01..18) y los 3 bucles.                                                |
