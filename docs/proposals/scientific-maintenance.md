# Sistema de Mantenimiento Científico para Claude Code

> Documento de diseño — arquitectura de skills composables para automatizar el mantenimiento de
> software aplicando el método científico, parametrizado por perfil de mantenimiento.
>
> **Estado:** propuesta de diseño · **Versión:** v1.0 · **Sin sub-agents en el diseño base.**

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Principios de arquitectura](#2-principios-de-arquitectura)
   - [2.1 Separación estricta de roles](#21-separación-estricta-de-roles-cohesión)
   - [2.2 Composición sobre duplicación](#22-composición-sobre-duplicación-bajo-acoplamiento)
   - [2.3 Inversión de dependencia conceptual](#23-inversión-de-dependencia-conceptual)
   - [2.4 Trazabilidad total](#24-trazabilidad-total)
   - [2.5 Artefactos como fuente de verdad](#25-artefactos-como-fuente-de-verdad)
   - [2.6 Idempotencia y reanudabilidad](#26-idempotencia-y-reanudabilidad)
   - [2.7 Ausencia de sobreingeniería](#27-ausencia-de-sobreingeniería)
   - [2.8 Compatibilidad nativa con Claude Code](#28-compatibilidad-nativa-con-claude-code)
3. [Diseño completo del sistema](#3-diseño-completo-del-sistema)
   - [3.1 Las cinco capas](#31-las-cinco-capas)
   - [3.2 Por qué existe cada componente](#32-por-qué-existe-cada-componente)
   - [3.3 Mecanismo de composición](#33-mecanismo-de-composición-sin-sub-agents)
   - [3.4 El contrato perfil↔fase](#34-el-contrato-perfilfase-phase-policy-schema)
   - [3.5 Responsabilidades que cada capa NO debe asumir](#35-responsabilidades-que-cada-capa-no-debe-asumir)
   - [3.6 Supuestos y límites sobre Claude Code](#36-supuestos-y-límites-sobre-claude-code)
4. [Árbol de directorios](#4-árbol-de-directorios)
   - [4.1 Vista conceptual](#41-vista-conceptual-para-razonar-el-diseño)
   - [4.2 Vista real cargable por Claude Code](#42-vista-real-cargable-por-claude-code-mapeo-plano)
   - [4.3 Equivalencia entre ambas vistas](#43-equivalencia-entre-ambas-vistas)
   - [4.4 Dependencias externas](#44-dependencias-externas)
5. [Especificación de cada skill](#5-especificación-de-cada-skill)
   - [5.1 `sm-orchestrator`](#51-sm-orchestrator-capa-1)
   - [5.2 Skills de perfil (capa 2)](#52-skills-de-perfil-capa-2--visión-común)
   - [5.3 Skills de fase (capa 3)](#53-skills-de-fase-capa-3--visión-común)
6. [Especificación de cada fase](#6-especificación-de-cada-fase)
   - [6.1 Fase 01 — Observación](#61-fase-01--observación-sm-phase-observation)
   - [6.2 Fase 02 — Definición del problema](#62-fase-02--definición-del-problema-sm-phase-problem-definition)
   - [6.3 Fase 03 — Investigación](#63-fase-03--investigación-sm-phase-research)
   - [6.4 Fase 04 — Hipótesis](#64-fase-04--formulación-de-hipótesis-sm-phase-hypothesis)
   - [6.5 Fase 05 — Diseño experimental](#65-fase-05--diseño-experimental-sm-phase-experiment-design)
   - [6.6 Fase 06 — Ejecución del experimento](#66-fase-06--ejecución-del-experimento-sm-phase-experiment-execution)
   - [6.7 Fase 07 — Recolección de datos](#67-fase-07--recolección-de-datos-sm-phase-data-collection)
   - [6.8 Fase 08 — Análisis](#68-fase-08--análisis-sm-phase-analysis)
   - [6.9 Fase 09 — Conclusión](#69-fase-09--conclusión-sm-phase-conclusion)
   - [6.10 Fase 10 — Comunicación](#610-fase-10--comunicación-sm-phase-communication)
   - [6.11 Matriz fase × artefacto](#611-matriz-fase--artefacto-resumen)
7. [Especificación de cada perfil](#7-especificación-de-cada-perfil)
   - [7.1 Corrective](#71-corrective-sm-profile-corrective)
   - [7.2 Adaptive](#72-adaptive-sm-profile-adaptive)
   - [7.3 Perfective](#73-perfective-sm-profile-perfective)
   - [7.4 Preventive](#74-preventive-sm-profile-preventive)
   - [7.5 Tabla comparativa de perfiles](#75-tabla-comparativa-de-perfiles)
8. [Artefactos](#8-artefactos)
   - [8.1 Convención de nombres y ubicación](#81-convención-de-nombres-y-ubicación)
   - [8.2 Formato](#82-formato)
   - [8.3 Contenido mínimo esperado por artefacto](#83-contenido-mínimo-esperado-por-artefacto)
   - [8.4 Convención de versionado](#84-convención-de-versionado)
   - [8.5 Relación entre artefactos y auditoría posterior](#85-relación-entre-artefactos-y-auditoría-posterior)
9. [Memoria, changelog y hooks](#9-memoria-changelog-y-hooks)
   - [9.1 Memoria en dos niveles + protocolo de recall](#91-memoria-en-dos-niveles--protocolo-de-recall)
   - [9.2 Registro de casos (derivado)](#92-registro-de-casos-derivado)
   - [9.3 Changelog (derivado)](#93-changelog-derivado)
   - [9.4 Generador on-demand vs git hook](#94-generador-on-demand-vs-git-hook-para-el-changelog)
10. [Ejemplos de uso](#10-ejemplos-de-uso)
    - [10.1 Caso Corrective](#101-caso-corrective)
    - [10.2 Caso Adaptive](#102-caso-adaptive)
    - [10.3 Caso Perfective](#103-caso-perfective)
    - [10.4 Caso Preventive](#104-caso-preventive)
11. [Recomendaciones de implementación](#11-recomendaciones-de-implementación)
12. [Markdown reales de los archivos principales](#12-markdown-reales-de-los-archivos-principales)
    - [12.1 `.claude/CLAUDE.md`](#121-claudeclaudemd-instrucciones-persistentes-del-subsistema)
    - [12.2 `sm-orchestrator/SKILL.md`](#122-claudeskillssm-orchestratorskillmd)
    - [12.3 `references/phase-policy-schema.md`](#123-referencia-compartida--claudeskillssm-orchestratorreferencesphase-policy-schemamd)
    - [12.4 `references/classification-guide.md`](#124-referencia--claudeskillssm-orchestratorreferencesclassification-guidemd)
    - [12.5 `references/artifact-conventions.md`](#125-referencia--claudeskillssm-orchestratorreferencesartifact-conventionsmd)
    - [12.6 `templates/case.md`](#126-plantilla--claudeskillssm-orchestratortemplatescase-md)
    - [12.7 `templates/phase-artifact.md`](#127-plantilla--claudeskillssm-orchestratortemplatephase-artifactmd)
    - [12.8–12.11 Skills de perfil](#128-claudeskillssm-profile-correctiveskillmd)
    - [12.12 Skills de fase (12.12.1–12.12.10)](#1212-skills-de-fase)
    - [12.13 Base de conocimiento y registro derivado](#1213-memoria--base-de-conocimiento-patrón-memorymd-y-registro-derivado)
    - [12.14 Generador on-demand](#1214-generador-on-demand--changelogmd-changelog-derivado)
    - [12.15 Ejemplo de `CHANGELOG.md`](#1215-ejemplo-de-changelogmd-derivado)
    - [12.16 Hook de Claude Code (opcional)](#1216-hook-de-claude-code-opcional-descrito--claudehookssm-validate-artifactmd)

---

## 1. Resumen ejecutivo

Este documento especifica un sistema de mantenimiento de software ejecutable por **Claude Code**,
construido exclusivamente con **skills composables**. El sistema convierte cada tarea de mantenimiento
en un **experimento científico reproducible**: clasifica el caso, aplica el **perfil de mantenimiento**
adecuado y ejecuta las **diez fases del método científico** en orden, generando un **artefacto
versionable por fase** y consolidando conclusiones con trazabilidad histórica completa.

La arquitectura separa con rigor cinco responsabilidades que habitualmente se mezclan:

| Capa | Responsabilidad | Materializada en |
|------|-----------------|------------------|
| **Orquestación** | Clasificar, secuenciar fases, consolidar, registrar | `sm-orchestrator` |
| **Política de mantenimiento** | Qué priorizar, qué evidencia exigir, cómo modular cada fase | 4 skills `sm-profile-*` |
| **Procedimiento científico** | Cómo ejecutar cada fase, genérico y parametrizable | 10 skills `sm-phase-*` |
| **Evidencia** | Expedientes de caso inmutables y versionados por fase | `maintenance-cases/<case-id>/` |
| **Memoria persistente** | Base de conocimiento (lecciones) + registro de casos derivado | índice `MEMORY.md` (convención del subsistema) + `CLAUDE.md` |

Como *concern* transversal, un **changelog derivado** (`CHANGELOG.md`) y un **registro de casos
derivado** se generan a partir de los commits y del filesystem, nunca a mano (principio §2.5.1).

El principio rector es **una sola definición de cada fase**, parametrizada por el perfil activo. Los
perfiles no reimplementan las fases: aportan una **matriz de política por fase** (*phase-policy
matrix*) que cada fase consume para adaptar su comportamiento. Esto elimina la duplicación de lógica
(4 perfiles × 10 fases = 40 combinaciones se resuelven con **14 skills**, no con 40) y mantiene el
sistema escalable: añadir un perfil no obliga a tocar las fases, y añadir una fase no obliga a tocar
los perfiles.

El diseño es **nativo de Claude Code**: usa el modelo de skills (`.claude/skills/<name>/SKILL.md`),
memoria persistente, instrucciones persistentes (`CLAUDE.md`) y hooks opcionales, sin introducir
sub-agents. La composición ocurre en un único hilo de contexto mediante un **case manifest**
(`case.md`) que transporta el estado del caso entre el orquestador, el perfil y las fases.

---

## 2. Principios de arquitectura

Estos principios gobiernan todas las decisiones de diseño y son los criterios de aceptación del sistema.

### 2.1 Separación estricta de roles (cohesión)
Cada skill tiene **una** razón para cambiar. El orquestador cambia si cambia el flujo; un perfil cambia
si cambia la política de mantenimiento; una fase cambia si cambia el procedimiento científico. Ningún
skill mezcla dos de estos motivos.

### 2.2 Composición sobre duplicación (bajo acoplamiento)
Las fases son **genéricas y parametrizadas**. Nunca existe `sm-phase-hypothesis-corrective`: existe
`sm-phase-hypothesis` que lee la política del perfil activo. La variación de comportamiento es **dato**
(la matriz del perfil), no **código** (una fase por perfil).

### 2.3 Inversión de dependencia conceptual
Las fases **no conocen** perfiles concretos: dependen de un **contrato** (el *phase-policy schema*).
Los perfiles **no conocen** el procedimiento interno de una fase: solo rellenan el contrato. El
orquestador conoce a ambos pero no implementa ninguno.

### 2.4 Trazabilidad total
Todo caso produce una **cadena auditable** de artefactos `01 → 10`, enlazada y versionada, más un
`case.md` que actúa como índice del expediente. Cualquier conclusión es rastreable hasta la observación
original y la evidencia que la sustenta. La trazabilidad es **bidireccional**: cada commit lleva el
trailer `Case: <case-id>` (caso → commits) y cada entrada del changelog remite a su caso (changelog →
expediente). Esta cadena es sostenida **best-effort** por el orquestador (que verifica el orden y el
estado antes de cada fase) y verificada por la validación obligatoria del esquema YAML; no es una
garantía del runtime de Claude Code.

### 2.5 Artefactos como fuente de verdad
El estado del caso **no vive en la memoria conversacional** sino en archivos versionables. Esto permite
reanudar, auditar y revisar casos meses después, y hace el sistema robusto frente a la pérdida de
contexto.

#### 2.5.1 Estado derivado sobre estado duplicado
Refuerzo directo de §2.5: cuando una información ya existe como fuente de verdad, **no se mantiene una
segunda copia a mano** sino que se **deriva** de la primera. El `CHANGELOG.md` se deriva de los commits
convencionales; el **registro de casos** se deriva del filesystem (`maintenance-cases/`) y del changelog;
ninguno de los dos se edita manualmente. Solo se persiste deliberadamente aquello que **no es derivable**:
las **lecciones** generalizables (base de conocimiento). Duplicar estado introduce divergencia inevitable
y trabajo manual frágil; derivarlo lo elimina. Regla: *si puede derivarse, no se duplica; si debe
recordarse, se persiste una sola vez con un dueño único.*

### 2.6 Idempotencia y reanudabilidad
Reejecutar una fase produce una nueva **versión** de su artefacto, no corrompe las anteriores. El
orquestador puede retomar un caso leyendo `case.md` y continuando desde la última fase completada.

### 2.7 Ausencia de sobreingeniería
El método científico se modela completo (10 fases distinguibles) porque es el dominio del problema, no
una abstracción especulativa. No se añaden capas, sub-agents ni configurabilidad no solicitada. Los
hooks son opcionales y mínimos. Para casos triviales o localizados, el orquestador puede elegir el
**modo Consolidado** (`case_mode: consolidated`): se siguen ejecutando las 10 fases, pero en lugar de 10 artefactos
individuales se produce y actualiza una única sección por fase dentro del mismo `case.md`. El modo
**Full** (por defecto) genera los 10 artefactos `NN-<phase>.md` independientes. La elección se registra
en el bloque YAML canónico de `case.md` y no cambia el contrato perfil↔fase.

### 2.8 Compatibilidad nativa con Claude Code
El sistema usa únicamente primitivas soportadas: skills con frontmatter `name`/`description`, formato
híbrido XML+Markdown, `references/` y `templates/` on-demand, memoria persistente y `CLAUDE.md`.
Cuerpo de los skills en inglés; interacción con el usuario en español (política del repositorio).

---

## 3. Diseño completo del sistema

### 3.1 Las cinco capas

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USUARIO  ──"mantén X"──►  sm-orchestrator                                │
│                                 │                                         │
│  CAPA 1: ORQUESTACIÓN           │  clasifica · secuencia · consolida      │
│                                 ▼                                         │
│  CAPA 2: POLÍTICA      sm-profile-<corrective|adaptive|                  │
│                                  perfective|preventive>                   │
│                          (objetivo + phase-policy matrix)                 │
│                                 │ escribe parámetros                      │
│                                 ▼                                         │
│  CAPA 3: PROCEDIMIENTO  sm-phase-observation → … → sm-phase-              │
│                          communication  (10 fases genéricas)              │
│                                 │ cada fase lee la política               │
│                                 ▼                                         │
│  CAPA 4: EVIDENCIA      maintenance-cases/<case-id>/NN-<phase>.md         │
│                                 │            + case.md (manifest)         │
│                                 ▼                                         │
│  CAPA 5: MEMORIA  ┌─ conocimiento (lecciones) ─ índice MEMORY.md          │
│                   └─ registro de casos ─ DERIVADO (no se edita a mano)    │
│                                 ·                                         │
│  TRANSVERSAL: CHANGELOG  CHANGELOG.md  ◄─ derivado de commits (on-demand) │
│               trazabilidad bidireccional vía trailer `Case: <case-id>`    │
└─────────────────────────────────────────────────────────────────────────┘
```

La **capa 5** se desdobla en dos niveles con **dueño único** cada uno: (a) una **base de
conocimiento** organizada bajo el patrón de memoria del subsistema —un aprendizaje por archivo bajo
`.claude/memory/`, con `MEMORY.md` como índice— donde se persisten **lecciones** generalizables
(Claude Code **no** carga `MEMORY.md` automáticamente; el recall es un paso explícito de la fase 03
que lo lee); y (b) un **registro de casos derivado** del filesystem (`maintenance-cases/`) y del
`CHANGELOG.md`, que **nunca** se mantiene a mano. El **changelog** es un *concern* transversal
**derivado** de los commits convencionales (no es una capa que alguien edite), y el trailer `Case:`
cierra el enlace changelog↔expediente.

### 3.2 Por qué existe cada componente

**Por qué un orquestador.** El método científico es una secuencia con dependencias (no se formula una
hipótesis sin definir el problema). Alguien debe poseer el *flujo*: clasificar el caso, garantizar el
orden, gestionar el `case.md`, y consolidar. Distribuir esta responsabilidad entre las fases las
acoplaría entre sí. Centralizarla en un orquestador mantiene a las fases independientes y reutilizables.

**Por qué un skill por perfil.** Corrective y preventive son *políticas* distintas: uno minimiza el
tiempo a la restauración del servicio; el otro maximiza la reducción de riesgo futuro. Esa diferencia
afecta a **todas** las fases (qué observar, qué hipótesis priorizar, qué experimento es aceptable, qué
conclusión es válida). Encapsular cada política en un skill permite razonar y evolucionar cada una de
forma aislada, y hace explícitas las señales que activan cada perfil.

**Por qué un skill por fase.** Cada fase del método científico es una responsabilidad cognitiva
distinta con entradas, salidas y criterios de validación propios. Fundirlas en un único skill
monolítico produciría un prompt gigante, difícil de mantener y de validar fase a fase. Diez skills
permiten validar, versionar y mejorar cada fase de forma independiente.

**Por qué las fases son parametrizadas y no duplicadas por perfil.** Duplicar daría 40 skills
(4 × 10) con ~90 % de lógica compartida y divergencia inevitable con el tiempo. La parametrización
mantiene **una** definición de "cómo formular una hipótesis" y delega la variación ("qué hipótesis
priorizar en corrective") a un dato que aporta el perfil. Resultado: 14 skills, cero duplicación,
evolución lineal.

### 3.3 Mecanismo de composición (sin sub-agents)

La composición ocurre en **un solo hilo de contexto**. No hay sub-agents; el orquestador *lee cada
`SKILL.md` y sus referencias, y ejecuta sus instrucciones* en secuencia (o vía la herramienta Skill
cuando esté disponible en la sesión). El estado se persiste en archivos, no en el contexto
conversacional. El orden fijo y el "no saltarse fases" **no** los garantiza el runtime de Claude Code:
son **best-effort**, reforzados porque el orquestador verifica en el bloque `phases` del `case.md`
que las fases `01..N-1` estén `done` antes de ejecutar la fase N, y se detiene si no lo están.

1. **Clasificación.** `sm-orchestrator` recibe la solicitud, infiere el perfil (o lo pregunta si es
   ambiguo) y crea `maintenance-cases/<case-id>/case.md` con `case_id`, `profile` y la lista de fases en
   estado `pending`.
2. **Carga de política.** El orquestador invoca el skill de perfil. El perfil **escribe en `case.md`**
   su bloque de parámetros: prioridades, umbrales de riesgo, métricas de éxito y la **phase-policy
   matrix** (una entrada por cada una de las 10 fases). El perfil **no ejecuta** ninguna fase.
3. **Ejecución de fases.** Para cada fase `01..10`, el orquestador invoca el skill de fase. La fase:
   - lee `case.md` (perfil activo + su entrada de phase-policy + artefactos previos),
   - ejecuta su procedimiento genérico **modulado** por esa política,
   - escribe `NN-<phase>.md` (artefacto versionado) y marca la fase `done` en `case.md`.
4. **Consolidación.** Tras la fase 10, el orquestador agrega un veredicto al `case.md`. El **registro de
   casos** y el `CHANGELOG.md` **no se escriben aquí**: son estado **derivado** (del filesystem y de los
   commits respectivamente, §2.5.1). La fase 10 ejecuta el **generador on-demand** pasándole la entrada
   pendiente del caso actual (`--pending "<subject>" --case <id>`), incluye `CHANGELOG.md` en su commit y
   **nunca** redacta entradas a mano.

```
sm-orchestrator
  ├─ crea case.md (profile=corrective)
  ├─ invoca sm-profile-corrective ─► escribe phase-policy matrix en case.md
  └─ bucle de fases:
        sm-phase-observation     (lee case.md.policy.observation)    ─► 01-observation.md
        sm-phase-problem-definition (lee case.md.policy.problem...)  ─► 02-problem-definition.md
        …
        sm-phase-communication   (lee case.md.policy.communication)  ─► 10-communication.md
  └─ consolida ─► veredicto en case.md
        · lección destilada ─► base de conocimiento (índice MEMORY.md, 1 archivo)
        · fase 10 ejecuta generador on-demand ─► CHANGELOG.md incluido en commit
        · registro de casos ─► DERIVADO (no se edita)
```

### 3.4 El contrato perfil↔fase (*phase-policy schema*)

El acoplamiento entre perfiles y fases se reduce a un **contrato de datos** estable. Cada perfil
declara, por fase, los mismos campos; cada fase lee esos mismos campos. Ni el perfil conoce el
procedimiento interno de la fase, ni la fase conoce qué perfil la invoca.

| Campo de la política por fase | Significado | Consumido por la fase para… |
|---|---|---|
| `focus` | Qué priorizar en esta fase bajo este perfil | Enfocar el procedimiento |
| `reasoning_effort` | Esfuerzo esperado (`low` / `medium` / `high` / `xhigh`) | Calibrar esfuerzo |
| `evidence` | Tipo de evidencia que el perfil exige | Decidir qué recolectar |
| `acceptance` | Criterio de aceptación de la salida de la fase | Validar el artefacto |
| `risk_controls` | Controles de riesgo obligatorios | Aplicar guardas |

Este contrato es el único punto de acoplamiento. Cambiarlo es un cambio de arquitectura; todo lo demás
evoluciona sin tocarlo.

### 3.5 Responsabilidades que cada capa NO debe asumir

| Capa | NO debe |
|------|---------|
| Orquestador | Implementar procedimiento de fase; decidir política de mantenimiento |
| Perfil | Ejecutar fases; escribir artefactos de fase; secuenciar |
| Fase | Conocer perfiles concretos; decidir el orden; consolidar el caso |
| Artefactos | Contener lógica; mutar artefactos previos |
| Memoria | Sustituir a los artefactos como fuente de verdad de un caso |

### 3.6 Supuestos y límites sobre Claude Code

El diseño asume Claude Code como runtime pero no sobreestima sus garantías. Los puntos siguientes son
límites explícitos que el diseño reconoce y mitiga por convención, no por el runtime:

- **Ejecución no determinista (best-effort).** Claude Code no garantiza que las instrucciones de un
  `SKILL.md` se ejecuten siempre de forma idéntica o en el orden exacto prescrito. El determinismo es
  **best-effort**, sostenido por el orquestador vía el bloque `phases` del `case.md` (verificación de
  precondiciones antes de cada fase) y por la validación obligatoria del esquema YAML. Los artefactos
  en disco son la fuente de verdad; el estado conversacional no es fiable entre sesiones.

- **`MEMORY.md` no se carga automáticamente.** Claude Code no aplica recall sobre `MEMORY.md` en cada
  sesión sin una instrucción explícita. El recall es un **paso explícito de la fase 03** que lee el
  índice y abre las lecciones relevantes. Para que `MEMORY.md` entre en el contexto de cada sesión,
  `.claude/CLAUDE.md` contiene una referencia directa a él.

- **Presupuesto de contexto acotado por diseño.** Cada fase lee solo sus *inputs declarados* (§6/§8),
  no toda la cadena de artefactos anteriores (p. ej. la fase 08 lee artefactos 04 y 07, no 01–07).
  Los artefactos en disco actúan como memoria externa; no se mantiene toda la cadena en el contexto
  conversacional. Una fase costosa en contexto (p. ej. investigación amplia) puede aislarse en un
  sub-agent sin romper el contrato artefactual (rec 9 de §11).

- **Validación de esquema como paso obligatorio.** Dado que el runtime no valida estructuras, la
  verificación del bloque YAML canónico de `case.md` es un **paso obligatorio** del orquestador
  (§12.2 paso 4), no una automatización opcional. El hook de Claude Code `sm-validate-artifact`
  puede automatizar esta misma verificación, pero es opcional (§9.4).

---

## 4. Árbol de directorios

Se documentan **dos vistas** del mismo sistema: el **árbol conceptual** (jerárquico, para razonar) y el
**mapeo plano real** (el que Claude Code carga de verdad, porque los skills se descubren como
`.claude/skills/<name>/SKILL.md` en una jerarquía plana).

### 4.1 Vista conceptual (para razonar el diseño)

```
scientific-maintenance/
├── orchestrator/            # capa 1 — orquestación
│   └── orchestrator
├── profiles/                # capa 2 — política de mantenimiento
│   ├── corrective
│   ├── adaptive
│   ├── perfective
│   └── preventive
└── phases/                  # capa 3 — método científico
    ├── 01-observation
    ├── 02-problem-definition
    ├── 03-research
    ├── 04-hypothesis
    ├── 05-experiment-design
    ├── 06-experiment-execution
    ├── 07-data-collection
    ├── 08-analysis
    ├── 09-conclusion
    └── 10-communication
```

### 4.2 Vista real cargable por Claude Code (mapeo plano)

El prefijo `sm-` agrupa el subsistema y evita colisiones con otros skills del repo. La jerarquía
conceptual se preserva en el **naming**, no en carpetas anidadas (que Claude Code no recorre para
descubrir skills).

```
.claude/
├── skills/
│   ├── sm-orchestrator/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── phase-policy-schema.md      # contrato perfil↔fase
│   │   │   ├── classification-guide.md     # cómo elegir perfil
│   │   │   ├── artifact-conventions.md     # nombres, frontmatter, versionado, trailer Case:
│   │   │   ├── knowledge-base.md           # esquema de lección + protocolo de recall
│   │   │   └── changelog.md                # formato Keep a Changelog + derivación
│   │   └── templates/
│   │       ├── case.md                      # plantilla del manifest
│   │       └── phase-artifact.md            # plantilla de artefacto de fase
│   │
│   ├── sm-profile-corrective/   └── SKILL.md
│   ├── sm-profile-adaptive/     └── SKILL.md
│   ├── sm-profile-perfective/   └── SKILL.md
│   ├── sm-profile-preventive/   └── SKILL.md
│   │
│   ├── sm-phase-observation/            └── SKILL.md
│   ├── sm-phase-problem-definition/     └── SKILL.md
│   ├── sm-phase-research/               └── SKILL.md
│   ├── sm-phase-hypothesis/             └── SKILL.md
│   ├── sm-phase-experiment-design/      └── SKILL.md
│   ├── sm-phase-experiment-execution/   └── SKILL.md
│   ├── sm-phase-data-collection/        └── SKILL.md
│   ├── sm-phase-analysis/               └── SKILL.md
│   ├── sm-phase-conclusion/             └── SKILL.md
│   └── sm-phase-communication/          └── SKILL.md
│
├── hooks/
│   └── sm-validate-artifact.md          # hook de Claude Code (opcional, descrito, no instalado)
└── CLAUDE.md                            # instrucciones persistentes del subsistema (scoped)

CHANGELOG.md                             # transversal — DERIVADO de commits (generador on-demand, Keep a Changelog)
                                         # generado por la fase 10 con --pending; idempotente sin --pending

maintenance-cases/                       # capa 4 — evidencia (fuera de .claude/, versionable)
└── <case-id>/
    ├── case.md                          # manifest del expediente
    ├── 01-observation.md
    ├── 02-problem-definition.md
    ├── …
    └── 10-communication.md

.claude/memory/                          # capa 5 — base de conocimiento (patrón MEMORY.md)
├── MEMORY.md                            # índice de lecciones (una línea por lección; recall es explícito en fase 03)
└── <lesson-slug>.md                     # una lección por archivo (frontmatter + tags)
                                         # registro de casos: NO existe como archivo — es derivado
```

### 4.3 Equivalencia entre ambas vistas

| Conceptual | Real (plano) | Descubrimiento |
|---|---|---|
| `orchestrator/orchestrator` | `.claude/skills/sm-orchestrator/` | auto + `/sm-orchestrator` |
| `profiles/<x>` | `.claude/skills/sm-profile-<x>/` | invocado por el orquestador |
| `phases/NN-<x>` | `.claude/skills/sm-phase-<x>/` | invocado por el orquestador |

> **Decisión:** las **referencias compartidas** y **plantillas** viven dentro de `sm-orchestrator`
> (su dueño natural) y se enlazan desde perfiles y fases con rutas relativas
> (`../sm-orchestrator/references/...`). Esto evita duplicar el contrato en 14 skills.

### 4.4 Dependencias externas

El subsistema requiere los siguientes recursos externos ya presentes en el repositorio. No son parte de
los 14 skills `sm-*`, pero deben existir antes de implementar el sistema:

| Recurso | Tipo | Función |
|---------|------|---------|
| `.claude/skills/artifact-structuring/` | Skill existente | Define `§language_policy` (inglés en cuerpos de skills, español en interacción con el usuario). Referenciado desde todos los skills `sm-*`. |
| `.claude/skills/conventional-commits/` | Skill existente | Formato de mensajes de commit. Referenciado desde `sm-phase-communication` y el generador de changelog. |
| `.claude/CLAUDE.md` | Archivo de instrucciones | Instrucciones persistentes del subsistema (§12.1). Debe existir y referenciar `MEMORY.md` para que el índice de lecciones entre en contexto. |

> **Nota en el árbol §4.2:** los skills `artifact-structuring` y `conventional-commits` aparecen como
> dependencias externas (`../artifact-structuring/SKILL.md §language_policy`) en las referencias de
> todos los skills `sm-*`. No se duplican ni reimplementan dentro del subsistema.

---

## 5. Especificación de cada skill

### 5.1 `sm-orchestrator` (capa 1)

| Atributo | Valor |
|---|---|
| **Propósito** | Conducir un caso de mantenimiento de extremo a extremo. |
| **Entradas** | Solicitud del usuario en lenguaje natural; opcionalmente un `case-id` para reanudar. |
| **Salidas** | `case.md` actualizado, artefactos de las 10 fases (Full: 10 archivos `NN-*.md`; Consolidado: subsecciones en `case.md`), lección en la base de conocimiento, `CHANGELOG.md` actualizado, commit con trailer `Case:`, resumen al usuario. |
| **Responsabilidades** | Generar `case-id`; clasificar perfil; crear/leer `case.md`; invocar perfil y fases en orden; consolidar. El registro de casos y el changelog son **derivados** (no los escribe). |
| **NO hace** | Política de mantenimiento; procedimiento de fase. |
| **Invoca** | 1 perfil + 10 fases. |
| **Activación** | `/sm-orchestrator` o frases como "mantén", "corrige el bug", "optimiza", "migra a", "endurece". |

### 5.2 Skills de perfil (capa 2) — visión común

Los cuatro perfiles comparten **estructura idéntica** y difieren solo en contenido. Cada uno:

| Atributo | Valor |
|---|---|
| **Propósito** | Declarar la política de mantenimiento y proyectarla sobre las 10 fases. |
| **Entradas** | `case.md` (creado por el orquestador) + descripción del caso. |
| **Salidas** | Bloque de parámetros + `phase-policy matrix` escritos en `case.md`. |
| **Responsabilidades** | Definir objetivo, prioridades, señales, métricas, umbrales de riesgo; rellenar el contrato por fase. |
| **NO hace** | Ejecutar fases; escribir artefactos `NN-*.md`. |
| **Activación** | Invocado por el orquestador; manual solo para inspección. |

Detalle por perfil en la [sección 7](#7-especificación-de-cada-perfil).

### 5.3 Skills de fase (capa 3) — visión común

Las diez fases comparten un **esqueleto idéntico** (lee política → ejecuta procedimiento → valida →
escribe artefacto) y difieren en el procedimiento concreto. Cada una:

| Atributo | Valor |
|---|---|
| **Propósito** | Ejecutar una fase del método científico, parametrizada por el perfil activo. |
| **Entradas** | `case.md`; artefactos de fases previas; su entrada `phase-policy`. |
| **Salidas** | `NN-<phase>.md` versionado; estado de la fase en `case.md`. |
| **Responsabilidades** | Procedimiento genérico de la fase; aplicar `focus/reasoning_effort/evidence/risk_controls`; validar contra `acceptance`. |
| **NO hace** | Conocer perfiles concretos; decidir orden; consolidar el caso. |
| **Activación** | Invocada por el orquestador. |

Detalle por fase en la [sección 6](#6-especificación-de-cada-fase).

---

## 6. Especificación de cada fase

Para cada fase se detalla propósito, entradas, salidas, artefacto, criterios de validación y cómo se
adapta según el perfil. La adaptación es **siempre** vía la `phase-policy matrix`: la fase lee
`focus/reasoning_effort/evidence/acceptance/risk_controls` y ajusta su comportamiento.

> **Modos Full y Consolidado.** En **modo Full** (por defecto) cada fase produce un artefacto independiente
> `NN-<phase>.md`. En **modo Consolidado** (casos triviales/localizados) cada fase escribe o actualiza una
> subsección del `case.md`; el contrato de entradas/salidas y la `phase-policy matrix` son idénticos en
> ambos modos. Las 10 fases se ejecutan siempre; solo cambia el soporte de salida. El modo elegido
> (`case_mode`) está registrado en el bloque YAML canónico de `case.md`.

### 6.1 Fase 01 — Observación (`sm-phase-observation`)
- **Propósito:** capturar el estado observable del sistema y los síntomas sin interpretarlos.
- **Entradas:** solicitud del usuario; acceso a código, logs, métricas, tests, issues.
- **Salidas / artefacto:** `01-observation.md` — hechos observados, contexto, alcance, no-interpretación.
- **Validación:** hechos verificables y fechados; ninguna causa asumida; alcance delimitado.
- **Adaptación por perfil:** corrective enfoca síntomas y reproducción; adaptive enfoca el cambio de
  entorno/requisito; perfective enfoca métricas de calidad/rendimiento; preventive enfoca señales
  débiles y tendencias antes de que fallen.

### 6.2 Fase 02 — Definición del problema (`sm-phase-problem-definition`)
- **Propósito:** convertir las observaciones en un enunciado de problema preciso y acotado.
- **Entradas:** `01-observation.md`.
- **Salidas / artefacto:** `02-problem-definition.md` — enunciado, criterios de "resuelto", límites,
  impacto, severidad.
- **Validación:** problema falsable y medible; criterio de éxito explícito; no mezcla varios problemas.
- **Adaptación:** corrective define el fallo y su criterio de no-regresión; adaptive define el delta de
  compatibilidad requerido; perfective define la métrica objetivo y su umbral; preventive define el
  riesgo a mitigar y su probabilidad/impacto.

### 6.3 Fase 03 — Investigación (`sm-phase-research`)
- **Propósito:** reunir conocimiento previo relevante (código, docs, historial, literatura) **y aplicar
  el protocolo de recall** sobre la base de conocimiento.
- **Entradas:** `02-problem-definition.md`; la **base de conocimiento** (índice `MEMORY.md`; el recall es explícito, no automático).
- **Protocolo de recall:** consultar las lecciones por sus tags `component`, `defect-class` y `profile`,
  derivados de la definición del problema (fase 02) y del perfil activo; incorporar las lecciones
  relevantes como antecedentes citados. El recall es un **procedimiento** (qué tags consultar y cómo
  incorporarlos), no una promesa de que exista una lección aplicable.
- **Salidas / artefacto:** `03-research.md` — hallazgos, código relacionado, antecedentes, lecciones
  recuperadas (con enlace), restricciones.
- **Validación:** fuentes citadas y localizables (`file:línea`, URLs, commits, lecciones); cobertura
  suficiente del área afectada; recall ejecutado por los tags pertinentes.
- **Adaptación:** corrective busca regresiones y cambios recientes; adaptive estudia la nueva API/entorno;
  perfective busca benchmarks y patrones de optimización; preventive busca clases de defecto y
  vulnerabilidades análogas.

### 6.4 Fase 04 — Formulación de hipótesis (`sm-phase-hypothesis`)
- **Propósito:** proponer una o más hipótesis falsables que expliquen el problema o el cambio.
- **Entradas:** `02`, `03`.
- **Salidas / artefacto:** `04-hypothesis.md` — hipótesis priorizadas, predicción de cada una, criterio
  de refutación.
- **Validación:** cada hipótesis es falsable y tiene predicción observable; priorización justificada.
- **Adaptación:** corrective prioriza la causa raíz más probable y barata de probar; adaptive formula la
  estrategia de adaptación; perfective formula la optimización candidata; preventive formula la
  hipótesis de riesgo y su mecanismo de materialización.

### 6.5 Fase 05 — Diseño experimental (`sm-phase-experiment-design`)
- **Propósito:** diseñar el experimento que confirma o refuta la hipótesis con mínimo riesgo.
- **Entradas:** `04`.
- **Salidas / artefacto:** `05-experiment-design.md` — procedimiento, variables, controles, criterio de
  éxito/fracaso, plan de rollback.
- **Validación:** experimento reproducible; controles definidos; rollback explícito; coste acotado.
- **Adaptación:** corrective diseña un test que reproduce el bug primero; adaptive diseña pruebas de
  compatibilidad; perfective diseña un benchmark A/B; preventive diseña una prueba que **provoca** la
  condición de riesgo en entorno controlado.

### 6.6 Fase 06 — Ejecución del experimento (`sm-phase-experiment-execution`)
- **Propósito:** ejecutar el experimento diseñado sin desviarse del protocolo.
- **Entradas:** `05`.
- **Salidas / artefacto:** `06-experiment-execution.md` — comandos ejecutados, cambios aplicados,
  desviaciones, logs crudos.
- **Validación:** se siguió el diseño; desviaciones documentadas; entorno registrado; reversible.
- **Adaptación:** el `reasoning_effort` y los `risk_controls` del perfil determinan si se ejecuta en sandbox, con
  feature flag, o directamente; corrective exige reproducción previa al fix; preventive exige
  aislamiento estricto.

### 6.7 Fase 07 — Recolección de datos (`sm-phase-data-collection`)
- **Propósito:** capturar de forma estructurada los datos producidos por la ejecución.
- **Entradas:** `06`.
- **Salidas / artefacto:** `07-data-collection.md` — datos normalizados, métricas, resultados de tests,
  antes/después.
- **Validación:** datos trazables a la ejecución; unidades y condiciones registradas; sin edición de
  resultados crudos.
- **Adaptación:** el campo `evidence` del perfil define qué datos son obligatorios (corrective:
  pass/fail del test de reproducción; perfective: deltas de métrica con varianza; preventive: ausencia o
  presencia de la condición de riesgo).

### 6.8 Fase 08 — Análisis (`sm-phase-analysis`)
- **Propósito:** interpretar los datos frente a la hipótesis y al criterio de éxito.
- **Entradas:** `04`, `07`.
- **Salidas / artefacto:** `08-analysis.md` — hipótesis confirmada/refutada, magnitud del efecto,
  amenazas a la validez, efectos secundarios.
- **Validación:** conclusión soportada por los datos; alternativas consideradas; límites declarados.
- **Adaptación:** corrective evalúa cierre del fallo y no-regresión; adaptive evalúa compatibilidad;
  perfective evalúa significancia de la mejora; preventive evalúa reducción efectiva del riesgo.

### 6.9 Fase 09 — Conclusión (`sm-phase-conclusion`)
- **Propósito:** decidir el resultado del caso y la acción resultante, y **destilar una lección
  generalizable** hacia la base de conocimiento.
- **Entradas:** `02`, `08`.
- **Salidas / artefacto:** `09-conclusion.md` — veredicto, decisión (aplicar/revertir/escalar),
  residuos, deuda, seguimiento; y **una lección** escrita como archivo bajo `.claude/memory/` (frontmatter +
  tags `component`/`defect-class`/`profile`, índice en `MEMORY.md`).
- **Lección:** se persiste lo **no derivable** (qué se aprendió, reutilizable en casos futuros), no un
  resumen del caso (eso ya vive en el expediente). Una lección por archivo; la base crece por
  aprendizaje, no por volumen de casos (§2.5.1).
- **Validación:** veredicto coherente con el análisis; criterio de la fase 02 contrastado; acciones
  accionables; lección con tags que permitan el recall de la fase 03.
- **Adaptación:** el tipo de conclusión que favorece cada perfil (sección 7): corrective → fix
  verificado; adaptive → adaptación compatible; perfective → mejora medible aceptada; preventive →
  mitigación con riesgo residual cuantificado.

### 6.10 Fase 10 — Comunicación (`sm-phase-communication`)
- **Propósito:** producir la comunicación final para humanos (PR, changelog, informe, commit).
- **Entradas:** `09` y la cadena completa.
- **Salidas / artefacto:** `10-communication.md` — resumen ejecutivo, cambios, evidencia, riesgos,
  enlaces a artefactos; borrador de mensaje de commit/PR (en español, conventional commits del repo)
  **con trailer `Case: <case-id>`**.
- **Changelog derivado:** esta fase **no redacta** el `CHANGELOG.md` a mano. Ejecuta el **generador
  on-demand** pasándole la entrada pendiente del caso actual (`--pending "<subject>" --case <id>`),
  de modo que `CHANGELOG.md` se actualiza e incluye en el mismo commit (sin `--amend`, sin commit
  extra). El changelog es estado derivado (§2.5.1); el generador también puede ejecutarse sin
  `--pending` para regenerar el archivo completo desde el `git log` (uso idempotente, p. ej. en CI).
- **Validación:** autocontenida; enlaza evidencia; audiencia correcta; sin afirmaciones no soportadas;
  el borrador de commit incluye el trailer `Case:`.
- **Adaptación:** corrective enfatiza causa raíz y prueba de no-regresión; adaptive enfatiza
  compatibilidad y migración; perfective enfatiza el delta de métricas; preventive enfatiza el riesgo
  evitado y el residual.

### 6.11 Matriz fase × artefacto (resumen)

| # | Fase | Skill | Artefacto |
|---|------|-------|-----------|
| 01 | Observación | `sm-phase-observation` | `01-observation.md` |
| 02 | Definición del problema | `sm-phase-problem-definition` | `02-problem-definition.md` |
| 03 | Investigación | `sm-phase-research` | `03-research.md` |
| 04 | Hipótesis | `sm-phase-hypothesis` | `04-hypothesis.md` |
| 05 | Diseño experimental | `sm-phase-experiment-design` | `05-experiment-design.md` |
| 06 | Ejecución | `sm-phase-experiment-execution` | `06-experiment-execution.md` |
| 07 | Recolección de datos | `sm-phase-data-collection` | `07-data-collection.md` |
| 08 | Análisis | `sm-phase-analysis` | `08-analysis.md` |
| 09 | Conclusión | `sm-phase-conclusion` | `09-conclusion.md` |
| 10 | Comunicación | `sm-phase-communication` | `10-communication.md` |

---

## 7. Especificación de cada perfil

Cada perfil declara objetivo, prioridades, señales de activación, métricas, criterios de riesgo, y una
proyección sobre las fases (`influencia`, `evidencia priorizada`, `conclusiones favorecidas`).

### 7.1 Corrective (`sm-profile-corrective`)
- **Objetivo:** restaurar el comportamiento correcto eliminando un defecto.
- **Prioridades:** reproducir → causa raíz → fix mínimo → no-regresión. Velocidad de restauración.
- **Señales que lo activan:** bug reportado, excepción, fallo en producción, test rojo, regresión.
- **Métricas de éxito:** test de reproducción que pasa tras el fix; cero regresiones; tiempo a la
  resolución.
- **Criterios de riesgo:** cambios amplios para un fallo localizado; fix sin test que lo cubra.
- **Influencia por fase:** observación→reproducir; hipótesis→causa raíz más probable; diseño→test que
  falla primero; análisis→cierre + no-regresión.
- **Evidencia priorizada:** test de reproducción (rojo→verde), stack traces, diff mínimo.
- **Conclusiones favorecidas:** "causa raíz X corregida, verificada por test T, sin regresiones".

### 7.2 Adaptive (`sm-profile-adaptive`)
- **Objetivo:** adaptar el software a un cambio externo (API, dependencia, plataforma, requisito,
  normativa) preservando compatibilidad.
- **Prioridades:** compatibilidad → migración segura → cobertura del nuevo contrato.
- **Señales:** deprecación, upgrade de dependencia, nuevo entorno/OS, cambio regulatorio, nueva
  integración.
- **Métricas de éxito:** suite verde en el nuevo entorno; sin rupturas de contrato público; ruta de
  migración documentada.
- **Criterios de riesgo:** cambios no aislados tras feature flag; ausencia de pruebas de
  compatibilidad; migraciones irreversibles.
- **Influencia por fase:** observación→delta de entorno; investigación→nueva API; diseño→pruebas de
  compatibilidad; análisis→compatibilidad confirmada.
- **Evidencia priorizada:** matrices de compatibilidad, contract tests, antes/después de versiones.
- **Conclusiones favorecidas:** "adaptado a Y manteniendo compatibilidad con X; migración reversible".

### 7.3 Perfective (`sm-profile-perfective`)
- **Objetivo:** mejorar atributos de calidad sin cambiar comportamiento funcional (rendimiento,
  legibilidad, mantenibilidad, UX).
- **Prioridades:** mejora medible → preservación funcional → ausencia de regresión de calidad.
- **Señales:** lentitud, complejidad alta, code smell, deuda técnica, petición de optimización/refactor.
- **Métricas de éxito:** mejora estadísticamente significativa de la métrica objetivo; comportamiento
  invariante (suite verde).
- **Criterios de riesgo:** optimización sin baseline; refactor sin red de tests; mejora dentro del ruido.
- **Influencia por fase:** definición→métrica objetivo + umbral; diseño→benchmark A/B; datos→deltas con
  varianza; análisis→significancia.
- **Evidencia priorizada:** benchmarks reproducibles, perfiles de rendimiento, métricas de complejidad,
  cobertura.
- **Conclusiones favorecidas:** "métrica M mejoró Δ (p<umbral) sin cambio funcional".

### 7.4 Preventive (`sm-profile-preventive`)
- **Objetivo:** reducir la probabilidad o el impacto de fallos futuros antes de que ocurran.
- **Prioridades:** identificación de riesgo → mitigación → cuantificación del riesgo residual.
- **Señales:** auditoría, hardening, análisis de fragilidad, clase de defecto recurrente,
  vulnerabilidad potencial, falta de cobertura crítica.
- **Métricas de éxito:** riesgo mitigado demostrablemente; riesgo residual cuantificado; cobertura/guardas
  añadidas.
- **Criterios de riesgo:** introducir cambio que añade riesgo neto; mitigación sin prueba que la valide;
  alcance que excede el riesgo abordado.
- **Influencia por fase:** observación→señales débiles/tendencias; hipótesis→mecanismo de
  materialización; diseño→prueba que provoca la condición en sandbox; análisis→reducción efectiva.
- **Evidencia priorizada:** pruebas que provocan la condición de riesgo, análisis estático, cobertura de
  caminos críticos, modelos de amenaza.
- **Conclusiones favorecidas:** "riesgo R mitigado por control C; residual cuantificado y aceptado".

### 7.5 Tabla comparativa de perfiles

| Dimensión | Corrective | Adaptive | Perfective | Preventive |
|---|---|---|---|---|
| Detona por | Fallo presente | Cambio externo | Oportunidad de calidad | Riesgo futuro |
| Optimiza | Restaurar | Compatibilizar | Mejorar métrica | Reducir riesgo |
| Evidencia clave | Test rojo→verde | Contract tests | Benchmark A/B | Prueba de riesgo |
| Riesgo a evitar | Fix sin test | Migración irreversible | Optimizar sin baseline | Añadir riesgo neto |
| Conclusión típica | Causa raíz corregida | Adaptación compatible | Mejora significativa | Riesgo mitigado |

---

## 8. Artefactos

### 8.1 Convención de nombres y ubicación
- Carpeta por caso: `maintenance-cases/<case-id>/` donde `case-id = YYYYMMDD-<slug>` (p. ej.
  `20260606-login-timeout`). Si la carpeta ya existe (mismo slug, mismo día), añadir sufijo incremental:
  `20260606-login-timeout-2`, `-3`, etc.
- Manifest del expediente: `case.md` (contiene el bloque YAML canónico con `case_mode`, `phase_policy`
  y `phases`).
- **Modo Full** (por defecto): artefactos de fase como archivos individuales `NN-<phase>.md` con `NN` ∈
  `01..10`.
- **Modo Consolidado** (casos triviales/localizados): sin archivos `NN-*.md` independientes; cada fase escribe
  o actualiza una subsección `## NN — <Phase>` dentro del propio `case.md`. El bloque `phases` del YAML
  canónico registra el status de cada fase igual que en modo Full (el campo `artifact` apunta a la
  subsección `case.md#NN`).
- La elección de modo la hace el orquestador en el paso de clasificación y queda registrada en
  `case_mode`; el usuario puede forzar el modo con un parámetro explícito.

### 8.2 Formato
Markdown con **frontmatter YAML** obligatorio + cuerpo estructurado. El `case.md` contiene además un
**bloque YAML canónico** machine-readable (sección "Canonical state") que es la **única fuente de
estado del caso**: incluye `case_mode`, `phase_policy` (una entrada por fase) y `phases` (status,
artifact y version por fase). No existe una tabla markdown de estado de fases separada: el bloque
YAML es la única copia legible por máquina. La validación del esquema de este bloque es un **paso
obligatorio** del orquestador (§12.2 paso 4). El frontmatter del `case.md` conserva solo los campos
de identidad. Frontmatter de un **artefacto de fase** (modo Full):

```yaml
---
case_id: 20260606-login-timeout
profile: corrective
phase: 04-hypothesis
version: v1.0
timestamp: 2026-06-06T14:32:00Z
status: done          # pending | in_progress | done | superseded
inputs: [02-problem-definition.md, 03-research.md]
produces: 04-hypothesis.md
links:
  previous: 03-research.md
  next: 05-experiment-design.md
---
```

### 8.3 Contenido mínimo esperado por artefacto

| Artefacto | Secciones mínimas |
|---|---|
| `case.md` | Caso, perfil, parámetros del perfil, bloque YAML canónico (`case_mode` + `phase_policy` + `phases`), veredicto |
| `01-observation.md` | Hechos observados, contexto, alcance, lo que NO se interpreta |
| `02-problem-definition.md` | Enunciado, criterio de "resuelto", límites, severidad |
| `03-research.md` | Hallazgos con fuentes (`file:línea`/URL/commit), restricciones |
| `04-hypothesis.md` | Hipótesis priorizadas, predicción, criterio de refutación |
| `05-experiment-design.md` | Procedimiento, variables, controles, éxito/fracaso, rollback |
| `06-experiment-execution.md` | Comandos, cambios, desviaciones, logs crudos |
| `07-data-collection.md` | Datos normalizados, métricas, antes/después |
| `08-analysis.md` | Veredicto sobre hipótesis, magnitud, amenazas a la validez |
| `09-conclusion.md` | Decisión, residuos, deuda, seguimiento |
| `10-communication.md` | Resumen, cambios, evidencia, riesgos, borrador de commit/PR |

### 8.4 Convención de versionado
- `version: vMAJOR.MINOR` en frontmatter.
- **MINOR** se incrementa al reejecutar una fase (refinamiento sobre los mismos insumos).
- **MAJOR** se incrementa si cambian los insumos aguas arriba (la fase se rehace desde cero).
- Un artefacto reemplazado pasa a `status: superseded` y la nueva versión enlaza al anterior en
  `links.previous_version`. El historial fino lo aporta **git** (cada fase es un commit o parte de uno).

#### 8.4.1 Enlace commit↔caso y derivación del changelog
- **Trailer obligatorio.** Cada commit de un caso lleva el trailer `Case: <case-id>` en su pie (formato
  de trailer de git). Esto cierra la trazabilidad **bidireccional**: del expediente a sus commits
  (`git log --grep "Case: <case-id>"`) y de cada entrada del changelog a su expediente.
- **Changelog derivado.** El `CHANGELOG.md` **no se edita a mano**: se **deriva** de los commits
  convencionales (fuente única de verdad) mediante el **generador on-demand** (§9.3), agrupando por tipo
  en formato Keep a Changelog. La fase 10 lo ejecuta con `--pending` e incluye el archivo en su commit.
  El trailer `Case:` se preserva en cada entrada para el enlace inverso.
- **Registro de casos derivado.** El índice de casos tampoco se persiste: se **deriva** del filesystem
  (`maintenance-cases/*/case.md`) y del `CHANGELOG.md` cuando se necesita (§9.2).

### 8.5 Relación entre artefactos y auditoría posterior
La cadena `01 → 10` más `case.md` constituye el **expediente del caso**: toda conclusión (`09`) es
rastreable hasta su evidencia (`07`), su experimento (`05`/`06`), su hipótesis (`04`) y la observación
original (`01`). Una auditoría posterior puede:
1. Abrir `case.md` para ver perfil, veredicto y estado.
2. Seguir `links` fase a fase.
3. Reproducir el experimento desde `05`/`06`.
4. Derivar el registro de casos (filesystem + changelog) y consultar el `CHANGELOG.md` —y desde una
   entrada, saltar al expediente vía el trailer `Case:`— para detectar patrones entre casos.

---

## 9. Memoria, changelog y hooks

Principio rector de toda esta sección: **estado derivado sobre estado duplicado** (§2.5.1). El changelog
y el registro de casos se **derivan** de fuentes de verdad existentes (commits, filesystem); solo las
**lecciones** se persisten deliberadamente, con un dueño único.

### 9.1 Memoria en dos niveles + protocolo de recall

La memoria se desdobla en dos niveles con **dueño único** cada uno:

**(a) Base de conocimiento (lecciones) — persistida deliberadamente.**
Organizada bajo el **patrón de memoria del subsistema**: *un aprendizaje por archivo* bajo
`.claude/memory/`, con `MEMORY.md` como índice (una línea por lección). Claude Code **no** carga
`MEMORY.md` automáticamente; el recall es un paso explícito de la fase 03 que lee el índice y abre
las lecciones relevantes. Para que `MEMORY.md` entre en contexto en cada sesión, `.claude/CLAUDE.md`
contiene una referencia a él. Cada lección lleva frontmatter con tags de recall:

| Tag | Significado |
|---|---|
| `component` | Componente/módulo afectado (p. ej. `auth`, `payments`, `gateway`) |
| `defect-class` | Clase de defecto/riesgo (p. ej. `connection-pool`, `n+1`, `unhandled-rejection`) |
| `profile` | Perfil bajo el que se aprendió (`corrective`/`adaptive`/`perfective`/`preventive`) |

- **Dueño:** la fase 09 (Conclusión) la **escribe** (destila la lección); la fase 03 (Investigación) la
  **lee** (recall). Crece por **aprendizaje**, no por volumen de casos.
- **Protocolo de recall (fase 03):** derivar `component`/`defect-class`/`profile` de la definición del
  problema (fase 02) y del perfil activo, y consultar `MEMORY.md` por esos tags. Es un **procedimiento**
  (qué consultar y cómo incorporarlo), no una promesa de que exista una lección aplicable.

**(b) Registro de casos — derivado, nunca a mano.**
No existe como archivo mantenido manualmente (se elimina el antiguo ledger plano). Se **deriva** del
filesystem (`maintenance-cases/*/case.md`: id, perfil, fecha, veredicto) y del `CHANGELOG.md` cuando se
necesita un índice. Ver §9.2.

**(c) `CLAUDE.md` del subsistema** — instrucciones persistentes: cómo se nombran los casos, política de
rollback por defecto, no saltarse fases, "artefactos = fuente de verdad", trailer `Case:` obligatorio y
"changelog/registro = derivados".

### 9.2 Registro de casos (derivado)

El índice histórico de casos **no se persiste**; se **deriva** bajo demanda de dos fuentes ya existentes:

- **Filesystem:** cada `maintenance-cases/<case-id>/case.md` aporta id, perfil, fecha y veredicto.
- **Changelog:** `CHANGELOG.md` aporta los cambios publicados, enlazados al caso por el trailer `Case:`.

Derivarlo (en vez de mantener un ledger plano) elimina la divergencia entre el índice y la realidad: el
registro **siempre** refleja el estado actual de los expedientes y de los commits. No hay un paso manual
de "actualizar el ledger" ni un hook que lo anexe.

### 9.3 Changelog (derivado)

- **Fuente única de verdad:** los **commits convencionales** del repositorio (skill `conventional-commits`).
- **Formato:** **Keep a Changelog**, agrupado por tipo de commit (`feat`, `fix`, `perf`, etc.), con cada
  entrada conservando su trailer `Case: <case-id>` para el enlace inverso al expediente.
- **Mecanismo:** **generador on-demand** (sketch en §12.14). La fase 10 lo ejecuta pasándole la entrada
  pendiente del caso actual (`--pending "<subject>" --case <id>`); el generador actualiza `CHANGELOG.md`
  y la fase lo incluye en su commit normal (sin `--amend`, sin commit extra). Sin `--pending` el
  generador reproduce el archivo completo desde `git log` → **idempotente** (útil en CI para verificar
  sincronía). Ningún skill ni fase redacta el changelog a mano.
- **Releases:** si existen tags `vX.Y.Z`, el generador secciona por tag (`## [X.Y.Z]`) y agrupa los
  commits posteriores al último tag bajo `## [Unreleased]`. Sin tags, todo bajo `[Unreleased]`.
- **Rendimiento O(n):** no es un problema porque el generador se ejecuta raramente (on-demand, no en
  cada commit). Integraciones con semantic-release o generación automática de versiones están fuera del
  alcance deliberado de este diseño.
- **Alcance:** `CHANGELOG.md` **global del proyecto** + trailer `Case:` en cada commit (enlace
  bidireccional changelog↔expediente).

### 9.4 Generador on-demand vs git hook para el changelog

**Por qué no un git hook `post-commit`.** La alternativa de un hook `post-commit` con `--amend` fue
evaluada y descartada por tres riesgos concretos:
1. **Reescritura de commits:** `git commit --amend` modifica el commit que acaba de crearse, lo que
   puede desencadenar un segundo `post-commit`, crear un bucle o introducir inconsistencias si el hook
   falla en mitad del proceso.
2. **Mezcla derivado/fuente:** el `CHANGELOG.md` (derivado) quedaría fundido en el mismo `--amend`
   junto con los cambios de fuente, haciendo el diff menos legible y la bisección más frágil.
3. **Complejidad oculta:** el hook dispara en cualquier commit, incluyendo merges o commits de CI donde
   su intervención puede ser indeseada.

**Por qué on-demand.** El generador se ejecuta *cuando corresponde* (la fase 10 lo invoca) con la
entrada precisa (`--pending "<subject>" --case <id>`), actualiza `CHANGELOG.md` y este se incluye en el
commit normal como cualquier otro archivo modificado. No hay `--amend`, no hay riesgo de bucle, no hay
estado oculto. La validación de sincronía puede delegarse a CI ejecutando el generador sin `--pending`
y verificando que el árbol queda limpio.

**Hook de Claude Code** (`sm-validate-artifact`): mecanismo distinto, evento distinto. Se dispara sobre
`PostToolUse` (Write/Edit en `maintenance-cases/`) dentro de una sesión de Claude Code, y valida que el
frontmatter del artefacto cumple el esquema (campos obligatorios, `phase` válida). La validación de
esquema es un **paso obligatorio** del orquestador (ver §12.2 paso 4); el hook de Claude Code es una
**automatización opcional** de esa misma verificación. Se describe pero **no se instala** hasta que el
usuario lo apruebe (§6 de `CLAUDE.md`).

---

## 10. Ejemplos de uso

Cada ejemplo muestra: entrada inicial, perfil seleccionado, secuencia de fases, artefactos producidos y
salida final esperada. Los cuatro ejemplos usan **modo Full** (los más representativos para documentar
el flujo completo). Un caso trivial como *"corregir un typo en un mensaje de error"* usaría **modo
Consolidado**: el orquestador clasificaría `corrective`, fijaría `case_mode: consolidated`, y las 10 fases escribirían
subsecciones dentro de un único `case.md` en lugar de artefactos individuales.

### 10.1 Caso Corrective

- **Entrada:** *"El login falla con timeout intermitente desde ayer; hay un 500 en producción."*
- **Perfil seleccionado:** `corrective` (señal: fallo presente + regresión reciente).
- **Secuencia y artefactos:**

| Fase | Resultado clave | Artefacto |
|---|---|---|
| 01 Observación | 500 intermitente; pico de latencia en `auth/session.ts` | `01-observation.md` |
| 02 Definición | "login devuelve 500 cuando la conexión al store supera 2s" | `02-problem-definition.md` |
| 03 Investigación | commit reciente cambió el timeout del pool `session.ts:88` | `03-research.md` |
| 04 Hipótesis | "el pool agota conexiones por timeout mal configurado" | `04-hypothesis.md` |
| 05 Diseño | test que reproduce timeout bajo carga; rollback = revertir commit | `05-experiment-design.md` |
| 06 Ejecución | test rojo reproduce el 500; aplicar fix de pool | `06-experiment-execution.md` |
| 07 Datos | test rojo→verde; latencia p99 normalizada | `07-data-collection.md` |
| 08 Análisis | hipótesis confirmada; sin regresiones en suite | `08-analysis.md` |
| 09 Conclusión | aplicar fix; añadir test de carga al CI | `09-conclusion.md` |
| 10 Comunicación | PR + commit `fix(auth): ...` con trailer `Case:` | `10-communication.md` |

- **Artefactos del caso:** `maintenance-cases/20260606-login-timeout/case.md` + `01..10-*.md`.
- **Commit (fuente de verdad):**

````text
fix(auth): corregir timeout del pool de conexiones en login

El pool agotaba conexiones por un timeout mal configurado introducido en
session.ts:88, devolviendo 500 intermitentes. Se restaura el valor y se
añade un test de carga al CI.

Case: 20260606-login-timeout
````

- **Changelog (derivado por generador on-demand):**

````markdown
### Fixed
- corregir timeout del pool de conexiones en login (Case: 20260606-login-timeout)
````

- **Lección (base de conocimiento, escrita en fase 09):**
  `.claude/memory/connection-pool-timeout-regressions.md` con tags `component: auth`,
  `defect-class: connection-pool`, `profile: corrective`.
- **Salida final:** fix verificado por test de reproducción, cero regresiones, PR con expediente
  enlazado; el registro de casos y el changelog quedan **derivados** (no se editan a mano).

### 10.2 Caso Adaptive

- **Entrada:** *"Hay que migrar de la API v1 de pagos a la v2 antes de su deprecación."*
- **Perfil:** `adaptive` (señal: cambio externo / deprecación).
- **Secuencia y artefactos:**

| Fase | Resultado clave | Artefacto |
|---|---|---|
| 01 | uso de v1 en `payments/*`; fecha de deprecación | `01-observation.md` |
| 02 | "soportar v2 manteniendo contrato público de `PaymentService`" | `02-problem-definition.md` |
| 03 | diferencias v1↔v2; breaking changes | `03-research.md` |
| 04 | "adaptador v2 detrás de feature flag mantiene compatibilidad" | `04-hypothesis.md` |
| 05 | contract tests v1 y v2; rollback = flag off | `05-experiment-design.md` |
| 06 | implementar adaptador; ejecutar ambos contract tests | `06-experiment-execution.md` |
| 07 | matriz de compatibilidad v1/v2 verde | `07-data-collection.md` |
| 08 | compatibilidad confirmada; sin ruptura pública | `08-analysis.md` |
| 09 | activar v2 gradualmente; plan de retirada de v1 | `09-conclusion.md` |
| 10 | PR `feat(payments): adaptar a API v2` + guía de migración | `10-communication.md` |

- **Artefactos del caso:** `maintenance-cases/20260607-payments-api-v2/case.md` + `01..10-*.md`.
- **Commit:** `feat(payments): adaptar a API v2 detrás de feature flag` con trailer
  `Case: 20260607-payments-api-v2`.
- **Changelog (derivado):** entrada en `### Added` con `(Case: 20260607-payments-api-v2)`.
- **Lección (fase 09):** `.claude/memory/api-migration-behind-flag.md` con tags `component: payments`,
  `defect-class: breaking-api-change`, `profile: adaptive`.
- **Salida final:** adaptación compatible y reversible (feature flag), contract tests verdes, ruta de
  migración documentada; changelog y registro de casos **derivados**.

### 10.3 Caso Perfective

- **Entrada:** *"El endpoint de reporting tarda 4s; hay que optimizarlo."*
- **Perfil:** `perfective` (señal: oportunidad de calidad/rendimiento).
- **Secuencia y artefactos:**

| Fase | Resultado clave | Artefacto |
|---|---|---|
| 01 | p95 = 4.1s en `/reports`; CPU alta en agregación | `01-observation.md` |
| 02 | "reducir p95 de `/reports` por debajo de 1s sin cambiar la salida" | `02-problem-definition.md` |
| 03 | N+1 queries en `report.repository.ts` | `03-research.md` |
| 04 | "batch + índice reduce el tiempo manteniendo el resultado" | `04-hypothesis.md` |
| 05 | benchmark A/B; baseline 50 runs; igualdad de salida | `05-experiment-design.md` |
| 06 | aplicar batching; ejecutar benchmark antes/después | `06-experiment-execution.md` |
| 07 | p95 4.1s → 0.7s; salida idéntica (snapshot) | `07-data-collection.md` |
| 08 | mejora significativa; comportamiento invariante | `08-analysis.md` |
| 09 | aceptar optimización; suite funcional verde | `09-conclusion.md` |
| 10 | PR `perf(reports): batching de queries` con números | `10-communication.md` |

- **Artefactos del caso:** `maintenance-cases/20260608-reports-latency/case.md` + `01..10-*.md`.
- **Commit:** `perf(reports): batching de queries para reducir p95` con trailer
  `Case: 20260608-reports-latency`.
- **Changelog (derivado):** entrada en `### Changed` con `(Case: 20260608-reports-latency)`.
- **Lección (fase 09):** `.claude/memory/n-plus-one-batching.md` con tags `component: reports`,
  `defect-class: n+1`, `profile: perfective`.
- **Salida final:** mejora medible (p95 −83 %) con comportamiento funcional invariante, benchmark
  reproducible adjunto; changelog y registro de casos **derivados**.

### 10.4 Caso Preventive

- **Entrada:** *"Auditemos el manejo de errores del gateway antes de la próxima release."*
- **Perfil:** `preventive` (señal: hardening / auditoría de riesgo futuro).
- **Secuencia y artefactos:**

| Fase | Resultado clave | Artefacto |
|---|---|---|
| 01 | rutas sin manejo de error en `gateway/*`; logs silenciosos | `01-observation.md` |
| 02 | "evitar caídas no controladas por errores no manejados en el gateway" | `02-problem-definition.md` |
| 03 | clase de defecto: promesas sin catch; recall de lecciones por `defect-class` | `03-research.md` |
| 04 | "un error no capturado en upstream tumba el proceso" | `04-hypothesis.md` |
| 05 | prueba que inyecta fallo upstream en sandbox; rollback trivial | `05-experiment-design.md` |
| 06 | inyectar fallo: el proceso cae; añadir guardas + boundary | `06-experiment-execution.md` |
| 07 | antes: crash; después: error contenido y logueado | `07-data-collection.md` |
| 08 | riesgo confirmado y mitigado; residual = paths no cubiertos | `08-analysis.md` |
| 09 | aplicar guardas; backlog para paths residuales | `09-conclusion.md` |
| 10 | PR `fix(gateway): error boundary` + nota de riesgo residual | `10-communication.md` |

- **Artefactos del caso:** `maintenance-cases/20260609-gateway-error-boundary/case.md` + `01..10-*.md`.
- **Commit:** `fix(gateway): añadir error boundary para errores no manejados` con trailer
  `Case: 20260609-gateway-error-boundary`.
- **Changelog (derivado):** entrada en `### Fixed` con `(Case: 20260609-gateway-error-boundary)`.
- **Lección (fase 09):** `.claude/memory/unhandled-rejection-boundary.md` con tags `component: gateway`,
  `defect-class: unhandled-rejection`, `profile: preventive`.
- **Salida final:** riesgo de caída mitigado con error boundary, prueba que provocaba el crash ahora
  contenida, riesgo residual cuantificado; changelog y registro de casos **derivados**.

---

## 11. Recomendaciones de implementación

1. **Construir de afuera hacia adentro.** Empezar por `sm-orchestrator` + `phase-policy-schema.md` +
   `case.md`/`phase-artifact.md` (las plantillas). Validan el flujo y el contrato antes de escribir las
   14 skills.
2. **Implementar primero un *vertical slice*.** Un perfil (`corrective`) + las 10 fases con
   comportamiento genérico. Ejecutar el ejemplo 10.1 de extremo a extremo. Solo entonces añadir los
   otros tres perfiles (que ya no tocan las fases).
3. **Mantener el contrato pequeño.** `focus/reasoning_effort/evidence/acceptance/risk_controls` cubren las
   necesidades de adaptación conocidas. Resistir la tentación de ampliarlo "por si acaso" (§2/§6 de
   `CLAUDE.md`).
4. **Frontmatter `description` explícito.** Claude Code tiende a *undertrigger*; el orquestador debe
   declarar triggers en español (corrige, optimiza, migra, endurece, mantén). Los perfiles y fases no
   necesitan auto-activación fuerte porque los invoca el orquestador.
5. **Artefactos versionados con git.** Cada caso es una rama o un conjunto de commits; un commit por
   fase facilita la auditoría y el `git blame` por evidencia.
6. **Hook de Claude Code al final.** Operar primero con la validación obligatoria del orquestador (paso
   4 del flujo, §12.2); instalar `sm-validate-artifact` solo cuando el flujo esté estable y el usuario
   lo apruebe (§9.4).
7. **Changelog derivado: generador on-demand.** Orden sugerido: (a) escribir el generador idempotente
   (sketch en §12.14) que produce `CHANGELOG.md` desde `git log` en formato Keep a Changelog, agrupando
   por tipo, preservando el trailer `Case:` y aceptando `--pending`/`--case`; (b) la fase 10 lo ejecuta
   con `--pending` e incluye `CHANGELOG.md` en su commit normal; (c) opcional: añadir un paso de CI que
   ejecute el generador sin `--pending` y verifique que el árbol queda limpio. El changelog nunca se
   edita a mano (§2.5.1, §9.3). Sin `--amend`, sin hook `post-commit`.
8. **Base de conocimiento: siembra y curado.** Sembrar `MEMORY.md` con lecciones reales conforme se
   cierran casos (fase 09), no de forma especulativa. Curar periódicamente: fusionar lecciones
   redundantes y corregir tags para que el recall de la fase 03 siga siendo preciso. La base crece por
   **aprendizaje**, no por volumen de casos.
9. **Sub-agents como evolución futura.** Si una fase (p. ej. investigación) se vuelve costosa en
   contexto, puede aislarse en un sub-agent **sin cambiar el contrato**: el orquestador seguiría leyendo
   el mismo artefacto. El diseño base no los necesita.
10. **No saltarse fases.** Incluso en casos triviales, las fases pueden ejecutarse en modo `light`
   (`reasoning_effort: low`) produciendo artefactos breves, pero la cadena de trazabilidad se mantiene completa.

---

## 12. Markdown reales de los archivos principales

> Los siguientes bloques son **contenido real y utilizable**. Cuerpo de las skills en inglés con bloque
> `<user_communication>` para I/O en español, conforme a la política del repositorio
> (`artifact-structuring §language_policy`). Para copiarlos a archivos `.md` que a su vez contienen
> bloques de código, se usan vallas de cuatro backticks aquí.

### 12.1 `.claude/CLAUDE.md` (instrucciones persistentes del subsistema)

````markdown
<scientific_maintenance>
# Scientific Maintenance Subsystem — persistent instructions

This repository runs software maintenance as reproducible scientific experiments through the
`sm-*` skill family. Treat every maintenance request as a *case* driven by `sm-orchestrator`.

## Non-negotiable rules
- Artifacts are the source of truth, not the conversation. Every phase writes one versioned
  artifact under `maintenance-cases/<case-id>/`. The case manifest is `case.md`.
- Never skip phases. Trivial cases may run phases with `reasoning_effort: low` (short artifacts) but the
  full 01→10 chain must exist.
- Profiles set policy; phases execute procedure. Never put profile logic inside a phase, nor
  phase procedure inside a profile.
- Phase behavior varies only through the phase-policy matrix in `case.md`
  (see references/phase-policy-schema.md). Do not fork phases per profile.
- Derived state over duplicated state. CHANGELOG.md and the case index are DERIVED (from commits
  and the filesystem); never hand-edit them. Only lessons are persisted deliberately.

## Case identity
- `case-id = YYYYMMDD-<slug>` (kebab slug from the problem).
- All artifacts for a case live in `maintenance-cases/<case-id>/`.

## Knowledge & traceability
- Knowledge base = MEMORY.md index convention (not runtime-loaded): one lesson per file under
  .claude/memory/, indexed by MEMORY.md, tagged `component`/`defect-class`/`profile`. Claude Code
  does NOT load MEMORY.md automatically; phase 03 reads it as an explicit recall step. This CLAUDE.md
  references MEMORY.md so it enters context each session. Phase 09 writes lessons.
- Case index is DERIVED from maintenance-cases/ and CHANGELOG.md — never a hand-kept ledger.
- Every commit for a case carries the trailer `Case: <case-id>`. CHANGELOG.md is regenerated from
  git log by the on-demand generator (Keep a Changelog). Phase 10 runs it. See references/changelog.md.

## Default policies
- Default rollback for any experiment: revert the change / disable the feature flag.
- On verdict: write a lesson (phase 09) and commit with the `Case:` trailer (phase 10). Do NOT edit
  the changelog or any case ledger by hand — both are derived.

## Memory index (explicit reference — MEMORY.md is not auto-loaded by the runtime)
See: .claude/memory/MEMORY.md
</scientific_maintenance>

<user_communication>
All user-facing output is in Spanish. Skill bodies and artifact header fields are in English for
token efficiency; explanations, questions, and summaries to the user are Spanish. See
.claude/skills/artifact-structuring/SKILL.md §language_policy.
</user_communication>
````

### 12.2 `.claude/skills/sm-orchestrator/SKILL.md`

````markdown
---
name: sm-orchestrator
description: >
  Drive a software maintenance case end-to-end as a scientific experiment: classify the case,
  select a maintenance profile and case mode (full/consolidated), run the ten scientific-method phases in
  order, produce phase artifacts (full: one file per phase; consolidated: subsections in case.md), consolidate
  a verdict, distill a lesson, run the changelog generator, and commit with a `Case:` trailer
  (the changelog and case index are derived, never hand-edited). Use
  when the user asks to maintain, fix a bug, correct a regression, optimize, refactor, migrate,
  upgrade a dependency, adapt to a new API/platform, harden, audit, or reduce risk. Also trigger
  for: mantener, corregir bug, arreglar, optimizar, refactorizar, migrar, actualizar dependencia,
  adaptar, endurecer, auditar, prevenir, mantenimiento correctivo/adaptativo/perfectivo/preventivo.
---

# Scientific Maintenance — Orchestrator

Conducts a maintenance case through the scientific method. Owns the FLOW; delegates POLICY to a
profile skill and PROCEDURE to phase skills. Never implements profile policy or phase procedure.

<user_communication>
Talk to the user in Spanish (questions, confirmations, summaries). Keep artifacts' machine fields
in English. Canonical policy: ../artifact-structuring/SKILL.md §language_policy.
</user_communication>

## Workflow

1. **Identify the case.** Derive `case-id = YYYYMMDD-<slug>`. If a `case-id` is given, resume from
   `maintenance-cases/<case-id>/case.md`.
2. **Classify the profile.** Use references/classification-guide.md to pick one of corrective,
   adaptive, perfective, preventive. If ambiguous, ask the user in Spanish (offer the 2 best fits).
3. **Create the manifest.** Copy templates/case.md to `maintenance-cases/<case-id>/case.md`; fill
   case_id, profile, case_mode (consolidated for trivial/localized fixes, full otherwise), and the 10 phases
   as `pending` in the canonical YAML block.
4. **Load policy.** Invoke the matching `sm-profile-<x>` skill. It writes its parameters and the
   phase-policy matrix into the canonical YAML block in case.md. **Validate the schema** (mandatory):
   confirm case_mode is set, all 10 phase_policy entries are present, and all 10 phases entries exist
   with valid status values. Do not proceed until validation passes.
5. **Run phases 01→10 in order.** Before executing phase N, verify in the canonical YAML block that
   phases 01..N-1 are `done`; stop and report if any is not. For each phase, invoke the matching
   `sm-phase-*` skill. After each phase: in full mode, confirm `NN-<phase>.md` exists and set
   artifact path; in consolidated mode, confirm the `## NN — <Phase>` subsection in case.md was written.
   Mark the phase `done` and record artifact + version in the canonical YAML block. Stop and report
   if a phase fails its acceptance criterion. (Phase 03 reads MEMORY.md explicitly for recall; phase
   09 writes a lesson; phase 10 runs the changelog generator and drafts the commit with a `Case:` trailer.)
6. **Consolidate.** Read 09-conclusion.md (or the consolidated subsection); write the verdict into case.md.
   Confirm phase 09 wrote a lesson to .claude/memory/ (indexed in MEMORY.md). Do NOT write a case
   ledger — it is derived.
7. **Commit, do not hand-edit derived state.** Phase 10 runs the changelog generator with
   `--pending "<subject>" --case <case-id>` and includes CHANGELOG.md in its commit. Never edit
   CHANGELOG.md or any case index by hand. See references/changelog.md.
8. **Report to the user** in Spanish: profile, verdict, key artifacts, the lesson written, follow-ups.

## Phase order (fixed)

observation → problem-definition → research → hypothesis → experiment-design →
experiment-execution → data-collection → analysis → conclusion → communication

## References

| File | When to read |
|------|--------------|
| references/phase-policy-schema.md | The profile↔phase contract (always, before step 4) |
| references/classification-guide.md | Choosing the profile (step 2) |
| references/artifact-conventions.md | Naming, frontmatter, versioning, `Case:` trailer (steps 3–7) |
| references/knowledge-base.md | Lesson schema + recall protocol (steps 5–6) |
| references/changelog.md | Keep a Changelog format + derivation from commits (step 7) |
| templates/case.md | Manifest skeleton (step 3) |
| templates/phase-artifact.md | Phase artifact skeleton (passed to phases) |

<constraints>
- One profile per case; one artifact per phase; phases run in the fixed order above.
- Never write phase procedure or profile policy here — only orchestrate.
- Artifacts are the source of truth; never keep case state only in conversation.
- Derived state over duplicated state: never hand-edit CHANGELOG.md or a case ledger.
- No sub-agents.
</constraints>
````

### 12.3 Referencia compartida — `.claude/skills/sm-orchestrator/references/phase-policy-schema.md`

````markdown
# Phase-Policy Schema (profile ↔ phase contract)

This is the ONLY coupling point between profiles and phases. Each profile fills, per phase, the
fields below into `case.md`. Each phase reads its own entry to adapt behavior. Phases never read a
profile skill; profiles never read a phase skill.

## Fields (per phase)

| Field | Type | Meaning |
|-------|------|---------|
| `focus` | string | What to prioritize in this phase under this profile |
| `reasoning_effort` | enum `low\|medium\|high\|xhigh` | Effort/detail expected |
| `evidence` | string[] | Evidence types the profile requires this phase to produce/collect |
| `acceptance` | string | Pass criterion for this phase's artifact |
| `risk_controls` | string[] | Mandatory guards (e.g. sandbox, feature flag, rollback) |

## Location in case.md

`phase_policy` lives inside the **canonical state block** of `case.md` (section "Canonical state"),
alongside `case_mode` and `phases`. There is no separate markdown table for phase status — the YAML
block is the single machine-readable source. Schema validation of this block is a mandatory step of
the orchestrator.

```yaml
# Inside the canonical state block in case.md:
case_mode: full   # full | consolidated
openspec_change: ""   # nombre del change de OpenSpec (Etapa B); vacío si no aplica

phase_policy:
  observation:        { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  problem-definition: { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  research:           { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  hypothesis:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-design:  { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  experiment-execution:{ focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  data-collection:    { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  analysis:           { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  conclusion:         { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }
  communication:      { focus: "...", reasoning_effort: medium, evidence: [...], acceptance: "...", risk_controls: [...] }

phases:
  "01-observation":         { status: pending, artifact: "", version: "" }
  # ... (one entry per phase)
```

## Rule

Changing this schema is an architectural change. Everything else evolves without touching it.
````

### 12.4 Referencia — `.claude/skills/sm-orchestrator/references/classification-guide.md`

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
````

### 12.5 Referencia — `.claude/skills/sm-orchestrator/references/artifact-conventions.md`

````markdown
# Artifact Conventions

## Naming
- Case folder: `maintenance-cases/<case-id>/` with `case-id = YYYYMMDD-<slug>`.
- If `maintenance-cases/<case-id>/` already exists, append an incremental suffix: `-2`, `-3`, etc.
  (e.g. `20260606-login-timeout-2`). Concurrent locking is out of scope by deliberate design choice.
- Manifest: `case.md`. Phase artifacts (full mode): `NN-<phase>.md`, NN in 01..10.
- Consolidated mode: phase content lives in `## NN — <Phase>` subsections of `case.md`. No separate artifacts.

## Frontmatter (phase artifact)
```yaml
---
case_id: <id>
profile: <corrective|adaptive|perfective|preventive>
phase: <NN-phase>
version: vMAJOR.MINOR
timestamp: <ISO-8601 UTC>
status: <pending|in_progress|done|superseded>
inputs: [<prior artifacts>]
produces: <this file>
links: { previous: <file>, next: <file> }
---
```

## Versioning
- MINOR++ when re-running a phase on the same inputs (refinement).
- MAJOR++ when upstream inputs changed (phase redone from scratch).
- Superseded artifacts set `status: superseded` and link `links.previous_version`.
- Fine-grained history lives in git (one commit per phase recommended).

## Commit ↔ case link (trailer)
- Every commit for a case ends with the git trailer `Case: <case-id>`.
- This gives bidirectional traceability: case → commits (`git log --grep "Case: <case-id>"`) and
  changelog entry → case (the trailer is preserved per entry).

## Derived state (do NOT hand-edit)
- CHANGELOG.md is derived from conventional commits by the on-demand generator
  (see references/changelog.md). Phase 10 runs it with `--pending`; it is idempotent without `--pending`.
- The case index is derived from `maintenance-cases/*/case.md` + CHANGELOG.md. There is no ledger file.
- Only lessons are persisted deliberately (see references/knowledge-base.md).
````

#### 12.5.1 Referencia — `.claude/skills/sm-orchestrator/references/knowledge-base.md`

````markdown
# Knowledge Base (MEMORY.md index pattern)

The knowledge base is the ONLY deliberately persisted memory. It follows the MEMORY.md index
convention: one lesson per file under `.claude/memory/`, indexed by `MEMORY.md` (one line per lesson).
Claude Code does NOT load MEMORY.md automatically; phase 03 reads it as an explicit recall step.
It holds non-derivable learnings — NOT case summaries (those live in the case file).

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

## Recall protocol (phase 03)
1. Derive `component` / `defect-class` from the phase-02 problem statement; take `profile` from case.md.
2. Query MEMORY.md by those tags; open the matching lessons.
3. Cite recalled lessons as prior art in 03-research.md.
Recall is a PROCEDURE (which tags to query and how to incorporate), not a promise a lesson exists.

## Ownership
- Phase 09 WRITES one lesson on verdict. Phase 03 READS by tags.
- The base grows by LEARNING, not by case volume. Curate: merge redundant lessons, fix tags.
````

#### 12.5.2 Referencia — `.claude/skills/sm-orchestrator/references/changelog.md`

````markdown
# Changelog (derived from conventional commits)

CHANGELOG.md is DERIVED state — never hand-edited (project §2.5.1). Single source of truth: the
repository's conventional commits (see the `conventional-commits` skill).

## Format
- Keep a Changelog (https://keepachangelog.com), grouped by commit type:
  `feat → Added`, `fix → Fixed`, `perf → Changed`, `refactor → Changed`, `docs → Documentation`, etc.
- Each entry preserves the `Case: <case-id>` trailer for the reverse link to the case file.

## Derivation mechanism
- Generated by the **on-demand generator** (sketch: see §12.14 of the design doc). Phase 10 runs it
  with `--pending "<subject>" --case <id>` and includes CHANGELOG.md in its commit. No skill or phase
  hand-writes changelog entries. Without `--pending` the generator rebuilds the full file from `git log`
  (idempotent; suitable for CI sync-checks).
- Scope: a single project-global CHANGELOG.md, plus the `Case:` trailer on every commit
  (bidirectional changelog ↔ case link).
- Releases: if `vX.Y.Z` tags exist, entries are grouped under `## [X.Y.Z]` sections; commits after the
  latest tag appear under `## [Unreleased]`.

## Why on-demand (not a git hook)
A `post-commit` git hook with `--amend` rewrites the just-created commit, which risks a re-trigger loop
and merges derived state into the source commit. An on-demand generator called from phase 10 produces
CHANGELOG.md as a regular file change staged alongside the case artifacts, with no `--amend` and no
hidden side effects. See §9.4 for the full rationale.
````

### 12.6 Plantilla — `.claude/skills/sm-orchestrator/templates/case.md`

La plantilla incluye el **bloque YAML canónico** machine-readable (única fuente de estado del caso).
Se presentan las variantes Full (artefactos individuales por fase) y Consolidado (un solo archivo actualizado).

````markdown
---
case_id: <YYYYMMDD-slug>
profile: <corrective|adaptive|perfective|preventive>
created: <ISO-8601 UTC>
status: in_progress           # in_progress | done | aborted
verdict:                       # filled at consolidation
---

# Case Manifest — <case_id>

## Case
<one-paragraph description of the maintenance request>

## Profile parameters
<filled by the sm-profile-* skill: objective, priorities, success metrics, risk thresholds>

## Canonical state (machine-readable — single source of truth)

```yaml
case_mode: full                # full | consolidated  (set by orchestrator at classification)
openspec_change: ""            # nombre del change de OpenSpec; se llena al inicio de Etapa B; vacío si SM 09 no derivó en change

phase_policy:
  observation:        { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  problem-definition: { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  research:           { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  hypothesis:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-design:  { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  experiment-execution:{ focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  data-collection:    { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  analysis:           { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  conclusion:         { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }
  communication:      { focus: "", reasoning_effort: medium, evidence: [], acceptance: "", risk_controls: [] }

phases:
  # full mode: artifact = NN-<phase>.md  |  consolidated mode: artifact = case.md#<phase>
  "01-observation":         { status: pending, artifact: "", version: "" }
  "02-problem-definition":  { status: pending, artifact: "", version: "" }
  "03-research":            { status: pending, artifact: "", version: "" }
  "04-hypothesis":          { status: pending, artifact: "", version: "" }
  "05-experiment-design":   { status: pending, artifact: "", version: "" }
  "06-experiment-execution":{ status: pending, artifact: "", version: "" }
  "07-data-collection":     { status: pending, artifact: "", version: "" }
  "08-analysis":            { status: pending, artifact: "", version: "" }
  "09-conclusion":          { status: pending, artifact: "", version: "" }
  "10-communication":       { status: pending, artifact: "", version: "" }
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
<!-- sm-phase-hypothesis writes here -->

### 05 — Experiment Design
<!-- sm-phase-experiment-design writes here -->

### 06 — Experiment Execution
<!-- sm-phase-experiment-execution writes here -->

### 07 — Data Collection
<!-- sm-phase-data-collection writes here -->

### 08 — Analysis
<!-- sm-phase-analysis writes here -->

### 09 — Conclusion
<!-- sm-phase-conclusion writes here -->

### 10 — Communication
<!-- sm-phase-communication writes here -->
````

### 12.7 Plantilla — `.claude/skills/sm-orchestrator/templates/phase-artifact.md`

````markdown
---
case_id: <id>
profile: <profile>
phase: <NN-phase>
version: v1.0
timestamp: <ISO-8601 UTC>
status: in_progress
inputs: []
produces: <NN-phase>.md
links: { previous: , next: }
---

# <Phase title> — <case_id>

## Applied policy
<echo of focus / reasoning_effort / evidence / acceptance / risk_controls read from case.md>

## Result
<phase-specific content — see the phase skill>

## Acceptance check
<how this artifact meets `acceptance` from the policy>
````

### 12.8 `.claude/skills/sm-profile-corrective/SKILL.md`

````markdown
---
name: sm-profile-corrective
description: >
  Corrective maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator
  to write corrective parameters and the per-phase policy matrix into case.md. Use for bugs,
  regressions, exceptions, production incidents, red tests. Triggers: corregir, arreglar bug,
  regresión, fallo en producción. Does not execute phases.
---

# Profile — Corrective

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases or writes
phase artifacts.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Restore correct behavior by removing a defect with a minimal, verified change.

## Parameters to write into case.md
- Priorities: reproduce → root cause → minimal fix → no regression.
- Success metrics: reproduction test red→green; zero regressions; time-to-resolution.
- Risk thresholds: reject broad changes for a localized defect; reject a fix without a covering test.

## Phase-policy matrix to write (schema: ../sm-orchestrator/references/phase-policy-schema.md)

```yaml
phase_policy:
  observation:        { focus: "symptoms + reproduction steps", reasoning_effort: medium, evidence: [stack_trace, repro_steps], acceptance: "failure reproducible or precisely characterized", risk_controls: [] }
  problem-definition: { focus: "defect statement + no-regression criterion", reasoning_effort: medium, evidence: [], acceptance: "falsifiable, measurable bug statement", risk_controls: [] }
  research:           { focus: "recent changes / regressions in the area", reasoning_effort: medium, evidence: [related_commits, code_refs], acceptance: "suspected change(s) localized", risk_controls: [] }
  hypothesis:         { focus: "most probable, cheapest-to-test root cause", reasoning_effort: medium, evidence: [], acceptance: "falsifiable root-cause hypothesis", risk_controls: [] }
  experiment-design:  { focus: "write a failing test that reproduces the bug first", reasoning_effort: medium, evidence: [repro_test], acceptance: "repro test + rollback defined", risk_controls: [rollback] }
  experiment-execution:{ focus: "confirm red, then apply minimal fix", reasoning_effort: medium, evidence: [test_run], acceptance: "fix applied per design", risk_controls: [rollback] }
  data-collection:    { focus: "red→green + regression suite", reasoning_effort: medium, evidence: [test_results], acceptance: "repro test passes, suite green", risk_controls: [] }
  analysis:           { focus: "defect closed without regressions", reasoning_effort: medium, evidence: [], acceptance: "hypothesis confirmed, no regressions", risk_controls: [] }
  conclusion:         { focus: "apply fix + add covering test to CI", reasoning_effort: medium, evidence: [], acceptance: "actionable verdict", risk_controls: [] }
  communication:      { focus: "root cause + no-regression proof", reasoning_effort: medium, evidence: [], acceptance: "self-contained PR/commit draft", risk_controls: [] }
```

## Evidence prioritized
Reproduction test (red→green), stack traces, minimal diff.

## Conclusions favored
"Root cause X corrected, verified by test T, no regressions."
````

### 12.9 `.claude/skills/sm-profile-adaptive/SKILL.md`

````markdown
---
name: sm-profile-adaptive
description: >
  Adaptive maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator to
  write adaptive parameters and the per-phase policy matrix into case.md. Use for dependency
  upgrades, deprecations, new platforms/APIs, regulatory changes. Triggers: migrar, actualizar
  dependencia, adaptar, deprecación, compatibilidad. Does not execute phases.
---

# Profile — Adaptive

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Adapt the software to an external change while preserving compatibility.

## Parameters to write into case.md
- Priorities: compatibility → safe migration → coverage of the new contract.
- Success metrics: suite green on the new target; no public-contract breakage; documented migration.
- Risk thresholds: reject non-isolated changes (no feature flag); reject irreversible migrations
  without proof.

## Phase-policy matrix to write

```yaml
phase_policy:
  observation:        { focus: "environment/requirement delta + current usage", reasoning_effort: medium, evidence: [usage_map, deprecation_notice], acceptance: "delta and impacted surface mapped", risk_controls: [] }
  problem-definition: { focus: "required compatibility delta", reasoning_effort: medium, evidence: [], acceptance: "explicit compatibility target", risk_controls: [] }
  research:           { focus: "new API/contract + breaking changes", reasoning_effort: high, evidence: [api_diff, docs], acceptance: "breaking changes enumerated", risk_controls: [] }
  hypothesis:         { focus: "adaptation strategy preserving compatibility", reasoning_effort: medium, evidence: [], acceptance: "testable adaptation strategy", risk_controls: [] }
  experiment-design:  { focus: "compatibility/contract tests for old+new", reasoning_effort: medium, evidence: [contract_tests], acceptance: "tests + feature-flag rollback defined", risk_controls: [feature_flag, rollback] }
  experiment-execution:{ focus: "implement behind a flag; run both contract tests", reasoning_effort: medium, evidence: [test_run], acceptance: "implemented per design", risk_controls: [feature_flag] }
  data-collection:    { focus: "compatibility matrix old/new", reasoning_effort: medium, evidence: [compat_matrix], acceptance: "matrix green", risk_controls: [] }
  analysis:           { focus: "compatibility confirmed, no public breakage", reasoning_effort: medium, evidence: [], acceptance: "compatibility validated", risk_controls: [] }
  conclusion:         { focus: "gradual rollout + old-version retirement plan", reasoning_effort: medium, evidence: [], acceptance: "reversible migration plan", risk_controls: [feature_flag] }
  communication:      { focus: "compatibility + migration guide", reasoning_effort: medium, evidence: [], acceptance: "migration guide included", risk_controls: [] }
```

## Evidence prioritized
Compatibility matrices, contract tests, version before/after.

## Conclusions favored
"Adapted to Y keeping compatibility with X; migration reversible."
````

### 12.10 `.claude/skills/sm-profile-perfective/SKILL.md`

````markdown
---
name: sm-profile-perfective
description: >
  Perfective maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator to
  write perfective parameters and the per-phase policy matrix into case.md. Use for performance,
  readability, maintainability, refactor, optimization with no functional change. Triggers:
  optimizar, refactorizar, rendimiento, deuda técnica, mejorar calidad. Does not execute phases.
---

# Profile — Perfective

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Improve quality attributes (performance, readability, maintainability, UX) without changing
functional behavior.

## Parameters to write into case.md
- Priorities: measurable improvement → behavior preservation → no quality regression.
- Success metrics: statistically significant improvement of the target metric; functional suite green.
- Risk thresholds: reject optimization without a baseline; reject refactor without a test net; reject
  improvements within noise.

## Phase-policy matrix to write

```yaml
phase_policy:
  observation:        { focus: "current quality metric + hotspots", reasoning_effort: medium, evidence: [profile, metric_baseline], acceptance: "baseline measured", risk_controls: [] }
  problem-definition: { focus: "target metric + threshold, behavior invariant", reasoning_effort: medium, evidence: [], acceptance: "metric target with threshold", risk_controls: [] }
  research:           { focus: "optimization patterns / smells", reasoning_effort: medium, evidence: [code_refs, benchmarks], acceptance: "improvement candidate identified", risk_controls: [] }
  hypothesis:         { focus: "candidate change improves metric, keeps behavior", reasoning_effort: medium, evidence: [], acceptance: "testable optimization hypothesis", risk_controls: [] }
  experiment-design:  { focus: "A/B benchmark, equal-output check", reasoning_effort: high, evidence: [benchmark_plan], acceptance: "baseline N runs + output-equality + rollback", risk_controls: [rollback] }
  experiment-execution:{ focus: "apply change; run benchmark before/after", reasoning_effort: medium, evidence: [benchmark_run], acceptance: "applied per design", risk_controls: [rollback] }
  data-collection:    { focus: "metric deltas with variance + output snapshot", reasoning_effort: high, evidence: [metric_deltas, output_snapshot], acceptance: "deltas with variance recorded", risk_controls: [] }
  analysis:           { focus: "significance + behavior invariance", reasoning_effort: high, evidence: [], acceptance: "significant improvement, behavior unchanged", risk_controls: [] }
  conclusion:         { focus: "accept optimization, functional suite green", reasoning_effort: medium, evidence: [], acceptance: "accept/reject with numbers", risk_controls: [] }
  communication:      { focus: "metric delta narrative", reasoning_effort: medium, evidence: [], acceptance: "before/after numbers included", risk_controls: [] }
```

## Evidence prioritized
Reproducible benchmarks, performance profiles, complexity metrics, coverage.

## Conclusions favored
"Metric M improved by Δ (p<threshold) with no functional change."
````

### 12.11 `.claude/skills/sm-profile-preventive/SKILL.md`

````markdown
---
name: sm-profile-preventive
description: >
  Preventive maintenance policy for the scientific-maintenance system. Invoked by sm-orchestrator to
  write preventive parameters and the per-phase policy matrix into case.md. Use for audits, hardening,
  fragility analysis, recurring defect classes, potential vulnerabilities, missing critical coverage.
  Triggers: prevenir, endurecer, auditar, hardening, riesgo, vulnerabilidad. Does not execute phases.
---

# Profile — Preventive

Policy layer. Writes parameters + phase-policy matrix into `case.md`. Never executes phases.

<user_communication>Spanish for any user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Objective
Reduce the probability or impact of future failures before they occur.

## Parameters to write into case.md
- Priorities: risk identification → mitigation → residual-risk quantification.
- Success metrics: risk demonstrably mitigated; residual risk quantified; guards/coverage added.
- Risk thresholds: reject changes adding net risk; reject mitigation without a validating test; reject
  scope exceeding the addressed risk.

## Phase-policy matrix to write

```yaml
phase_policy:
  observation:        { focus: "weak signals, trends, fragile areas", reasoning_effort: high, evidence: [static_analysis, trend_data], acceptance: "risk surface characterized", risk_controls: [sandbox] }
  problem-definition: { focus: "risk to mitigate + probability/impact", reasoning_effort: medium, evidence: [], acceptance: "risk statement with prob/impact", risk_controls: [] }
  research:           { focus: "defect class / analogous vulnerabilities + knowledge-base recall", reasoning_effort: high, evidence: [threat_model, recalled_lessons], acceptance: "defect class understood", risk_controls: [] }
  hypothesis:         { focus: "risk materialization mechanism", reasoning_effort: medium, evidence: [], acceptance: "falsifiable risk hypothesis", risk_controls: [] }
  experiment-design:  { focus: "test that provokes the risk condition in sandbox", reasoning_effort: high, evidence: [risk_probe], acceptance: "probe + trivial rollback defined", risk_controls: [sandbox, rollback] }
  experiment-execution:{ focus: "provoke condition; add guards/boundary", reasoning_effort: medium, evidence: [probe_run], acceptance: "executed in isolation", risk_controls: [sandbox] }
  data-collection:    { focus: "before/after risk condition", reasoning_effort: medium, evidence: [risk_state_before_after], acceptance: "risk state captured", risk_controls: [] }
  analysis:           { focus: "effective risk reduction + residual", reasoning_effort: high, evidence: [], acceptance: "risk reduced, residual identified", risk_controls: [] }
  conclusion:         { focus: "apply guards; backlog residual paths", reasoning_effort: medium, evidence: [], acceptance: "mitigation + quantified residual", risk_controls: [] }
  communication:      { focus: "risk avoided + residual risk note", reasoning_effort: medium, evidence: [], acceptance: "risk note included", risk_controls: [] }
```

## Evidence prioritized
Tests that provoke the risk condition, static analysis, critical-path coverage, threat models.

## Conclusions favored
"Risk R mitigated by control C; residual quantified and accepted."
````

### 12.12 Skills de fase

Las diez fases comparten el mismo esqueleto. Se incluyen completas. Todas leen su entrada de
`phase_policy` en `case.md` y escriben su artefacto desde `templates/phase-artifact.md`.

#### 12.12.1 `.claude/skills/sm-phase-observation/SKILL.md`

````markdown
---
name: sm-phase-observation
description: >
  Scientific-method phase 01 (Observation) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Captures the observable state and symptoms without interpretation, adapting to
  the active profile via case.md phase_policy.observation. Produces maintenance-cases/<case-id>/01-observation.md.
---

# Phase 01 — Observation

Generic, profile-parameterized. Reads policy; never decides order; never consolidates.

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (profile + phase_policy.observation)
- The user request; access to code, logs, metrics, tests, issues.

## Procedure
1. Read case.md → `phase_policy.observation` (focus, reasoning_effort, evidence, acceptance, risk_controls).
2. Collect observable facts in line with `focus` and gather every required `evidence` item.
3. Record facts only — no causes, no fixes. Date and source each fact.
4. Delimit scope.

## Output
Write `maintenance-cases/<case-id>/01-observation.md` from templates/phase-artifact.md with:
- Applied policy (echo), Observed facts, Context, Scope, "Not interpreted" note.

## Acceptance
Meets `acceptance`: facts verifiable and dated; no assumed cause; scope bounded.

<constraints>No interpretation or proposed fixes. No phase ordering decisions.</constraints>
````

#### 12.12.2 `.claude/skills/sm-phase-problem-definition/SKILL.md`

````markdown
---
name: sm-phase-problem-definition
description: >
  Scientific-method phase 02 (Problem Definition) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Turns observations into a precise, bounded, falsifiable problem statement,
  adapting via case.md phase_policy.problem-definition. Produces 02-problem-definition.md.
---

# Phase 02 — Problem Definition

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.problem-definition); 01-observation.md.

## Procedure
1. Read the policy entry.
2. Convert observations into ONE precise problem statement aligned with `focus`.
3. Define the explicit "solved" criterion, limits, impact and severity.

## Output
Write `02-problem-definition.md`: Applied policy, Problem statement, Solved criterion, Limits, Severity.

## Acceptance
Falsifiable and measurable statement; explicit success criterion; single problem.

<constraints>Do not formulate hypotheses or solutions here.</constraints>
````

#### 12.12.3 `.claude/skills/sm-phase-research/SKILL.md`

````markdown
---
name: sm-phase-research
description: >
  Scientific-method phase 03 (Research) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Gathers relevant prior knowledge (code, docs, history, literature) and recalls the
  knowledge base by tags. Adapts via case.md phase_policy.research. Produces 03-research.md.
---

# Phase 03 — Research

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.research); 02-problem-definition.md; the knowledge base (.claude/memory/ via
  MEMORY.md). See ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. **Recall protocol:** derive `component`/`defect-class` from 02-problem-definition.md and take
   `profile` from case.md; query MEMORY.md by those tags; open and cite matching lessons as prior art.
   Recall is a procedure, not a guarantee a lesson exists.
3. Gather knowledge focused by `focus`: related code (file:line), docs, recent commits.
4. Cite every source so it is locatable. Collect required `evidence`.

## Output
Write `03-research.md`: Applied policy, Recalled lessons (with links), Findings (with sources),
Related code, Constraints.

## Acceptance
Sources cited and locatable; recall executed by the relevant tags; coverage of the affected area
sufficient.

<constraints>Gather knowledge and recall lessons; do not propose hypotheses yet.</constraints>
````

#### 12.12.4 `.claude/skills/sm-phase-hypothesis/SKILL.md`

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

## Inputs
- case.md (phase_policy.hypothesis); 02 and 03.

## Procedure
1. Read the policy entry.
2. Formulate one or more falsifiable hypotheses aligned with `focus`.
3. For each, state an observable prediction and a refutation criterion. Prioritize.

## Output
Write `04-hypothesis.md`: Applied policy, Prioritized hypotheses, Prediction, Refutation criterion.

## Acceptance
Each hypothesis falsifiable with observable prediction; prioritization justified.

<constraints>Do not design or run experiments here.</constraints>
````

#### 12.12.5 `.claude/skills/sm-phase-experiment-design/SKILL.md`

````markdown
---
name: sm-phase-experiment-design
description: >
  Scientific-method phase 05 (Experiment Design) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Designs the minimal-risk experiment to confirm/refute the hypothesis, adapting via
  case.md phase_policy.experiment-design. Produces 05-experiment-design.md.
---

# Phase 05 — Experiment Design

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.experiment-design); 04-hypothesis.md.

## Procedure
1. Read the policy entry; honor `risk_controls` (e.g. sandbox, feature_flag, rollback).
2. Design a reproducible procedure: variables, controls, success/failure criteria.
3. Define an explicit rollback. Keep cost bounded by `reasoning_effort`.

## Output
Write `05-experiment-design.md`: Applied policy, Procedure, Variables, Controls, Success/Failure,
Rollback.

## Acceptance
Reproducible; controls defined; rollback explicit; cost bounded.

<constraints>Design only; do not execute.</constraints>
````

#### 12.12.6 `.claude/skills/sm-phase-experiment-execution/SKILL.md`

````markdown
---
name: sm-phase-experiment-execution
description: >
  Scientific-method phase 06 (Experiment Execution) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Executes the designed experiment without deviating from protocol, adapting via
  case.md phase_policy.experiment-execution. Produces 06-experiment-execution.md.
---

# Phase 06 — Experiment Execution

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.experiment-execution); 05-experiment-design.md.

## Procedure
1. Read the policy entry and the design.
2. Execute exactly as designed under the required `risk_controls`. Record environment.
3. Log commands, applied changes, raw output, and any deviation (with reason).

## Output
Write `06-experiment-execution.md`: Applied policy, Commands, Changes, Deviations, Raw logs.

## Acceptance
Followed the design; deviations documented; environment recorded; reversible.

<constraints>Do not interpret results here; capture them.</constraints>
````

#### 12.12.7 `.claude/skills/sm-phase-data-collection/SKILL.md`

````markdown
---
name: sm-phase-data-collection
description: >
  Scientific-method phase 07 (Data Collection) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Captures execution data in structured form, adapting via case.md
  phase_policy.data-collection. Produces 07-data-collection.md.
---

# Phase 07 — Data Collection

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.data-collection); 06-experiment-execution.md.

## Procedure
1. Read the policy entry; the `evidence` field defines mandatory data.
2. Normalize results: metrics, test outcomes, before/after, units and conditions.
3. Never edit raw results; record them faithfully.

## Output
Write `07-data-collection.md`: Applied policy, Normalized data, Metrics, Before/after.

## Acceptance
Data traceable to execution; units and conditions recorded; raw results unedited.

<constraints>Collect and normalize; do not draw conclusions.</constraints>
````

#### 12.12.8 `.claude/skills/sm-phase-analysis/SKILL.md`

````markdown
---
name: sm-phase-analysis
description: >
  Scientific-method phase 08 (Analysis) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Interprets data against the hypothesis and success criterion, adapting via case.md
  phase_policy.analysis. Produces 08-analysis.md.
---

# Phase 08 — Analysis

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.analysis); 04-hypothesis.md; 07-data-collection.md.

## Procedure
1. Read the policy entry.
2. Compare data to each hypothesis and to the phase-02 criterion.
3. State confirmed/refuted, effect magnitude, threats to validity, side effects. Consider alternatives.

## Output
Write `08-analysis.md`: Applied policy, Verdict on hypotheses, Magnitude, Threats to validity, Side effects.

## Acceptance
Conclusion supported by data; alternatives considered; limits declared.

<constraints>Analyze; the case decision belongs to phase 09.</constraints>
````

#### 12.12.9 `.claude/skills/sm-phase-conclusion/SKILL.md`

````markdown
---
name: sm-phase-conclusion
description: >
  Scientific-method phase 09 (Conclusion) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Decides the case outcome and resulting action, and distills a lesson into the
  knowledge base. Adapts via case.md phase_policy.conclusion. Produces 09-conclusion.md.
---

# Phase 09 — Conclusion

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

## Inputs
- case.md (phase_policy.conclusion); 02-problem-definition.md; 08-analysis.md.
- Knowledge-base schema: ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. Contrast the analysis with the phase-02 success criterion.
3. Decide: apply / revert / escalate. Record residuals, debt, follow-ups.
4. **Distill one lesson** (the non-derivable learning, not a case summary) into a new file under
   .claude/memory/ with tags `component`/`defect-class`/`profile`; add one line to MEMORY.md.

## Output
- Write `09-conclusion.md`: Applied policy, Verdict, Decision, Residuals/Debt, Follow-up, Lesson link.
- Write the lesson file in .claude/memory/ and index it in MEMORY.md.

## Acceptance
Verdict coherent with the analysis; phase-02 criterion checked; actions actionable; lesson written with
tags that enable phase-03 recall.

<constraints>Decide and record the lesson; produce the human communication in phase 10. Do not write the
changelog or any case ledger (both are derived).</constraints>
````

#### 12.12.10 `.claude/skills/sm-phase-communication/SKILL.md`

````markdown
---
name: sm-phase-communication
description: >
  Scientific-method phase 10 (Communication) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Produces the final human-facing communication (PR, changelog, report, commit
  draft) adapting via case.md phase_policy.communication. Produces 10-communication.md.
---

# Phase 10 — Communication

<user_communication>Spanish for user interaction AND for the produced PR/commit drafts (repo policy).
See ../artifact-structuring/SKILL.md §language_policy and the conventional-commits skill.</user_communication>

## Inputs
- case.md (phase_policy.communication); the full 01→09 chain.

## Procedure
1. Read the policy entry.
2. Summarize for the target audience: what changed, why, evidence, risks, links to artifacts.
3. Draft the commit/PR message in Spanish following the repo's conventional-commits skill, ending with
   the trailer `Case: <case-id>` (see ../sm-orchestrator/references/changelog.md).

## Output
Write `10-communication.md`: Applied policy, Executive summary, Changes, Evidence (links), Risks,
Commit/PR draft (Spanish, with `Case:` trailer).

## Acceptance
Self-contained; links evidence; correct audience; no unsupported claims; commit draft carries the
`Case:` trailer.

<constraints>Communicate; do not introduce new changes or conclusions. Run the changelog generator with the
pending entry (`--pending "<subject>" --case <id>`) and include CHANGELOG.md in the commit. Never
hand-write changelog entries.</constraints>
````

### 12.13 Memoria — base de conocimiento (patrón MEMORY.md) y registro derivado

El antiguo `memory/maintenance-ledger.md` plano **desaparece**. La memoria se materializa en dos cosas:

**(a) Ejemplo de archivo de lección — `.claude/memory/connection-pool-timeout-regressions.md`**

````markdown
---
name: connection-pool-timeout-regressions
description: A recent change to the connection-pool timeout caused intermittent 500s under load.
tags:
  component: auth
  defect-class: connection-pool
  profile: corrective
---

When login returns intermittent 500s under load, suspect a recently changed connection-pool timeout
before anything else: an undersized timeout exhausts the pool and surfaces as latency spikes, not as a
connection error. How to apply: grep recent commits touching the pool config (`git log -p -- session.ts`),
add a load test to CI so the regression cannot recur silently.
Related case: maintenance-cases/20260606-login-timeout/case.md
````

Y su línea en el índice `.claude/memory/MEMORY.md`:

````markdown
- [connection-pool timeouts](connection-pool-timeout-regressions.md) — auth/connection-pool · corrective
````

**(b) Registro de casos derivado (sin archivo manual).**
No hay un archivo de registro: el índice de casos se **deriva** del filesystem y del changelog (§9.2).
Por ejemplo, para listar casos correctivos cerrados:

````bash
# id, perfil y veredicto desde los manifests (derivado del filesystem)
for f in maintenance-cases/*/case.md; do
  grep -E '^(case_id|profile|verdict):' "$f"
done
# o, partiendo del changelog, saltar de una entrada a su expediente vía el trailer Case:
git log --grep '^Case: ' --pretty='%s %(trailers:key=Case,valueonly)'
````

### 12.14 Generador on-demand — `CHANGELOG.md` (changelog derivado)

Esbozo del generador idempotente que la fase 10 ejecuta para actualizar `CHANGELOG.md`. No hace commit
ni `--amend`; solo escribe el archivo. La fase 10 lo invoca con `--pending`/`--case` y luego incluye
`CHANGELOG.md` en su commit normal como cualquier otro archivo modificado.

````bash
#!/usr/bin/env bash
# scripts/generate-changelog — regenerate CHANGELOG.md from conventional commits (Keep a Changelog).
# Derived state: never hand-edit CHANGELOG.md. Single source of truth = git history.
#
# Usage:
#   generate-changelog                          # rebuild full file from all commits
#   generate-changelog --pending "msg" --case X # prepend pending entry (called from phase 10)
#
# Does NOT commit or amend. The caller (phase 10) stages and commits CHANGELOG.md.
set -euo pipefail

PENDING_SUBJECT=""
PENDING_CASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pending) PENDING_SUBJECT="$2"; shift 2;;
    --case)    PENDING_CASE="$2";    shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

OUT="CHANGELOG.md"
map_type() { case "$1" in
  feat) echo "Added";; fix) echo "Fixed";; perf|refactor) echo "Changed";;
  docs) echo "Documentation";; *) echo "";; esac; }

# Determine tag boundaries for release sections
latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || true)

emit_section() {
  local section="$1"; local range="$2"
  local body=""
  while IFS=$'\t' read -r subject case_id; do
    local type="${subject%%:*}"; type="${type%%(*}"
    local desc="${subject#*: }"
    [ "$(map_type "$type")" = "$section" ] || continue
    local line="- ${desc}"; [ -n "$case_id" ] && line="${line} (Case: ${case_id})"
    body="${body}${line}"$'\n'
  done < <(git log ${range:+$range} --pretty=$'%s\t%(trailers:key=Case,valueonly)')
  [ -n "$body" ] && { echo "### ${section}"; printf '%s\n' "$body"; }
}

{
  echo "# Changelog"
  echo
  echo "All notable changes are derived from conventional commits. Do not edit by hand."
  echo

  # Unreleased section (optionally prepend the pending entry not yet committed)
  echo "## [Unreleased]"
  if [ -n "$PENDING_SUBJECT" ]; then
    ptype="${PENDING_SUBJECT%%:*}"; ptype="${ptype%%(*}"
    pdesc="${PENDING_SUBJECT#*: }"
    psect="$(map_type "$ptype")"
    if [ -n "$psect" ]; then
      pline="- ${pdesc}"; [ -n "$PENDING_CASE" ] && pline="${pline} (Case: ${PENDING_CASE})"
      echo "### ${psect}"; echo "$pline"; echo
    fi
  fi
  unreleased_range="${latest_tag:+${latest_tag}..HEAD}"
  for section in Added Changed Fixed Documentation; do
    emit_section "$section" "$unreleased_range"
  done

  # Release sections (one per tag, newest first)
  if [ -n "$latest_tag" ]; then
    git tag --sort=-version:refname | while read -r tag; do
      prev=$(git describe --tags --abbrev=0 "${tag}^" 2>/dev/null || true)
      range="${prev:+${prev}..}${tag}"
      date=$(git log -1 --format=%as "$tag")
      echo "## [${tag#v}] — ${date}"
      for section in Added Changed Fixed Documentation; do
        emit_section "$section" "$range"
      done
    done
  fi
} > "$OUT"
````

> Esbozo de referencia. En producción conviene endurecer el parseo del tipo de commit y los trailers
> multi-línea. El rendimiento es O(n) en el número de commits, lo que no es un problema dado que el
> generador se ejecuta raramente (on-demand desde la fase 10, no en cada commit).

### 12.15 Ejemplo de `CHANGELOG.md` (derivado)

````markdown
# Changelog

All notable changes are derived from conventional commits. Do not edit by hand.

## [Unreleased]
### Added
- adaptar pagos a la API v2 detrás de feature flag (Case: 20260607-payments-api-v2)

### Changed
- batching de queries para reducir p95 en reporting (Case: 20260608-reports-latency)

### Fixed
- corregir timeout del pool de conexiones en login (Case: 20260606-login-timeout)
- añadir error boundary para errores no manejados en el gateway (Case: 20260609-gateway-error-boundary)
````

### 12.16 Hook de Claude Code opcional (descrito) — `.claude/hooks/sm-validate-artifact.md`

````markdown
# Claude Code hook (optional, NOT installed) — sm-validate-artifact

Purpose: validate phase-artifact frontmatter on write. This is a Claude Code hook (session event),
distinct from the on-demand changelog generator (invoked by phase 10). See §9.4.

- Event: PostToolUse on Write/Edit targeting `maintenance-cases/**`.
- Action: assert frontmatter has case_id, profile, phase (NN-name), version, status; block on failure.
- Rationale: keep the audit chain consistent without manual checks.

Until installed, sm-orchestrator performs this validation as an explicit step. Installation is a user
decision (see project CLAUDE.md §6).
````

---

> **Cierre.** Esta especificación está lista para implementarse: define las 14 skills (`sm-orchestrator`
> + 4 perfiles + 10 fases), el contrato de composición (`phase-policy schema`), los expedientes
> versionables (`maintenance-cases/<case-id>/`), la memoria en dos niveles (base de conocimiento con
> patrón de índice `MEMORY.md` + registro de casos **derivado**; recall explícito en fase 03), el
> changelog **derivado** por **generador on-demand** (ejecutado por la fase 10, sin git hook, sin
> `--amend`) con trazabilidad bidireccional vía el trailer `Case:`, el bloque YAML canónico en `case.md`
> como única fuente de estado machine-readable, los dos modos de salida (Full / Consolidado), las dependencias
> externas explícitas (§4.4), y los límites del runtime documentados (§3.6), sin sub-agents y sin
> duplicación de lógica. Rige el principio **estado derivado sobre estado duplicado** (§2.5.1). La
> evolución futura (nuevos perfiles, nuevas fases, o aislar una fase en un sub-agent) no requiere romper
> el contrato perfil↔fase.
