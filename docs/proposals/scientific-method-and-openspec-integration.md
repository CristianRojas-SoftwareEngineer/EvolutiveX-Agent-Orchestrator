# Integración: Mantenimiento Científico → OpenSpec

> Documento de diseño — propuesta de flujo integrado entre el Sistema de Mantenimiento Científico
> (`scientific-maintenance.md`) y el flujo de trabajo de OpenSpec definido en
> `.claude/skills/openspec-specialist/SKILL.md`.
>
> **Estado:** propuesta de diseño · **Versión:** v0.3
> **Cambios en v0.3:** añadir §5.4.1 con el bucle del espacio de soluciones; el caso
> `20260607-clean-modules-windows` evidenció que la fase 09 emitía decisiones de diseño sin
> comparativo de fase 08.
> **Madurez de los sistemas:** OpenSpec está **completamente implementado** (skills activos en
> `.claude/skills/openspec-*/`). SM es **solo una propuesta de diseño** — ningún skill `sm-*`
> existe todavía. Este documento integra un sistema en producción con uno que aún está por
> construir.
> **Cambio estructural respecto a v0.1:** OpenSpec se invoca únicamente al cierre de la fase SM 09
> (conclusión validada), nunca durante la experimentación. La incertidumbre y el ensayo y error
> quedan contenidos dentro del proceso científico; OpenSpec formaliza e implementa cambios que ya
> cuentan con validación previa por evidencia.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [El problema que resuelve la integración](#2-el-problema-que-resuelve-la-integración)
   - [2.1 Sin integración: dos flujos desconectados](#21-sin-integración-dos-flujos-desconectados)
   - [2.2 Con integración: un proceso unificado](#22-con-integración-un-proceso-unificado)
   - [2.3 Por qué OpenSpec va al final, no en el medio](#23-por-qué-openspec-va-al-final-no-en-el-medio)
3. [Modelo mental: dos engines complementarios](#3-modelo-mental-dos-engines-complementarios)
   - [3.1 SM como engine de investigación y validación](#31-sm-como-engine-de-investigación-y-validación)
   - [3.2 OpenSpec como engine de formalización e implementación](#32-openspec-como-engine-de-formalización-e-implementación)
   - [3.3 La frontera única: conclusión validada → propuesta](#33-la-frontera-única-conclusión-validada-propuesta)
4. [Mapeo entre flujos](#4-mapeo-entre-flujos)
   - [4.1 Correspondencia fase SM → rol en la integración](#41-correspondencia-fase-sm-rol-en-la-integración)
   - [4.2 Correspondencia artefacto SM → artefacto OpenSpec](#42-correspondencia-artefacto-sm-artefacto-openspec)
   - [4.3 El nuevo artefacto: especificación validada](#43-el-nuevo-artefacto-especificación-validada-de-sm-09)
5. [Flujo integrado paso a paso](#5-flujo-integrado-paso-a-paso)
   - [5.1 Etapa A — Investigación científica completa (SM 01–09)](#51-etapa-a-investigación-científica-completa-sm-0109)
   - [5.2 Etapa B — Formalización e implementación (OpenSpec)](#52-etapa-b-formalización-e-implementación-openspec)
   - [5.3 Etapa C — Comunicación y consolidación (SM 10)](#53-etapa-c-comunicación-y-consolidación-sm-10)
   - [5.4 Bucle de iteración: dentro de SM, no entre SM y OpenSpec](#54-bucle-de-iteración-dentro-de-sm-no-entre-sm-y-openspec)
6. [Dónde viven los artefactos de experimentación](#6-dónde-viven-los-artefactos-de-experimentación)
   - [6.1 Naturaleza efímera de los experimentos](#61-naturaleza-efímera-de-los-experimentos)
   - [6.2 Carpeta `experiments/` dentro del expediente](#62-carpeta-experiments-dentro-del-expediente)
   - [6.3 Convenciones para scripts, ramas y datos](#63-convenciones-para-scripts-ramas-y-datos)
   - [6.4 Qué se conserva y qué se descarta al cierre](#64-qué-se-conserva-y-qué-se-descarta-al-cierre)
7. [Modos de integración](#7-modos-de-integración)
   - [7.1 Modo Completo (preventive, perfective)](#71-modo-completo-preventive-perfective)
   - [7.2 Modo Rápido (corrective)](#72-modo-rápido-corrective)
   - [7.3 Modo Solo SM (investigación sin cambio listo)](#73-modo-solo-sm-investigación-sin-cambio-listo)
   - [7.4 Modo Solo OpenSpec (cambio pre-validado)](#74-modo-solo-openspec-cambio-pre-validado)
   - [7.5 Matriz modo × perfil](#75-matriz-modo-perfil)
8. [Modelo de artefactos integrado](#8-modelo-de-artefactos-integrado)
   - [8.1 Árbol de directorios combinado](#81-árbol-de-directorios-combinado)
   - [8.2 Ciclo de vida de artefactos](#82-ciclo-de-vida-de-artefactos)
   - [8.3 Responsabilidades de mantenimiento por tipo de artefacto](#83-responsabilidades-de-mantenimiento-por-tipo-de-artefacto)
9. [Integración por perfil de mantenimiento](#9-integración-por-perfil-de-mantenimiento)
   - [9.1 Corrective](#91-corrective)
   - [9.2 Adaptive](#92-adaptive)
   - [9.3 Perfective](#93-perfective)
   - [9.4 Preventive](#94-preventive)
   - [9.5 Secuencia compacta por perfil](#95-secuencia-compacta-por-perfil)
10. [Trazabilidad bidireccional](#10-trazabilidad-bidireccional)
    - [10.1 Cadena de trazabilidad](#101-cadena-de-trazabilidad)
    - [10.2 Reglas de enlace entre expedientes](#102-reglas-de-enlace-entre-expedientes)
    - [10.3 Ejemplo de commit unificado](#103-ejemplo-de-commit-unificado)
11. [Supuestos, límites y decisiones fuera de alcance](#11-supuestos-límites-y-decisiones-fuera-de-alcance)
    - [11.1 Supuestos](#111-supuestos)
    - [11.2 Límites explícitos](#112-límites-explícitos)
    - [11.3 Fuera de alcance deliberado](#113-fuera-de-alcance-deliberado)
12. [Recomendaciones de implementación](#12-recomendaciones-de-implementación)

---

## 1. Resumen ejecutivo

Este documento propone la integración formal entre dos flujos de trabajo diseñados para operar sobre
el mismo proyecto:

- **Sistema de Mantenimiento Científico (SM)** — investiga, experimenta y valida con rigor
  científico qué cambio es necesario, comparando alternativas y descartando las que no producen
  resultados satisfactorios, hasta emitir un veredicto respaldado por evidencia. Usa perfiles de
  mantenimiento (corrective, adaptive, perfective, preventive) y diez fases del método científico.

- **OpenSpec** — formaliza e implementa de forma trazable y verificable un cambio que ya fue
  decidido en otra parte, produciendo los artefactos canónicos `proposal → specs → design → tasks
→ apply → verify → sync → archive`.

**Decisión arquitectónica central de esta propuesta:** OpenSpec se invoca **únicamente al cierre de
la fase SM 09** (conclusión validada), nunca durante la experimentación. El resultado de la
investigación científica es la especificación del cambio correcto; OpenSpec implementa ese cambio
sin investigar ni experimentar por su cuenta.

Esta separación tiene tres consecuencias directas:

1. **La incertidumbre queda contenida dentro de SM.** Las alternativas que se prueban, las que
   fallan, y los descartes con justificación viven como artefactos de investigación, no como
   changes de OpenSpec. El `archive/` de OpenSpec queda reservado a cambios que efectivamente
   llegaron a producción.
2. **Los cambios en OpenSpec nunca se proponen "a ciegas".** Toda propuesta de OpenSpec se
   alimenta de una especificación validada (SM 09) con evidencia experimental previa.
3. **El modo "Solo SM" deja de ser un caso especial.** Es la trayectoria natural cuando la
   investigación no produce un cambio listo para implementar: "se investigó, no se implementó
   (todavía)".

La integración preserva los contratos internos de ambos sistemas: SM sigue usando su `case.md`,
sus 10 artefactos por fase y su carpeta `experiments/`. OpenSpec sigue usando
`openspec/changes/<name>/` con sus cuatro artefactos canónicos. El puente entre ambos es **un
único corte de ida** entre SM 09 y `openspec-propose`; el flujo solo lo cruza de vuelta para un
caso acotado de corrección de especificación (§5.4), nunca para re-investigar.

---

## 2. El problema que resuelve la integración

### 2.1 Sin integración: dos flujos desconectados

**Usando solo OpenSpec** en un caso de mantenimiento:

- `proposal.md` se redacta con la comprensión inicial del desarrollador, que puede ser parcial o
  incorrecta.
- Si el diagnóstico era erróneo, se descubre en `openspec-verify`, costando retrabajo.
- No existe un mecanismo formal para decidir _qué cambiar_ antes de definir _cómo cambiarlo_.
- Comparar alternativas implica abrir múltiples changes, todos los cuales terminan como cambios
  formales aunque muchos sean descartados.
- El aprendizaje (lecciones) no se acumula entre casos; cada cambio parte de cero.

**Usando solo SM** en un caso de mantenimiento:

- Las fases 05–09 (experimento, ejecución, datos, análisis, conclusión) producen artefactos de
  investigación valiosos pero no hay un mecanismo de especificación normativa para el cambio que
  sale de la conclusión.
- La verificación es ad-hoc; no hay una capa de `specs/` que defina qué debe ser verdad después
  de implementar.
- La implementación del cambio se hace "a mano" sin la trazabilidad y los checks de OpenSpec.

### 2.2 Con integración: un proceso unificado

| Necesidad                                              | Cubierta por                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Observación de señales y encuadre del problema         | SM fases 01–02                                                                                 |
| Investigación, hipótesis y experimentación comparativa | SM fases 03–08                                                                                 |
| Veredicto respaldado por evidencia                     | SM fase 09                                                                                     |
| Especificación normativa del cambio validado           | OpenSpec `specs/` (alimentado por SM 09)                                                       |
| Ejecución estructurada y trazable                      | OpenSpec `apply`                                                                               |
| Verificación formal contra requisitos                  | OpenSpec `verify`                                                                              |
| Conclusión científica sobre el resultado del cambio    | SM fase 10 (cierra `09-conclusion.md` con el veredicto final, incorporando output de `verify`) |
| Cierre, changelog, lección y archivo del change        | SM fase 10 + OpenSpec `sync` + `archive`                                                       |

Notar el orden: la investigación SM va primero, sin OpenSpec. La formalización OpenSpec va después,
sobre la base de una especificación validada. El cierre es conjunto.

### 2.3 Por qué OpenSpec va al final, no en el medio

En la versión v0.1 de este documento, OpenSpec aparecía en el medio del flujo: las fases SM 06–08
(ejecución del experimento, recolección de datos, análisis) se trataban como sinónimos de
`openspec-apply`, `openspec-verify` y "análisis post-verify". Esa equivalencia tenía tres
problemas:

1. **Confunde exploración con compromiso.** Un experimento es exploratorio y descartable; una
   implementación de OpenSpec es un compromiso que termina en `archive/`. Si la hipótesis se
   refuta a mitad de camino, el `openspec-apply` ya dejó código que necesita revertirse y un
   change formal que se archivó sin haber cumplido su propósito.
2. **Rompe el principio "OpenSpec no investiga".** En los documentos fundacionales quedó
   establecido que OpenSpec no diagnostica, no experimenta, no compara alternativas. Pero abrir un
   `openspec-propose` apenas termina SM fase 05 —antes de ejecutar, medir y validar— recarga a
   OpenSpec con la responsabilidad de la investigación, justo la que se le quería quitar.
3. **Infla `archive/` con alternativas descartadas.** Si cada experimento es un `openspec-apply`
   distinto, todas las alternativas rivales terminan archivadas como cambios formales. El
   `archive/` deja de representar "cambios aceptados" y pasa a representar "todas las ideas que
   se probaron".

La solución adoptada en v0.2: la experimentación ocurre dentro de SM, en una carpeta
`experiments/` que forma parte del expediente del caso. OpenSpec solo entra cuando hay un cambio
seleccionado y respaldado por evidencia, listo para ser formalizado.

---

## 3. Modelo mental: dos engines complementarios

### 3.1 SM como engine de investigación y validación

SM responde: **¿qué cambio es necesario, qué alternativas existen, cuál es la mejor y por qué?**

- Parte de una señal (síntoma, riesgo, deuda) y, mediante observación, definición, investigación,
  hipótesis, experimentación, recolección de datos y análisis comparativo, produce una
  **conclusión validada por evidencia**.
- El proceso incluye **exploración activa**: típicamente se formulan varias hipótesis
  alternativas, se ejecutan como experimentos, se miden sus resultados, se comparan y se
  descartan las que no funcionan. La fase 09 emite un veredicto que identifica la alternativa
  ganadora (o la decisión de no implementar nada).
- El output de las fases 01–09 es la base de evidencia que justifica el cambio: el problema
  está bien definido, las alternativas fueron comparadas, los riesgos son conocidos y la
  solución seleccionada está respaldada por datos.

### 3.2 OpenSpec como engine de formalización e implementación

OpenSpec responde: **¿qué debe ser verdad después del cambio y cómo lo implementamos de forma
trazable y verificable?**

- Parte de un cambio ya decidido y especificado (input: la conclusión de SM 09) y produce
  artefactos normativos (`specs/`), técnicos (`design.md`) y ejecutables (`tasks.md`).
- La cadena `proposal → specs → design → tasks → apply → verify → sync → archive` está
  optimizada para implementar cambios de forma trazable y verificable, no para investigar.
- No compara alternativas (eso ya se hizo en SM), no experimenta (los artefactos canónicos de
  OpenSpec describen un único cambio), no emite veredictos científicos (evalúa cumplimiento de
  requisitos, no validez de hipótesis).

### 3.3 La frontera única: conclusión validada → propuesta

```
           ┌──────────────────────────────────────────────────────┐
           │  INVESTIGACIÓN Y VALIDACIÓN (SM phases 01–09)          │
           │                                                        │
           │  • Observar · Definir · Investigar · Hipotetizar       │
           │  • Experimentar · Medir · Analizar · Comparar          │
           │  • Descartar alternativas inviables                    │
           │  • Seleccionar cambio ganador con evidencia            │
           │                                                        │
           │  Output: 09-conclusion.md + especificación validada    │
           │          + expediente completo del caso                │
           └──────────────────────────┬───────────────────────────┘
                                      │  frontera única
                                      │  (conclusión validada → propuesta formal)
                                      ▼
           ┌──────────────────────────────────────────────────────┐
           │  FORMALIZACIÓN E IMPLEMENTACIÓN (OpenSpec)             │
           │                                                        │
           │  • openspec-propose (usa la especificación validada)   │
           │  • openspec-apply (ejecuta tasks.md)                   │
           │  • openspec-verify (compara con specs/)                │
           │  • openspec-sync (mergea deltas)                       │
           │  • openspec-archive (mueve a archive/)                 │
           │                                                        │
           │  Output: código en producción + specs actualizadas     │
           └──────────────────────────┬───────────────────────────┘
                                      │  frontera de cierre
                                      │  (verificado → comunicación)
                                      ▼
           ┌──────────────────────────────────────────────────────┐
           │  COMUNICACIÓN Y CONSOLIDACIÓN (SM phase 10)            │
           │                                                        │
           │  • Veredicto final sobre la hipótesis                  │
           │  • Lección destilada → base de conocimiento            │
           │  • CHANGELOG.md (generador on-demand)                  │
           │  • Commit de cierre: `Case: <case-id>`                 │
           │    (+ `OpenSpec-Change:` solo si archivado, ver §5.3)  │
           │                                                        │
           │  Output: veredicto + changelog + lección + commit      │
           └──────────────────────────────────────────────────────┘
```

Hay **una sola frontera operativa principal** entre los dos sistemas: la entrega de la
especificación validada al inicio del flujo OpenSpec. Esta frontera es **direccional para
investigación** (SM → OpenSpec; el flujo no atraviesa la frontera al revés para re-investigar).
Sí admite un **cruce de corrección acotado**: si `openspec-verify` revela que el error es de
especificación (no de implementación), se vuelve a SM 09 para refinar el documento, no para
re-investigar (ver §5.4). La frontera inferior no es entre sistemas sino entre dos fases del
mismo sistema (OpenSpec verify → SM 10 comunicación). Esta arquitectura es más limpia que la
v0.1, que tenía dos costuras (diagnóstico→planificación y verificación→conclusión) y mezclaba
las responsabilidades en el medio.

La frontera respeta el principio de responsabilidad única: SM no define requisitos normativos,
OpenSpec no diagnostica causas. La "interfaz" entre ambos es un documento concreto — la
especificación validada producida por SM 09 — cuyo contenido se detalla en §4.3.

**Nota — los dos sentidos de "invocar" y la regla canónica de la frontera.** A lo largo de este
documento "invocar `openspec-*`" tiene dos sentidos que conviene distinguir para evitar
contradicciones aparentes (p. ej. entre §5.3 y §11.2):

1. **Automatización programática nueva a través de la frontera** (un skill puente que llame
   `openspec-*` por su cuenta, un gatillo automático, sincronización de estado). Esto está
   **prohibido** en v0.2 (ver §11.2 "sin orquestador maestro" y §11.3 `sm-openspec-bridge` "no
   implementar").
2. **El orquestador (el agente) carga y ejecuta un skill `openspec-*` en el mismo turno**,
   siguiendo el flujo SM. Esto es **inevitable y permitido** en Claude Code: los skills no se
   llaman entre sí, de modo que el agente es quien continúa el flujo.

Regla canónica: **SM nunca crea automatización programática a través de la frontera; el orquestador
(el agente) puede continuar a OpenSpec previa autorización del usuario en la frontera.** En v0.2 esa
autorización es **siempre un checkpoint explícito** (el orquestador se detiene tras la fase 09,
presenta la spec lista y el siguiente paso, y solo continúa con el OK del usuario). Pre-autorizar la
pausa por perfil (p. ej. Rápido/corrective) es una optimización diferida a v0.3, coherente con §12.7
("validar el flujo manual en 3–5 casos antes de automatizar").

---

## 4. Mapeo entre flujos

### 4.1 Correspondencia fase SM → rol en la integración

| Fase SM                    | Propósito SM                                                  | Rol en la integración                                   |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| 01 Observación             | Recoger señales del sistema                                   | Pre-OpenSpec: contexto inicial del caso                 |
| 02 Definición del problema | Enmarcar el problema                                          | Pre-OpenSpec: alimenta la especificación validada       |
| 03 Investigación           | Explorar el espacio, levantar alternativas                    | Pre-OpenSpec: identificar N hipótesis candidatas        |
| 04 Hipótesis               | Formular alternativas con criterios de éxito                  | Pre-OpenSpec: qué se va a probar                        |
| 05 Diseño experimental     | Planificar cómo se ejecutan las pruebas                       | Pre-OpenSpec: diseño del set experimental               |
| 06 Ejecución               | Ejecutar los experimentos (scripts, ramas throwaway, sandbox) | Pre-OpenSpec: producir datos de cada alternativa        |
| 07 Recolección             | Capturar resultados de cada experimento                       | Pre-OpenSpec: dataset para comparación                  |
| 08 Análisis                | Comparar alternativas, descartar inviables, trade-offs        | Pre-OpenSpec: seleccionar la ganadora con justificación |
| 09 Conclusión              | Veredicto + especificación validada del cambio                | **Frontera**: artefacto que alimenta OpenSpec           |
| 10 Comunicación            | Documentar, archivar, consolidar conocimiento                 | Post-OpenSpec: cierre del caso y del change             |

Notar la diferencia respecto a v0.1: las fases 06–08 ya **no** se equiparan con
`openspec-apply`/`openspec-verify`. Son actividades de investigación que viven en el expediente
del caso (ver §6).

**Nota sobre `openspec-explore`:** en la fase 03 de SM, si la investigación requiere comparar
alternativas de diseño técnico o explorar el espacio de posibles soluciones en profundidad,
invocar `openspec-explore` es coherente con el propósito de la fase. `openspec-explore` no
produce código ni abre changes; SM fase 03 tampoco. Ambos son "thinking partners" sin compromiso
de implementación. Esta nota se mantiene desde v0.1 sin cambios.

### 4.2 Correspondencia artefacto SM → artefacto OpenSpec

| Artefacto SM                 | Artefacto OpenSpec                                  | Relación                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-observation.md`          | —                                                   | Contexto del caso, no alimenta directamente                                                                                                                                                         |
| `02-problem-definition.md`   | —                                                   | Idem; consumido en la conclusión                                                                                                                                                                    |
| `03-research.md`             | —                                                   | Idem; consumido en la conclusión                                                                                                                                                                    |
| `04-hypothesis.md`           | —                                                   | Idem; describe alternativas, no la solución final                                                                                                                                                   |
| `05-experiment-design.md`    | —                                                   | Idem; planificación experimental                                                                                                                                                                    |
| `06-experiment-execution.md` | —                                                   | **No** equivalente a `openspec-apply`; es ejecución experimental                                                                                                                                    |
| `07-data-collection.md`      | —                                                   | **No** equivalente a `openspec-verify`; son datos crudos                                                                                                                                            |
| `08-analysis.md`             | —                                                   | Análisis comparativo interno; no alimenta specs directamente. Recibe (no aporta) el output de `openspec-verify` en Etapa B (ver §5.2)                                                               |
| `09-conclusion.md`           | `proposal.md` + `specs/` + `design.md` + `tasks.md` | **Fuente directa de los 4 artefactos OpenSpec**                                                                                                                                                     |
| `10-communication.md`        | post `openspec-sync` + `archive`                    | Cierre conjunto                                                                                                                                                                                     |
| `case.md`                    | `.openspec.yaml` + metadatos del change             | Manifests paralelos pero **asimétricos**: `case.md` es la única fuente de verdad del estado del caso (validada por el orquestador SM); `.openspec.yaml` es metadata auxiliar del change de OpenSpec |
| `experiments/*`              | —                                                   | Artefactos de experimentación, efímeros, no se promueven                                                                                                                                            |

El cambio principal respecto a v0.1: **toda la alimentación de OpenSpec se concentra en SM 09**.
Las fases 01–08 producen insumos para la conclusión, pero no se traducen una a una en artefactos
OpenSpec. Esto refleja la realidad: la especificación final emerge de la síntesis, no de un mapeo
mecánico fase a fase.

### 4.3 El nuevo artefacto: especificación validada de SM 09

La conclusión de SM fase 09 no es solo un veredicto: es una **especificación completa del cambio
que se va a implementar**, lista para alimentar los cuatro artefactos de OpenSpec. Su estructura
mínima es:

```markdown
# 09-conclusion.md — Especificación validada

## Veredicto

- **Hipótesis ganadora:** <descripción de la alternativa seleccionada>
- **Hipótesis descartadas:** <lista con justificación de cada descarte>
- **Nivel de confianza:** <basado en la robustez de la evidencia>
- **Riesgos residuales conocidos:** <lista>

## Especificación para OpenSpec

- **Problema:** <2-3 frases; alimenta proposal.md>
- **Alcance del cambio:** <archivos/módulos afectados>
- **Comportamiento esperado:** <requisitos en formato delta; alimenta specs/>
- **Decisiones arquitectónicas clave:** <alimenta design.md>
- **Criterios de aceptación:** <alimenta tasks.md y la verificación>
- **Evidencia experimental:** <referencia a 06/07/08 + experiments/>

## Referencias

- Case: <case-id>
- Expediente: maintenance-cases/<case-id>/
- Experiments: maintenance-cases/<case-id>/experiments/
```

Esta estructura es la **interfaz contractual** entre los dos sistemas. SM 09 la produce;
OpenSpec la consume. La calidad de la propuesta OpenSpec depende directamente de la calidad de
esta especificación.

---

## 5. Flujo integrado paso a paso

El flujo integrado tiene **tres etapas** (A, B, C) y un **único bucle de iteración** que vive
dentro de la Etapa A, no entre SM y OpenSpec.

### 5.1 Etapa A — Investigación científica completa (SM 01–09)

**Objetivo:** producir una especificación validada del cambio, respaldada por evidencia
experimental.

1. El usuario o el sistema detecta una señal de mantenimiento (fallo, degradación, deuda, riesgo).
2. `sm-orchestrator` clasifica el caso → elige perfil → crea `maintenance-cases/<case-id>/case.md`.
3. `sm-profile-<X>` escribe la `phase_policy` en `case.md`.
4. **Fase 01 — Observación:** recolecta síntomas, métricas, contexto del sistema. Output:
   `01-observation.md`.
5. **Fase 02 — Definición del problema:** encuadra el problema con precisión. Output:
   `02-problem-definition.md`.
6. **Fase 03 — Investigación:** explora causas raíz, antecedentes, patrones conocidos y
   alternativas. Si requiere explorar el espacio de soluciones, puede invocar `openspec-explore`.
   Output: `03-research.md`.
7. **Fase 04 — Hipótesis:** formula una o más soluciones candidatas, cada una con criterios de
   éxito medibles. Output: `04-hypothesis.md`.
8. **Fase 05 — Diseño experimental:** planifica cómo se van a ejecutar las pruebas de cada
   alternativa. Define el set experimental, las variables a medir y los criterios de éxito.
   Output: `05-experiment-design.md`.
9. **Fase 06 — Ejecución:** ejecuta los experimentos. Los artefactos resultantes viven en
   `maintenance-cases/<case-id>/experiments/` (ver §6). Output: `06-experiment-execution.md`.
10. **Fase 07 — Recolección de datos:** captura los resultados de cada experimento. Output:
    `07-data-collection.md`.
11. **Fase 08 — Análisis:** interpreta los datos, compara alternativas, descarta las inviables
    con justificación, evalúa trade-offs entre las viables. Output: `08-analysis.md`.
12. **Fase 09 — Conclusión:** emite el veredicto y produce la **especificación validada**
    (estructura en §4.3). Output: `09-conclusion.md` con la especificación lista para OpenSpec.

**Precondición para pasar a la Etapa B:** `09-conclusion.md` contiene una especificación con
problema definido, alcance acotado, comportamiento esperado, criterios de aceptación y
evidencia experimental. Si la conclusión es "no implementar" o "implementación diferida", el
caso sigue la trayectoria de Modo Solo SM (ver §7.3) y no se abre ningún change en OpenSpec.

---

### 5.2 Etapa B — Formalización e implementación (OpenSpec)

**Objetivo:** traducir la especificación validada de SM 09 en un change formal y ejecutarlo de
forma trazable y verificable.

**Quién conduce la Etapa B.** Toda la Etapa B —derivar los 4 artefactos OpenSpec desde
`09-conclusion.md`, ejecutar `openspec-propose`/`apply`/`verify` y re-ejecutar `08-analysis.md` con
el output de verify— la conduce el **orquestador SM** (el agente), **no** la fase 09 ni la fase 08.
Las fases solo deben quedar re-ejecutables e idempotentes; el disparo y la ingesta los hace el
orquestador. El cruce de la frontera requiere autorización del usuario: en v0.2, un **checkpoint
explícito** tras la fase 09 (ver la nota de §3.3). Con esa autorización el orquestador continúa sin
crear ninguna automatización programática nueva.

1. El orquestador SM, **previa autorización del usuario en la frontera**, ejecuta
   **`openspec-propose`** (o `openspec-ff`/`openspec-continue` según el modo) para crear el
   change. El nombre del change sigue la convención de §10.2 (típicamente idéntico al
   `case-id`).
2. Los cuatro artefactos de OpenSpec se redactan alimentándose **principalmente** de la
   especificación validada. `proposal.md`, `specs/` y `tasks.md` se redactan exclusivamente
   desde `09-conclusion.md`; `design.md` puede referenciar también `03-research.md` para
   documentar las alternativas descartadas en la fase de investigación:

   | Artefacto OpenSpec | Fuente                                                                       | Contenido clave                                  |
   | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------ |
   | `proposal.md`      | `09-conclusion.md` (sección "Problema")                                      | _Why_: problema, motivación, alcance, impacto    |
   | `specs/`           | `09-conclusion.md` (sección "Comportamiento esperado")                       | _What_: delta normativo (ADDED/MODIFIED/REMOVED) |
   | `design.md`        | `09-conclusion.md` (sección "Decisiones arquitectónicas") + `03-research.md` | _How_: decisiones, alternativas ya descartadas   |
   | `tasks.md`         | `09-conclusion.md` (sección "Criterios de aceptación")                       | _What exactly_: pasos accionables                |

3. Se establece la referencia cruzada bidireccional:
   - En `proposal.md` se añade una sección `## Contexto SM` con el `case-id` y enlace al
     expediente.
   - En `case.md` se registra el nombre del change en el campo `openspec_change` del bloque
     YAML canónico.
4. **`openspec-apply`:** ejecuta `tasks.md` y deja el código en producción.
5. **`openspec-verify`:** comprueba la implementación contra los artefactos OpenSpec, especialmente
   `specs/`. El output de verify (CRITICAL/WARNING/SUGGESTION) se incorpora como una
   **re-ejecución de `08-analysis.md`** (bump de versión MINOR), según la convención de
   versionado de SM §8.4 (MINOR++ al re-ejecutar una fase sobre los mismos insumos
   ampliados). No se toca `07-data-collection.md`: los datos crudos de experimentación
   (fase 07) son distintos del output de verificación, que es material de análisis
   (coherente con §4.2 y §8.1). El bloque `phases` del `case.md` marca la fase 08 como
   `done` con la versión actualizada.

**Precondición para pasar a la Etapa C:** `openspec-verify` no emite CRITICALs, o los CRITICALs
emitidos son aceptados por el usuario como fuera del alcance de este caso (en cuyo caso se
documentan explícitamente en `08-analysis.md`).

---

### 5.3 Etapa C — Comunicación y consolidación (SM 10)

**Objetivo:** cerrar el ciclo científico y archivar el change de OpenSpec de forma unificada.

1. El orquestador SM, **previa autorización del usuario en la frontera**, ejecuta la fase 10 con la
   siguiente secuencia (los pasos que cruzan a OpenSpec —`sync`/`archive`— quedan cubiertos por esa
   misma autorización; el orquestador no crea automatización programática nueva, ver §3.3):
   - Cierra `08-analysis.md` y `09-conclusion.md` con el veredicto final sobre la hipótesis
     (confirmada, refutada parcialmente, refutada).
   - **Si la hipótesis quedó confirmada** (la implementación cumple `specs/` y `openspec-verify`
     no dejó CRITICALs pendientes, o los CRITICALs fueron aceptados como fuera de alcance):
     - Ejecuta **`openspec-sync`** para mergear los deltas en `openspec/specs/`.
     - Ejecuta **`openspec-archive`** para mover el change a `openspec/changes/archive/`.
   - **Si la hipótesis quedó refutada** (la implementación no produjo el efecto esperado o
     `openspec-verify` reportó CRITICALs no aceptados):
     - Si `openspec-apply` ejecutó código en el repositorio, el caso documenta el **`git revert`
       del apply** como paso de cierre, pero **lo ejecuta el usuario**: SM documenta, no ejecuta
       (ver §11.2). No se trata de un rollback automático.
     - Se omiten `openspec-sync` y `openspec-archive`. El change de OpenSpec queda como
       artefacto histórico del intento; opcionalmente se elimina manualmente si se decide
       que no aporta trazabilidad.
   - Ejecuta el **generador on-demand** con `--pending "<subject>" --case <id>` para
     actualizar `CHANGELOG.md`.
   - Escribe la **lección destilada** en `.claude/memory/<lesson-slug>.md` y la añade al
     índice `MEMORY.md`.
   - Crea el **commit unificado** con metadatos de commit (en la convención de Git: _metadatos de commit_) `Case: <case-id>` y, si el change fue archivado,
     `OpenSpec-Change: <name>`.
2. El expediente `maintenance-cases/<case-id>/` queda intacto como evidencia histórica del
   caso.
3. La carpeta `experiments/` puede purgarse selectivamente (ver §6.4) si se decide que algunos
   artefactos experimentales no se conservan a largo plazo.

---

### 5.4 Bucle de iteración: dentro de SM, no entre SM y OpenSpec

Si durante la Etapa A la evidencia experimental no sostiene la hipótesis seleccionada, el
orquestador SM itera **dentro de las fases 06–09** sin involucrar a OpenSpec:

```
08-analysis.md (hipótesis no sostenida)
  └─► revisar 04-hypothesis.md: ¿se mantiene la hipótesis? ¿se reformula? ¿se descarta?
  └─► revisar 05-experiment-design.md: ¿faltan experimentos? ¿hay que probar otra cosa?
  └─► repetir fases 06–08 (o, si la hipótesis se descarta, volver a 04 con una nueva candidata)
  └─► emitir nueva 09-conclusion.md
```

Si durante la Etapa B `openspec-verify` emite CRITICALs, el orquestador evalúa la causa:

- **Error de implementación** (el código no cumple lo que `09-conclusion.md` especificaba): se
  reabre `openspec-apply` y se corrige. Los artefactos del change no cambian; solo se re-ejecuta
  el apply con la corrección.

- **Error de especificación** (SM 09 estaba incompleta o era incorrecta y el verify lo reveló):
  1. Producir `09-conclusion.md` v1.1 con la especificación corregida.
  2. Actualizar los artefactos del change **en place** desde SM 09 v1.1: `proposal.md`,
     `specs/`, `tasks.md`; `design.md` si cambió alguna decisión arquitectónica. No se crea un
     nuevo change ni se vuelve a ejecutar `openspec-propose`.
  3. Re-ejecutar `openspec-apply` → `openspec-verify`.
  4. Si los CRITICALs persisten más de dos iteraciones, reconsiderar la hipótesis (volver al
     bucle de Etapa A).

En cualquier caso, OpenSpec no se mueve por su cuenta: solo ejecuta la especificación validada
y reporta desviaciones.

Cada iteración produce versiones nuevas de los artefactos SM (v1.1, v1.2, …) sin sobreescribir
las anteriores (idempotencia y reanudabilidad, §2.6 de SM). El bloque `phases` de `case.md`
marca la fase como `in_progress` durante la iteración y `done` al cierre con la versión final.

**Diferencia clave respecto a v0.1:** el bucle ya no alterna entre SM y OpenSpec, sino que vive
enteramente dentro de SM. `openspec-propose` se ejecuta una sola vez por caso (el change se
crea una sola vez); `openspec-apply` y `openspec-verify` pueden repetirse dentro de Etapa B
hasta que la especificación y la implementación converjan.

#### 5.4.1 Bucle del espacio de soluciones — sub-bucle secuencial

El bucle de iteración de §5.4 opera sobre el **espacio de causas** (hipótesis de causa raíz).
Cuando la causa raíz es confirmada en fase 08, se abre un segundo bucle sobre el **espacio de
soluciones** (alternativas de fix). El orden es estrictamente secuencial: primero se recorre
el espacio de causas, luego —solo si la causa fue confirmada— se recorre el espacio de
soluciones. El bucle de soluciones nunca se abre antes de tener la causa confirmada.

```
Flujo completo — causa confirmada primero, luego solución
═════════════════════════════════════════════════════════

  BUCLE DE CAUSA (04→08)
  04-hypothesis.md  →  H1, H2... (cause hypotheses)
          │
          ▼
  05-experiment-design.md  →  repro experiment
          │
          ▼
  06-experiment-execution.md  →  run, record
          │
          ▼
  07-data-collection.md  →  normalize
          │
          ▼
  08-analysis.md  →  causa confirmada o refutada
          │
          ├── refutada → volver a 04 con siguiente hipótesis de causa
          │
          └── confirmada
                  │
                  ▼  AHORA se abre el BUCLE DE SOLUCIONES
                  │
  04-hypothesis.md §Solution hypotheses  →  S1, S2, S3... (from 03-research)
          │
          ▼
  05-experiment-design.md  →  comparative procedure (same metrics for all)
          │
          ▼
  06-experiment-execution.md  →  run S1 → S2 → S3 sequentially (rollback between)
          │
          ▼
  07-data-collection.md  →  comparative metrics table
          │
          ▼
  08-analysis.md §Solution comparison  →  winner verdict + discard reasons
          │
          ▼  (only if winner exists)
  09-conclusion.md  →  spec cites §Solution comparison (cross-reference mandatory)
```

**Regla:** la fase 09 no emite la spec validada si `08-analysis.md` no contiene una sección
`## Solution comparison` con veredicto de ganadora. El Orchestrator verifica esta precondición
antes de cruzar a Etapa B. Si la sección falta, la fase 09 debe halt — el caso no puede
avanzar sin comparativo de soluciones.

El bucle de soluciones responde a la pregunta: *"de las alternativas viables para eliminar
el defecto, ¿cuál produce el mejor trade-off y por qué?"* — frente al bucle de causa que
responde: *"¿qué produjo el defecto?"*.

---

## 6. Dónde viven los artefactos de experimentación

Esta sección responde una pregunta que la propuesta v0.1 no necesitaba formular: si los
experimentos no son `openspec-apply`, ¿dónde están?

### 6.1 Naturaleza efímera de los experimentos

Los artefactos de la fase 06–08 de SM son, por naturaleza, **exploratorios y descartables**:

- Scripts de benchmark que se ejecutan una vez y se descartan.
- Implementaciones throwaway de una hipótesis para medir su rendimiento.
- Datos crudos de telemetría o profiling.
- Notas de análisis intermedias.

Esto no significa que carezcan de valor: son la **evidencia** sobre la cual se sostiene la
conclusión. Pero no son código de producción, no son specs, no son cambios formales. Viven en
una zona intermedia del expediente.

### 6.2 Carpeta `experiments/` dentro del expediente

Convención propuesta: los artefactos experimentales se almacenan en
`maintenance-cases/<case-id>/experiments/`, organizada por hipótesis probada:

```
maintenance-cases/<case-id>/
├── case.md
├── 01-observation.md
├── …
├── 06-experiment-execution.md
├── 07-data-collection.md
├── 08-analysis.md
├── 09-conclusion.md
├── 10-communication.md
└── experiments/
    ├── hypothesis-A/
    │   ├── script.sh            # script del experimento
    │   ├── data.csv             # datos crudos
    │   ├── notes.md             # notas del experimentador
    │   └── result-summary.md    # resumen del resultado
    ├── hypothesis-B/
    │   └── …
    └── hypothesis-C/
        └── …
```

Cada subcarpeta `hypothesis-X/` corresponde a una alternativa considerada en SM 04. Los
artefactos dentro son autoexplicativos y están versionados junto con el resto del expediente
(porque viven en el mismo directorio rastreado por git).

### 6.3 Convenciones para scripts, ramas y datos

- **Scripts y datos pequeños** (algunos cientos de líneas/KB): van directamente a
  `experiments/hypothesis-X/`.
- **Implementaciones más grandes** (más de unos cientos de líneas): se sugiere usar una **rama
  git throwaway** con nombre `exp/<case-id>/hypothesis-X`. Los commits llevan los metadatos de commit
  `Case: <case-id>` pero no se mergean; la rama queda en el historial como referencia. Al
  cerrar el caso, la decisión de borrar o conservar la rama se documenta en
  `09-conclusion.md`.
- **Datos voluminosos** (cientos de MB o más): no se commitean; se almacenan externamente y
  `experiments/hypothesis-X/data-location.md` registra la ruta y el método de acceso.
- **Análisis intermedios** (notebooks, sketches): se commitean en la subcarpeta de la hipótesis
  correspondiente.

### 6.4 Qué se conserva y qué se descarta al cierre

Al cierre del caso (fase 10), la decisión sobre qué artefactos de `experiments/` se conservan a
largo plazo queda registrada en `10-communication.md`:

- **Se conservan** los scripts y datos que sustentan evidencia citada en `09-conclusion.md`
  (necesarios para auditoría posterior).
- **Se conservan** las notas de análisis si contienen insights reutilizables.
- **Se descartan** los artefactos efímeros cuyo valor era solo operacional (logs de ejecución,
  archivos temporales regenerables).
- **Se decide rama por rama** qué hacer con las ramas throwaway de `exp/<case-id>/hypothesis-X`:
  conservar (referencia histórica) o borrar (limpieza).

El principio rector: **lo que sostiene evidencia se conserva; lo que solo se usó para llegar a
la evidencia se descarta**. El archivo del caso debe ser suficiente para que un revisor futuro
verifique la conclusión sin tener que rehacer los experimentos.

---

## 7. Modos de integración

No todos los casos requieren el flujo completo. La elección del modo depende del perfil de
mantenimiento y la complejidad del problema. Los cuatro modos son:

### 7.1 Modo Completo (preventive, perfective)

**Cuándo:** problemas complejos, causa raíz incierta, alto riesgo, perfil preventive o
perfective. Múltiples alternativas a comparar.

```
SM 01 → 02 → 03 → 04 (N hipótesis) → 05 → 06 → 07 → 08 (descartes + comparación)
     → 09 (especificación validada) → OpenSpec propose → apply → verify
     → SM 10 → OpenSpec sync + archive
```

**Artefactos producidos:** 10 artefactos SM + subcarpeta `experiments/` con N hipótesis + 4
artefactos OpenSpec + specs actualizadas.

### 7.2 Modo Rápido (corrective)

**Cuándo:** problemas conocidos, causa raíz obvia, bajo riesgo, perfil corrective.
Tipicamente una sola hipótesis, evidencia mínima.

```
SM 01(low) → 02(low) → 03(low) → 04(1 hipótesis) → 05(low)
          → 06(1 experimento breve) → 07(low) → 08(low)
          → 09 (especificación validada mínima) → OpenSpec propose (ff)
          → apply → verify → SM 10(low) → OpenSpec sync + archive
```

**Diferencia clave respecto al Modo Completo:** SM opera con dos dimensiones ortogonales:
`case_mode: consolidated` (un único `case.md` con subsecciones por fase en lugar de 10 archivos
independientes) y `reasoning_effort: low` por fase (artefactos breves; convención de §9.5). La
especificación validada (SM 09) puede ser mínima pero sigue siendo el puente obligatorio con
OpenSpec. La investigación se minimiza; la implementación se acelera.

### 7.3 Modo Solo SM (investigación sin cambio listo)

**Cuándo:** la señal de mantenimiento requiere investigación pero la conclusión es
"implementación diferida" (fuera del sprint actual) o "no implementar" (el problema no
amerita un cambio).

```
SM 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 ("diferido" o "no implementar")
     → SM 10 (solo changelog + lección; SIN OpenSpec)
```

No se abre ningún change en OpenSpec. El caso SM queda como registro de la investigación para
referencia futura. Si en el futuro la decisión cambia, se puede abrir un nuevo caso que
referencie a este como `previous_research`.

Este modo deja de ser un caso especial: es la trayectoria natural cuando la investigación no
produce un cambio listo.

### 7.4 Modo Solo OpenSpec (cambio pre-validado)

**Cuándo:** el cambio ya está validado externamente (requisito explícito del usuario, bug
reportado con causa raíz conocida) y no se necesita diagnóstico ni experimentación.

```
OpenSpec propose → apply → verify → sync → archive
```

Opcionalmente: si el cambio reveló algo inesperado, la lección puede registrarse manualmente
en `.claude/memory/`. **Limitación:** el generador de CHANGELOG y la escritura de lecciones
son mecanismos de SM fase 10 y no están disponibles como operaciones autónomas sin un
expediente SM (`--case <id>` no aplica). No se crea un expediente SM completo.

### 7.5 Matriz modo × perfil

| Perfil         | Modo primario     | Modos aceptables                                       | Notas                                                          |
| -------------- | ----------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| **Corrective** | Rápido            | Solo OpenSpec (si la causa es trivial)                 | `case_mode: consolidated` por defecto; `openspec-ff` preferido |
| **Adaptive**   | Completo o Rápido | Solo OpenSpec (raro)                                   | Selección según complejidad del cambio externo                 |
| **Perfective** | Completo          | —                                                      | Investigación y comparación de alternativas son el valor       |
| **Preventive** | Completo          | Solo SM (cuando se concluye "implementación diferida") | Profundidad máxima; suele requerir múltiples hipótesis         |

---

## 8. Modelo de artefactos integrado

### 8.1 Árbol de directorios combinado

Los dos sistemas coexisten en el mismo repositorio sin colisión de directorios:

```
repo/
├── openspec/
│   ├── specs/                              # fuente de verdad normativa (OpenSpec)
│   └── changes/
│       ├── <case-id>/                      # change activo (nombre = case-id o slug derivado)
│       │   ├── .openspec.yaml
│       │   ├── proposal.md                 ◄── alimentado por SM 09 (sección "Problema")
│       │   ├── design.md                   ◄── alimentado por SM 09 (decisiones) + 03
│       │   ├── tasks.md                    ◄── alimentado por SM 09 (criterios)
│       │   └── specs/                      ◄── alimentado por SM 09 (comportamiento esperado)
│       └── archive/                        # changes archivados
│
├── maintenance-cases/
│   └── <case-id>/                          # expediente SM (nombre idéntico al change OpenSpec)
│       ├── case.md                         # manifest SM (campo openspec_change: <name>)
│       ├── 01-observation.md
│       ├── 02-problem-definition.md
│       ├── 03-research.md
│       ├── 04-hypothesis.md
│       ├── 05-experiment-design.md
│       ├── 06-experiment-execution.md      ◄── registra ejecución de experiments/
│       ├── 07-data-collection.md           ◄── captura datos de experiments/
│       ├── 08-analysis.md                  ◄── análisis + output de openspec-verify
│       ├── 09-conclusion.md                ◄── ESPECIFICACIÓN VALIDADA (interfaz con OpenSpec)
│       ├── 10-communication.md
│       └── experiments/                    # artefactos de experimentación (efímeros)
│           ├── hypothesis-A/
│           ├── hypothesis-B/
│           └── …
│
├── .claude/
│   ├── skills/
│   │   ├── sm-orchestrator/                # skills SM (diseño; no implementados aún)
│   │   ├── sm-profile-*/
│   │   ├── sm-phase-*/
│   │   ├── openspec-specialist/            # skills OpenSpec (implementados)
│   │   ├── openspec-propose/
│   │   ├── openspec-ff/                    # fast-forward: todos los artefactos en un paso
│   │   ├── openspec-continue/              # paso a paso: siguiente artefacto en orden
│   │   ├── openspec-explore/               # modo exploración: sin código, solo diseño
│   │   ├── openspec-apply/
│   │   ├── openspec-verify/
│   │   ├── openspec-sync/
│   │   └── openspec-archive/
│   ├── memory/                             # base de conocimiento SM
│   │   ├── MEMORY.md
│   │   └── <lesson-slug>.md
│   └── CLAUDE.md
│
└── CHANGELOG.md                            # derivado on-demand (generador SM)
```

**Convención de nomenclatura:** el `case-id` de SM y el nombre del change en OpenSpec deben ser
idénticos o relacionados por una convención explícita (p. ej. el change en OpenSpec se nombra
igual que el `case-id` de SM). Esto permite navegación directa entre ambos expedientes.

### 8.2 Ciclo de vida de artefactos

```
Señal de mantenimiento
  │
  ▼
maintenance-cases/<case-id>/case.md       [creado por sm-orchestrator]
  │
  ├──► 01-observation.md
  ├──► 02-problem-definition.md
  ├──► 03-research.md
  ├──► 04-hypothesis.md
  ├──► 05-experiment-design.md
  │
  ├──► experiments/                        [creado al ejecutar fase 06]
  │       ├── hypothesis-A/  ─┐
  │       ├── hypothesis-B/  ─┤ cada uno con scripts, datos, notas
  │       └── hypothesis-C/  ─┘
  │
  ├──► 06-experiment-execution.md          ◄── registra qué se ejecutó
  ├──► 07-data-collection.md               ◄── captura resultados
  ├──► 08-analysis.md                      ◄── compara y descarta
  │
  └──► 09-conclusion.md  ◄───────────────┐
                                        │  [ESPECIFICACIÓN VALIDADA]
                                        │   (interfaz con OpenSpec)
                                        │
   openspec/changes/<case-id>/          │
     ├── proposal.md ◄──────────────────┘
     ├── specs/ ◄──────────────────────┘
     ├── design.md ◄───────────────────┘
     └── tasks.md ◄────────────────────┘
                  │
                  │  [openspec-apply]
                  │  [openspec-verify]
                  │
   ├──► 08-analysis.md (actualizado con output de verify)
   └──► 09-conclusion.md (veredicto final)
         │
         ├── hipótesis confirmada ──► [openspec-sync] ──► openspec/specs/ actualizado
         │                       └──► [openspec-archive] ──► archive/
         └── hipótesis refutada ──► no sync · no archive · caso cerrado con lección
  │
  └──► 10-communication.md
         ├── generador on-demand ──► CHANGELOG.md
         ├── lección ──► .claude/memory/<slug>.md
         └── commit de cierre: Case: <case-id>  (+ OpenSpec-Change: <name> solo si archivado)
```

### 8.3 Responsabilidades de mantenimiento por tipo de artefacto

| Tipo de artefacto                  | Mantenimiento                                                                    | Versionado                                         | Quién lo modifica    |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------- |
| `case.md` y 01–10                  | Curado por SM (orquestador + perfil + fases)                                     | Git normal; bloque YAML canónico valida            | Orquestador SM       |
| `experiments/*`                    | Creado durante fase 06; revisado en fase 08; decisión de conservación en fase 10 | Git para scripts/notas; externo para datos grandes | Equipo del caso      |
| Ramas `exp/<case-id>/hypothesis-X` | Throwaway; decisión de merge/borrar documentada                                  | Git (rama, no merge)                               | Equipo del caso      |
| `openspec/changes/<case-id>/*`     | Curado por OpenSpec                                                              | Git normal; validado por `openspec validate`       | Orquestador OpenSpec |
| `openspec/specs/*`                 | Actualizado por `openspec-sync`                                                  | Git; fuente de verdad normativa                    | Agente de sync       |
| `.claude/memory/*`                 | Escrito por SM fase 10                                                           | Git; una lección por archivo                       | Orquestador SM       |
| `CHANGELOG.md`                     | Derivado on-demand                                                               | Git; regenerable desde git log                     | Generador            |

---

## 9. Integración por perfil de mantenimiento

El perfil SM no solo modula cómo se ejecutan las fases del método científico: también determina
**cuánta experimentación se necesita** y, por lo tanto, **qué modo de integración aplica**.

### 9.1 Corrective

**Característica:** restauración rápida del servicio; diagnóstico mínimo.

- **Modo primario:** Rápido (§7.2) con `case_mode: consolidated`.
- **Hipótesis:** típicamente una sola (la corrección obvia).
- **Experimentación:** verificación rápida (reproducir el bug, aplicar el fix, validar que no
  aparece). Artefactos en `experiments/fix-verification/`.
- **OpenSpec:** usar `openspec-ff` para minimizar el tiempo de ciclo. Specs reducidas al delta
  mínimo.

### 9.2 Adaptive

**Característica:** adaptación a nueva condición externa (nueva versión de dependencia, nuevo
requisito regulatorio, cambio en API de proveedor). Causa raíz moderadamente incierta.

- **Modo primario:** Completo o Rápido según complejidad del cambio.
- **Hipótesis:** 1–3 alternativas (distintas formas de adaptarse).
- **Experimentación:** pruebas de integración con la nueva condición. Datos de compatibilidad y
  regresión.
- **OpenSpec:** `specs/` describe el nuevo comportamiento requerido; `design.md` documenta las
  restricciones externas que originan el cambio.

### 9.3 Perfective

**Característica:** mejora de calidad interna (rendimiento, mantenibilidad, deuda técnica). No
hay urgencia; el valor se acumula en el tiempo.

- **Modo primario:** Completo.
- **Hipótesis:** múltiples alternativas (diseños arquitectónicos rivales, refactorings posibles).
- **Experimentación:** benchmarks, profiling, análisis de complejidad. Esta es la categoría donde
  la carpeta `experiments/` tiene su mayor valor: las alternativas son intrínsecamente
  comparables y la evidencia es robusta.
- **OpenSpec:** `openspec-explore` puede invocarse desde SM 03 para comparar opciones a nivel de
  diseño técnico. `design.md` tiene mayor profundidad. Specs cubren mejoras de comportamiento
  medible.

### 9.4 Preventive

**Característica:** reducción de riesgo futuro. Investigación profunda, alcance amplio.

- **Modo primario:** Completo siempre. Acepta el Modo Solo SM (§7.3) si la conclusión es
  "implementación diferida por costo/oportunidad".
- **Hipótesis:** múltiples, a menudo en paralelo. La investigación puede tomar varios ciclos.
- **Experimentación:** extensa. Pruebas de carga, pruebas de fallo, simulaciones, análisis de
  modo de fallo. `experiments/` puede ser voluminoso.
- **OpenSpec:** `specs/` añade requisitos de guardia (monitoreo, alertas, límites). `openspec-verify`
  incluye criterios de cobertura y robustez. `openspec-archive` solo ocurre cuando la
  implementación efectivamente reduce el riesgo; si la verificación no respalda la hipótesis
  preventiva, el caso se cierra como "hipótesis refutada" sin sincronizar.

### 9.5 Secuencia compacta por perfil

```
Corrective:  01(low)→02(low)→03(low)→04(1 hipótesis)→05(low)→06(1 breve)→07(low)→08(low)
            →09→[OpenSpec ff]→10(low)
Adaptive:    01→02→03→04(1-3)→05→06→07→08→09→[OpenSpec ff/continue]→10
Perfective:  01→02→03(+explore)→04(múltiples)→05→06(completa)→07→08→09→[OpenSpec continue]→10
Preventive:  01→02→03(high+explore)→04(múltiples)→05→06(extensa)→07→08(high)→09→[OpenSpec continue]→10
```

(`low`/`medium`/`high` = esfuerzo creciente; las secuencias muestran solo los
niveles relevantes por perfil; `+explore` = invocar `openspec-explore` como parte de la
investigación SM)

---

## 10. Trazabilidad bidireccional

### 10.1 Cadena de trazabilidad

La integración mantiene una cadena de trazabilidad completa que une la señal original con el
código en producción:

```
señal de mantenimiento
  └─► case-id (SM)
        └─► expediente SM (maintenance-cases/<case-id>/)
              └─► experiments/ (evidencia de la investigación)
              └─► 09-conclusion.md (especificación validada)
                    └─► change name en OpenSpec (= case-id)
                          └─► openspec/changes/<case-id>/ (proposal, specs, design, tasks)
                                └─► commit de cierre con metadatos de commit Case: <case-id> + OpenSpec-Change: <name> (camino archivado)
                                      └─► CHANGELOG.md (entrada generada on-demand)
                                            └─► openspec/changes/archive/YYYY-MM-DD-<case-id>/
                                                  └─► openspec/specs/ (delta mergeado)
```

Cada eslabón es navegable en una o dos direcciones, y la trazabilidad es **bidireccional** desde
el caso al change y desde el change al caso.

### 10.2 Reglas de enlace entre expedientes

1. El campo `openspec_change` en el bloque YAML canónico de `case.md` contiene el nombre exacto
   del change en OpenSpec. Si el caso es Modo Solo SM, este campo queda vacío.
2. `proposal.md` de OpenSpec incluye una sección `## Contexto SM` con el `case-id` y ruta al
   expediente. Si el change es Modo Solo OpenSpec, esta sección queda vacía o se omite.
3. Todo commit producido durante la Etapa B (OpenSpec) lleva los metadatos de commit `Case: <case-id>`. Los
   commits de la Etapa A (experimentación) llevan solo `Case: <case-id>` (sin OpenSpec-Change,
   porque todavía no hay change).
4. Los metadatos de commit `OpenSpec-Change: <name>` aparecen únicamente en el commit de cierre de Etapa C, y
   solo si el change fue archivado (hipótesis confirmada → `openspec-archive`). Ningún commit de
   Etapas A o B lo lleva (ver §5.3 y §10.3).
5. La entrada del changelog generada por SM fase 10 referencia tanto el `case-id` como el nombre
   del change archivado en OpenSpec.
6. La convención de nomenclatura `case-id = change name` se aplica siempre que ambos expedientes
   existan; en Modo Solo SM no hay change, y en Modo Solo OpenSpec no hay case-id.

### 10.3 Ejemplo de commit unificado

El commit de cierre (Etapa C) lleva ambos metadatos de commit. Ejemplo:

```
fix(proxy): corregir manejo de timeout en proveedor Anthropic

Experimento validado: la hipótesis de que el timeout de 30s era insuficiente
para modelos de alta latencia se confirmó tras benchmarks con p95 y p99.
Se ajustó a 90s con retry exponencial.

Case: 20260601-proxy-timeout-anthropic
OpenSpec-Change: 20260601-proxy-timeout-anthropic
```

Los commits intermedios (Etapas A y B) llevan solo `Case: <case-id>`. Los metadatos de commit
`OpenSpec-Change:` aparecen únicamente en el commit de cierre de Etapa C, y solo si el change fue
archivado (ver §5.3 y reglas 3 y 4 de §10.2).

---

## 11. Supuestos, límites y decisiones fuera de alcance

### 11.1 Supuestos

- Ambos sistemas operan en el mismo repositorio y en el mismo contexto de Claude Code.
- El usuario es quien invoca los workflows; no existe automatización de gatillado (p. ej.
  webhooks que abran un case SM ante un fallo en producción).
- La convención `case-id = change name en OpenSpec` se mantiene manualmente; no hay
  sincronización automática entre los dos manifests (`case.md` y `.openspec.yaml`).
- La carpeta `experiments/` se commitea al repo y se versiona con git, excepto datos
  voluminosos que se almacenan externamente (con `data-location.md` registrando la ruta).
- El usuario es responsable de decidir qué artefactos de `experiments/` se conservan al
  cierre; el sistema no lo hace automáticamente.

### 11.2 Límites explícitos

- **Sin orquestador maestro.** No existe (ni se propone en esta versión) un skill único que
  conduzca ambos sistemas de extremo a extremo. El usuario decide cuándo transitar de SM a
  OpenSpec y viceversa, siguiendo este documento como guía. Un orquestador maestro añadiría
  complejidad sin garantías adicionales del runtime de Claude Code.
- **Sin sincronización de estado.** `case.md` y `.openspec.yaml` no se sincronizan
  automáticamente. El campo `openspec_change` en `case.md` y la sección `## Contexto SM` en
  `proposal.md` son convenciones editoriales, no enlaces estructurados.
- **Sin gestión de conflictos entre cases SM simultáneos.** Si dos cases SM modifican el mismo
  delta de specs en OpenSpec, la resolución de conflictos en `openspec-sync` es manual.
- **La refutación de una hipótesis no revierte automáticamente el apply.** SM fase 10 puede
  concluir que la hipótesis fue refutada tras `openspec-verify`, pero el rollback del código es
  responsabilidad del usuario (`git revert`). SM documenta la decisión; no la ejecuta.
- **La experimentación puede ser costosa en tiempo y recursos.** El diseño no impone límites al
  tamaño de la carpeta `experiments/` ni a la duración de la fase 06. El usuario y el
  orquestador SM son responsables de mantener la experimentación acotada; este documento no
  prescribe cómo.
- **El branch de `openspec-verify` puede divergir de la hipótesis inicial.** Si la verificación
  revela que la implementación es correcta (cumple specs) pero la hipótesis original era
  errónea (resolver el problema no produjo el efecto esperado), se reabre SM para refinar la
  hipótesis. Esto está soportado por el bucle de §5.4 pero requiere disciplina editorial.

### 11.3 Fuera de alcance deliberado

- **Integración con sistemas de monitoreo externos** como fuente de señales para SM fase 01.
  La observación sigue siendo manual o a través de herramientas externas cuyo contenido se
  incorpora como insumo, no como automatización.
- **Versionado semántico automático** basado en el tipo de casos cerrados.
- **Planificación multi-caso con dependencias cruzadas** entre cases SM y changes OpenSpec
  (este es terreno de `openspec-roadmap-manager`, no de este flujo).
- **Orquestador maestro SM↔OpenSpec** (`sm-openspec-bridge` o similar). Candidato para una
  iteración futura de diseño una vez el flujo manual esté validado en al menos 3–5 casos
  reales; no implementar en v0.2. Requiere aprobación explícita antes de cualquier diseño
  detallado.
- **Limpieza automática de `experiments/`.** La decisión de qué conservar y qué descartar es
  humana, registrada en `10-communication.md`. No hay poda automática.
- **Sincronización bidireccional de manifests.** `case.md` y `.openspec.yaml` siguen siendo
  documentos paralelos; cualquier sincronización sería fuente de bugs y deuda de coherencia.

---

## 12. Recomendaciones de implementación

Las siguientes recomendaciones están ordenadas por prioridad y son mayormente independientes;
se pueden adoptar incrementalmente. (Excepciones: las recomendaciones 2 y 4 tocan el mismo
template `case.md`; la 8 desarrolla la política ya esbozada en §6.4 y §11.3.)

**1. Convención de nomenclatura (sin código nuevo)**
Adoptar la regla `case-id = change name en OpenSpec` desde el primer caso integrado. Requiere
solo disciplina editorial; cero implementación.

**2. Campo `openspec_change` en la plantilla `case.md`**
Añadir `openspec_change: ""` al bloque YAML canónico de
`.claude/skills/sm-orchestrator/templates/case.md`. El orquestador lo rellena cuando se abre
el change en OpenSpec; queda vacío en Modo Solo SM.

**3. Sección `## Contexto SM` en `proposal.md`**
En v0.2 la sección `## Contexto SM` (con `case_id` y ruta al expediente) la escribe **el
orquestador SM** al derivar `proposal.md` desde `09-conclusion.md`, en la Etapa B (lado SM). No se
toca la configuración de OpenSpec en esta fase. El enfoque alternativo —añadir la instrucción en
`openspec/config.yaml` bajo `rules.proposal` para que OpenSpec la solicite por su cuenta— queda como
**optimización futura fuera de alcance** (acopla los dos sistemas a través de la config de OpenSpec).
Si no hay case SM asociado, la sección se omite.

**4. Estructura de la especificación validada (nuevo artefacto)**
Documentar y/o formalizar la estructura de `09-conclusion.md` propuesta en §4.3 como plantilla
reutilizable. Considerar incluirla en
`.claude/skills/sm-orchestrator/templates/case.md` o en un template nuevo
`conclusion-spec.md`. Esta es la interfaz contractual entre los dos sistemas y su
estandarización es prioritaria.

**5. Convención para la carpeta `experiments/`**
Documentar la convención de §6 (organización por hipótesis, scripts/datos, ramas throwaway,
datos voluminosos) en `.claude/skills/sm-orchestrator/references/artifact-conventions.md` o en
una referencia nueva. Sin convención, cada caso improvisará su propia organización.

**6. Metadatos de commit `OpenSpec-Change` en commits**
Extender la convención de commits para incluir `OpenSpec-Change: <name>` en el commit de cierre
de Etapa C, y solo cuando el change haya sido archivado. Los commits de Etapas A y B llevan
únicamente `Case: <case-id>`.

**7. Validar el flujo en los próximos casos reales**
Aplicar el Modo Completo (§7.1) en el próximo caso perfective o preventive, y el Modo
Rápido (§7.2) en el próximo corrective. Documentar las fricciones como lecciones en la base
de conocimiento SM. Las fricciones más probables son:

- Resistencia del usuario a ejecutar las 10 fases de SM antes de implementar (mitigación:
  mostrar que el Modo Rápido cubre los casos triviales).
- Ambigüedad en qué constituye "evidencia suficiente" para emitir la especificación
  validada (mitigación: documentar en cada caso el criterio usado).
- Dificultad para mantener la disciplina de la carpeta `experiments/` (mitigación: revisar
  periódicamente y podar).

**8. Política de conservación de `experiments/`**
Definir y documentar una política por defecto para la retención de artefactos
experimentales (p. ej. "todo lo que sustenta evidencia en 09-conclusion.md se conserva; el
resto se descarta al cierre"). Esta política debe quedar en una referencia del orquestador
SM.
