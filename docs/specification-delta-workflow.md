# Workflow specification-delta

> Documentación canónica del ecosistema de skills `*-specification-delta`: una
> capa de customización sobre el motor de OpenSpec **1.4.1** (la versión fijada por
> `^1.4.1` en `package.json`) que convierte su workflow nativo en un pipeline único,
> secuencial, mandatorio y orquestado. Describe el diseño e implementación vigentes;
> la sección [Contrato CLI](#contrato-cli) es la referencia consumida en runtime por
> las skills (verificada una sola vez contra 1.4.1) y se preserva como sección
> autónoma anclada.

## Tabla de contenidos

- [Terminología](#terminología)
- [Modelo de artefactos](#modelo-de-artefactos)
- [Pipeline de 10 etapas](#pipeline-de-10-etapas)
- [La regla de delegación](#la-regla-de-delegación)
- [Los dos modos: AUTO y GUIDED](#los-dos-modos-auto-y-guided)
- [Orquestación](#orquestación)
- [La capa de roadmap](#la-capa-de-roadmap)
- [Customización de schema](#customización-de-schema)
- [Contrato CLI](#contrato-cli)
- [Workspaces, migración y troubleshooting](#workspaces-migración-y-troubleshooting)
  - [Configuración de entorno recomendada](#configuración-de-entorno-recomendada)
- [Mantenimiento y limitaciones](#mantenimiento-y-limitaciones)

---

## Terminología

OpenSpec llama **change** a su unidad de trabajo: el directorio
`openspec/changes/<name>/`, el flag `--change`, el archivo de metadatos
`.openspec.yaml`. En las skills y la documentación de diseño esa misma realidad
física en disco se nombra **specification-delta**, un concepto de más alto nivel que
modela explícitamente lo que produce el workflow iterativo-incremental: un delta
sobre la especificación del sistema (requisitos ADDED / MODIFIED / REMOVED /
RENAMED). Ambos nombres designan lo mismo; en las skills y la documentación se usa
`specification-delta`, y solo en instrucciones o ejemplos que invocan OpenSpec
directamente se usa el nombre canónico `change`.

**Identificador numérico incremental.** Cada change se nombra con la forma
`c<NNNNN>-<slug>` (p. ej. `c00001-add-auth`, `c00010-export-csv`): un prefijo
identificador `c` + un entero incremental con relleno de ceros a cinco dígitos,
seguido del slug kebab-case descriptivo. El prefijo `c` debe ir en **minúscula** y
es **obligatorio**: OpenSpec valida que el nombre del change empiece por letra
minúscula (`^[a-z]...`) y rechaza tanto los nombres que empiezan por dígito como las
mayúsculas. El relleno a cinco dígitos da margen amplio (hasta `c99999`) antes de
ampliar el ancho, y garantiza que el orden lexicográfico (con que ordenan
`openspec list` y el filesystem) coincida con el orden numérico de creación. El
número se **deriva por escaneo stateless** en el momento de crear el change (etapa
`create`): la fuente canónica es `npm run openspec:next-change-id` (implementación en
`scripting/openspec/change-id.ts`), que inspecciona los changes activos en
`openspec/changes/`, los archivados en `openspec/changes/archive/` y las fases L2 bajo
`archive/*/phases/` (descontando el prefijo de fecha `YYYY-MM-DD--` del archivado), toma el máximo entero existente y suma uno.
El inventario archivado (raíz y fases) comparte una secuencia global `c00001`… ordenada
por fecha de directorio y slug alfabético. La etapa `verify` ejecuta `npm run openspec:verify-change-id`
como gate CRITICAL ante colisiones del mismo `c<NNNNN>`. No requiere contador
persistente. La convención aplica a **todos** los changes,
incluidos el L1 orquestador y los L2 de fase del roadmap, donde el `phaseid`
permanece dentro del slug: `c<NNNNN>-<prefix>-<phaseid>-<slug>`.

**Roadmap.** Cuando varios specification-deltas se encadenan en una entrega mayor
—una migración por fases, un conjunto grande de cambios con dependencias internas—
ese nivel superior se denomina **roadmap**. Un roadmap coordina muchos
specification-deltas; el specification-delta es la unidad atómica. Esta distinción de
altitud se materializa en dos orquestadores: uno por delta
([Orquestación](#orquestación)) y otro por roadmap
([La capa de roadmap](#la-capa-de-roadmap)).

---

## Modelo de artefactos

OpenSpec es un sistema de workflow spec-driven construido sobre dos directorios
durables:

- `openspec/specs/`: fuente de verdad del comportamiento actual y acordado del
  sistema.
- `openspec/changes/`: una carpeta por change, con los artefactos de planificación y
  los delta specs.

El modelo es brownfield-first: el modelo de deltas describe cambios sobre un sistema
existente. Resuelve el estado desde el filesystem vía `openspec status`, nunca de
memoria.

Una carpeta de change bajo `openspec/changes/<change-name>/` (schema
`sequential-spec-driven-design`) se organiza como:

- `proposal.md` — en la raíz de la carpeta del change.
- `specs/` — subdirectorio con uno o más delta specs.
- `design.md` — en la raíz de la carpeta del change.
- `tasks.md` — en la raíz de la carpeta del change.

**El DAG es lineal:** `proposal → specs → design → tasks`. En el schema activo
`design` requiere `[proposal, specs]` y `tasks` requiere `[proposal, specs, design]`
(el diamante nativo, donde `specs` y `design` eran ramas paralelas que solo dependían
de `proposal`, se elimina). La justificación: el diseño (HOW) debe redactarse contra
specs (WHAT) ya cerradas, para que los artefactos sean coherentes entre sí; la propia
instrucción de `design` pide referenciar las specs, supuesto que el grafo nativo no
garantizaba. Como en este workflow ninguna etapa es opcional, el único motivo del
paralelismo nativo (permitir que `design` fuera opcional) desaparece y la
linealización no cuesta nada.

### Qué debe contener cada artefacto

#### `proposal.md` — responde «¿Por qué hacemos esto?»

Debe contener: el nombre/identificador del change; el problema que se resuelve; el
resultado deseado y el valor esperado; los límites de alcance (in/out of scope); el
impacto de alto nivel sobre el sistema, los usuarios o el workflow; supuestos,
restricciones y preguntas abiertas; una descripción concisa del enfoque si ayuda al
encuadre.

No debe contener: detalles de implementación paso a paso; checklists de tareas;
decisiones de arquitectura detalladas; deltas de requisitos en formato spec; bloques
grandes de código.

La sección **Capabilities** es el contrato entre `proposal` y `specs`: cada
capacidad listada se convierte en un `specs/<name>/spec.md`. Investiga las specs
existentes en `openspec/specs/` antes de rellenarla.

#### `specs/` — responde «¿Qué debe ser cierto tras el cambio?»

Es la capa de contrato: deltas normativos de requisitos. Debe contener: uno o más
archivos de spec agrupados por capacidad/concern; sentencias de requisito como deltas
contra el comportamiento existente, bajo secciones `## ADDED`, `## MODIFIED`,
`## REMOVED`, `## RENAMED`; sentencias precisas y testeables (SHALL/MUST); escenarios
en forma Given/When/Then.

Reglas de las secciones delta (de la instrucción del schema):

- **ADDED**: requisitos nuevos.
- **MODIFIED**: comportamiento cambiado — DEBE incluir el bloque de requisito
  completo y actualizado (copiar el bloque entero desde `### Requirement:` a través de
  todos los escenarios; el contenido parcial pierde detalle al archivar).
- **REMOVED**: features deprecadas — DEBE incluir `**Reason**` y `**Migration**`. Aquí
  se declara a priori el **legacy a retirar** (primer eslabón del threading de
  remediación define → design → plan → apply).
- **RENAMED**: solo cambios de nombre — formato `FROM:`/`TO:`.

Formato: cada requisito es `### Requirement: <name>`; cada escenario es
`#### Scenario: <name>` con **exactamente 4 almohadillas** (3 almohadillas o viñetas
fallan silenciosamente); todo requisito DEBE tener al menos un escenario.

Comportamiento al archivar: ADDED se fusiona en las main specs, MODIFIED reemplaza el
comportamiento existente, REMOVED se elimina de las main specs.

No debe contener: motivación/narrativa; estrategia de implementación; desglose de
tareas; diseño de bajo nivel.

#### `design.md` — responde «¿Cómo deberíamos implementarlo?»

Debe contener: decisiones de arquitectura y trade-offs; fronteras de componentes y
puntos de integración; flujo de datos/control y decisiones de dependencias; archivos,
módulos o subsistemas afectados; alternativas no triviales consideradas y por qué se
rechazan; restricciones de implementación; la **estrategia de migración/retiro** de
lo que `specs` declaró REMOVED (segundo eslabón del threading de remediación). El DAG
lineal garantiza que `design` se escribe contra `specs` ya cerradas.

No debe contener: la lista completa de tareas; lenguaje puro de requisitos (pertenece
a `specs/`); la justificación del cambio (pertenece a `proposal.md`).

#### `tasks.md` — responde «¿Qué haremos exactamente y en qué orden?»

Debe contener: un checklist secuenciado de pasos pequeños y verificables; referencias
a los archivos/módulos/tests tocados; pasos de validación; checkboxes que reflejen el
progreso real; las **tasks de limpieza** que ejecutarán el retiro de legacy diseñado
(tercer eslabón del threading de remediación). Cada task es `- [ ] X.Y descripción`
agrupada bajo `## encabezados numerados`; la fase de apply parsea el formato
`- [ ]` para rastrear el progreso.

**Formato enriquecido (contrato canónico).** Sobre la base obligatoria (`## N.`
numerados + `- [ ] X.Y descripción`) el schema admite una **gramática inline opcional y
degradable** tras la descripción: `~<estado>` (`~todo` | `~doing`; solo 3 estados —
`review` vive a nivel de change/`verify`) y `@<responsable>`. Regla decisiva: **el
checkbox es la verdad para *done*** — `[x]` ⇒ done sin necesidad de `~done`, y un
`~doing` junto a un `[x]` es obsoleto y se ignora. Los tags van **después** del
checkbox+descripción, así que `task-progress` (el único módulo del CLI que lee
`tasks.md`, con el regex `^[-*]\s+\[[\sx]\]`) no se ve afectado: el conteo de
checkboxes es idéntico con o sin tags.

**Co-propiedad con la extensión Workbench.** `tasks.md` es co-poseído: además del
pipeline (`plan` lo genera, `apply` marca `[x]` **in place**, `verify` cuenta
checkboxes), la extensión *EvolutiveX Workbench* co-lee y co-edita el archivo desde su
tablero de Tasks. Ambos respetan el mismo contrato: encabezados `## N.` numerados,
identificadores `X.Y` estables y marcado in place (nunca reorganizar en columnas de
pipeline). Por eso `apply` debe **preservar los tags inline** al marcar `[x]`, y la
extensión serializa in place sin tocar la estructura numerada. El formato enriquecido
**no requiere modificar el CLI** (es permisivo): vive en este schema y en las skills.

> **Sincronización del contrato.** Este contrato es **espejo** de `docs/10-migracion-tareas-y-gui.md`
> del *EvolutiveX Workbench* (su fuente autocontenida). Cualquier cambio del formato canónico debe
> aplicarse en **ambos** sitios para mantenerlos sincronizados.

No debe contener: justificación amplia de diseño; prosa de requisitos; justificación
de negocio; tasks demasiado gruesas para verificar.

### Frontera de entrada al pipeline

No todo cambio entra al pipeline de specification-delta. La frontera es:

- **Cambio canon-afectante o fase de roadmap → pipeline.** Si el cambio toca el
  comportamiento acordado en `openspec/specs/` (añade, modifica o retira un requisito
  existente), o es una **fase de un roadmap** (`orchestrate-roadmap`, donde cada fase es
  un L2 specification-delta), corre por el pipeline completo. Esta es la clase
  **conductual**.
- **Cambio no canónico standalone → commit plano / `create-plan`.** Un cambio que no
  toca el canon y no es una fase de roadmap —retiros de código muerto o adiciones de
  tooling/tests/CI por sí solos— **no necesita** el pipeline: resuélvelo con un commit
  plano o, si requiere planificación, con `create-plan`. Solo entra al pipeline como
  delta **no canónico** cuando ya forma parte de una fase o de un delta en curso.
- **Delta mixto → conductual.** Cuando un mismo delta toca el canon **y** además trae
  trabajo sin contraparte canónica, se clasifica como **conductual**: las tareas no
  canónicas viven en `tasks.md`/Impact sin artefacto especial (sin subsección
  `### Non-canonical change` ni registro `## Non-canonical record`). Declarar ambas
  subsecciones a la vez sigue siendo `invalid`; la clase no canónica se reserva para
  deltas que **no** tocan el canon en absoluto (retiros o adiciones puros).

---

## Pipeline de 10 etapas

### Principios de diseño

El workflow desacopla dos ejes que OpenSpec acopló: **qué etapas existen**
(composición) y **cuánta autonomía tiene la ejecución** (modo). De ahí, cuatro
principios:

1. **Un solo pipeline, idéntico para ambos modos.** Las etapas no cambian entre un
   flujo y otro; cambia solo cómo se ejecutan.
2. **Cero etapas opcionales.** `verify` y `synchronize` son obligatorias siempre, en
   ambos modos.
3. **Skills de etapa autocontenidas, responsabilidad única a nivel de *concern*.** La
   responsabilidad única se define por *concern* (estado canónico, freeze del delta),
   no por operación atómica: una etapa puede comprender varias tareas atómicas cuando
   la integridad referencial o documental lo exige (p. ej. `synchronize` actualiza
   specs **y** docs del repo; `archive` mueve **y** commitea). Lo que se prohíbe es
   que una etapa embeba a *otra etapa*: `archive` no hace el spec-sync (etapa 9) y
   `synchronize` no archiva.
4. **Un orquestador por encima.** El usuario interactúa solo con el orquestador, que
   conoce todas las skills de etapa, decide el modo y, si el modo no está claro, lo
   pregunta.

### Las diez skills de etapa

Nomenclatura consistente: verbo + `-specification-delta`. Cada skill tiene una
responsabilidad única.

| # | Skill | Entrada → Salida | Muta estado |
|---|---|---|---|
| 1 | `explore-specification-delta` | descripción del problema → hallazgos en chat | No (solo lectura) |
| 2 | `create-specification-delta` | slug + schema → nombre `c<NNNNN>-<slug>` + carpeta + `.openspec.yaml` | Sí |
| 3 | `propose-specification-delta` | el delta → `proposal.md` (WHY) | Sí |
| 4 | `define-specification-delta` | el delta → `specs/**/*.md` (WHAT) | Sí |
| 5 | `design-specification-delta` | el delta → `design.md` (HOW) | Sí |
| 6 | `plan-specification-delta` | el delta → `tasks.md` (breakdown) | Sí |
| 7 | `apply-specification-delta` | `tasks.md` → código + tasks marcadas | Sí |
| 8 | `verify-specification-delta` | artefactos + código → reporte (4C + sync doc + legacy eliminado + tests, todo CRITICAL) | No (solo lectura) |
| 9 | `synchronize-specification-delta` | delta specs + `README`/`docs` → estado canónico sincronizado | Sí |
| 10 | `archive-specification-delta` | delta verificado y sincronizado → movido a `archive/` + commit + worktree limpio (freeze) | Sí |

Notas de nomenclatura:

- `create-` se usa en lugar de `new-` para que todos los nombres sean verbos
  (consistencia gramatical). La skill `create-specification-delta` invoca el script
  `npm run openspec:create-specification-delta`.
- `define-specification-delta` es el nombre más literalmente exacto: esa skill escribe
  el delta de especificación propiamente dicho.
- El identificador numérico incremental se materializa **solo** en `create`: el script
  deriva `c<NNNNN>` vía `openspec:next-change-id`, compone `c<NNNNN>-<slug>` y scaffold
  la carpeta. Las demás etapas operan sobre el nombre completo vía `--change`.

### Contratos de composición

Dos etapas no son autocontenidas, por diseño, y siguen el
`<sub_invocation_protocol>` de `artifact-structuring`:

- `explore-specification-delta` sub-invoca la skill `investigate` para la
  investigación estructurada; no reimplementa esa lógica.
- `apply-specification-delta` sub-invoca `create-plan` antes de implementar. Tras editar
  `tasks.md` debe ejecutar `npm run openspec:sync-tasks-meta -- --slug <change>` para
  mantener `.tasks-meta.yaml` alineado cuando la extensión no está activa.

Las otras ocho etapas son autocontenidas.

### Contrato ISO en timestamps

`created` y `updated` en `.openspec.yaml` y en `.tasks-meta.yaml` SHALL ser ISO 8601 completo. El scaffold (`create-specification-delta`) y las mutaciones del store son el único camino de escritura. El scanner **no** infiere fechas desde git ni acepta `YYYY-MM-DD` en lectura: datos inválidos → `—` en Dashboard. Ver `docs/04-persistencia-y-stores.md` §4.

### Remediación de legacy distribuida

El retiro del código/doc reemplazado no es una faceta especial de `apply`. Se
**declara a priori** y se ejecuta a lo largo del threading:

- `define` declara el legacy a retirar como requisitos REMOVED (con `Reason`/
  `Migration`) — primer eslabón.
- `design` diseña la estrategia de migración/retiro — segundo eslabón.
- `plan` incluye las tasks de limpieza — tercer eslabón.
- `apply` solo **ejecuta** esas tasks ya planificadas; no inventa la limpieza por su
  cuenta — cuarto eslabón.
- `verify` solo **detecta** que el residuo desapareció (su comprobación de reducción
  de legacy); no remedia.

La remediación vive aguas arriba; las etapas de cierre solo detectan.

### Las skills distintivas: verify, synchronize y archive

- **`verify-specification-delta`** es de solo lectura. Produce un reporte en cuatro
  dimensiones (Completeness / Correctness / Coherence / Consistency) evaluadas sobre
  **todos los cambios aplicados** (el diff completo), con hallazgos clasificados
  CRITICAL / WARNING / SUGGESTION, más dos comprobaciones adicionales a nivel de
  delta: **sync documental** (la documentación afectada refleja el estado real tras el
  cambio) y **reducción de legacy** (el código o doc reemplazado se eliminó o quedó
  deprecado). Además ejecuta la **suite de tests** del repo como condición
  **CRITICAL** del gate: delega en el framework de tests automatizado que esté
  instalado y configurado en el repo (cualquiera, sin acoplarse a uno concreto)
  ejecutando su script `test`; si no hay framework configurado recurre a un análisis
  de completitud, correctitud, coherencia y consistencia; en ambos casos un fallo
  detiene el pipeline igual que cualquier hallazgo 4C. No muta nada. Es el gate previo
  a sincronizar y archivar. Bajo presión de contexto **medida**, puede delegar sus
  comprobaciones fan-out a un sub-agente read-only (que devuelve solo hallazgos
  estructurados —issue + severidad + `file:line`—, nunca aplica cambios); nunca es un
  default preventivo.
- **`synchronize-specification-delta`** sincroniza el **estado canónico**: su
  *concern* abarca fusionar los delta specs en `openspec/specs/` **y** actualizar la
  documentación del repo (`README.md`, `docs/`) para que refleje el estado real tras
  el cambio. Es una sola responsabilidad (mantener el estado canónico coherente) que
  comprende ambas tareas por integridad documental; no archiva.
- **`archive-specification-delta`** **freeza** el spec-delta: su *concern* comprende
  mover el delta a `archive/`, emitir el commit conventional y dejar el worktree
  limpio. A diferencia del `archive` nativo, **no** invoca el spec-sync: la
  sincronización ya ocurrió como etapa obligatoria independiente (paso 9). El commit y
  el worktree limpio son parte de freezar el delta, no etapas embebidas.

---

## La regla de delegación

Descomponer la escritura de artefactos en cuatro skills nombradas (en lugar de una
skill genérica) es una decisión legítima, pero introduce un riesgo: dos fuentes de
verdad para las instrucciones de redacción. Se neutraliza con una regla estricta:

> Cada skill que escribe un artefacto (`propose` / `define` / `design` / `plan`) es un
> **wrapper delgado** que invoca `openspec instructions <su-artefacto> --change <name>
> --json` y sigue lo que devuelve, escribiendo en `resolvedOutputPath`. **Nunca** copia
> la guía de redacción en el cuerpo del `SKILL.md`.

Así, el `schema.yaml` sigue siendo la única fuente de verdad del contenido, y las
cuatro skills aportan responsabilidad única explícita sin duplicación. Si alguna vez
se edita la instrucción de un artefacto, se edita en un solo lugar. El campo obsoleto
`outputPath` (ver [Contrato CLI](#contrato-cli)) se evita por construcción: estas
skills no embeben instrucciones, así que nunca reintroducen el contrato caduco
«write to `outputPath`».

---

## Los dos modos: AUTO y GUIDED

El mismo pipeline de diez etapas, ejecutado a dos niveles de autonomía:

- **AUTO** (automático): para deltas de baja incertidumbre (fix ya identificado,
  cambio localizado, sin decisiones arquitectónicas). El orquestador recorre las
  etapas de corrido, sin pausas, en un único turno. Único corte: una parada admisible
  (CRITICAL en `verify`, gate de completitud en rojo, o cesión legítima por decisión
  irresoluble). El comportamiento de un solo turno no es solo prosa: lo respalda un
  **backstop determinista** (hook `Stop`, `scripting/openspec/enforce-auto-pipeline.mts`)
  que, mientras el centinela `openspec/.workbench/auto-pipeline.json` exista y el change
  no esté archivado, impide el fin de turno y nombra la próxima etapa a invocar. Ver la
  capability `pipeline-auto-continuation`.
- **GUIDED** (semi-automático): para deltas de alta incertidumbre (feature nueva, bug
  sin diagnosticar, decisión arquitectónica). El orquestador recorre **las mismas**
  etapas, pero pausa en checkpoints para revisión humana: tras `explore`, tras
  **cada** artefacto, y tras `verify`.

GUIDED es además el modo de **primera vez**: cuando el usuario es nuevo en el sistema,
el orquestador añade narración didáctica (qué es cada etapa, por qué existe, qué se
está por hacer) sobre el mismo recorrido. No hay un tutorial aparte ni un delta de
práctica desechable: el primerizo aprende trabajando sobre su delta real, con los
checkpoints actuando como puntos de enseñanza.

La diferencia entre modos es una propiedad de orquestación (autonomía + checkpoints),
no de composición. Por eso no son dos workflows distintos: son el mismo workflow a dos
velocidades. `verify` y `synchronize` corren en ambos.

---

## Orquestación

`orchestrate-specification-delta` es el único punto de contacto del usuario; las
skills de etapa nunca se invocan directamente. Sigue el patrón híbrido XML + Markdown
(XML solo para los bloques que necesitan frontera dura: pipeline, selección de modo,
invariantes, plantilla de salida) y un frontmatter mínimo (`name` + `description` +
`when_to_use` + `argument-hint`).

Además de conducir el pipeline, embebe solo el **mínimo operativo de referencia** que
necesita para enrutar (modelo mental + catálogo de etapas). El contrato de la CLI
**no se embebe**: vive en la sección [Contrato CLI](#contrato-cli) de este documento y
el orquestador conserva solo un puntero a ella. Esto mantiene al orquestador centrado
en el control de flujo.

El pipeline se resuelve siempre desde el estado del filesystem, referenciando cada
etapa por su slug exacto:

1. `explore-specification-delta` — encuadrar el problema (read-only)
2. `create-specification-delta` — inicializar el delta (acuña `c<NNNNN>-<slug>`)
3. `propose-specification-delta` — escribir `proposal.md` (WHY)
4. `define-specification-delta` — escribir `specs/**/*.md` (WHAT)
5. `design-specification-delta` — escribir `design.md` (HOW)
6. `plan-specification-delta` — escribir `tasks.md` (breakdown)
7. `apply-specification-delta` — implementar las tasks
8. `verify-specification-delta` — gate; 4C + sync doc + legacy + tests (todo CRITICAL)
9. `synchronize-specification-delta` — sincronizar estado canónico: delta specs + README/docs
10. `archive-specification-delta` — freeze: mover a `archive/` + commit + worktree limpio

La siguiente etapa se resuelve con `openspec status --change "<name>" --json`, no de
memoria. Las etapas 3–6 son los cuatro escritores de artefactos, en ese orden.

### Invariantes

Se sostienen en AMBOS modos, sin excepción:

- Toda etapa corre. `verify` y `synchronize` nunca se saltan.
- El **gate de verify es duro**: si el reporte contiene cualquier hallazgo CRITICAL,
  DETÉN el pipeline y vuelve a `apply-specification-delta`. Nunca ejecutes
  `synchronize` ni `archive` sobre un delta con hallazgos CRITICAL sin resolver —ni
  siquiera en modo AUTO. Una suite de tests en rojo es CRITICAL: bloquea el gate igual
  que cualquier hallazgo 4C.
- El orquestador **delega**; nunca inlinea el trabajo de una etapa. Ninguna etapa
  embebe a otra (`archive` no sincroniza; `synchronize` no archiva). Una etapa sí
  puede agrupar las tareas atómicas que su *concern* exige (el commit + worktree
  limpio pertenecen al *concern* de freeze de `archive`; el sync de README/docs
  pertenece al *concern* de estado canónico de `synchronize`) — no son etapas
  embebidas.
- Las etapas 3–6 no contienen guía de redacción: cada una llama `openspec instructions
  <artifact> --change <name> --json` y sigue lo devuelto. El schema es la única fuente
  de verdad del contenido de los artefactos.

---

## La capa de roadmap

El pipeline de diez etapas y su orquestador operan sobre **un** specification-delta.
Cuando el trabajo es demasiado grande para un solo delta —una migración por fases, un
conjunto de cambios de alto nivel con dependencias internas y riesgo de regresión
entre fases— hace falta una orquestación de **mayor altitud**: una hoja de ruta de
muchos deltas encadenados. Esa es la responsabilidad de `orchestrate-roadmap`. No
tiene equivalente nativo en OpenSpec y su nombre **omite a propósito** el sufijo
`-specification-delta`, porque gobierna muchos deltas, no uno (una excepción consciente
a la convención de nombres).

### Modelo de dos niveles

- **L1 — delta orquestador** (solo gobernanza, sin código en `src/`): posee el
  registro de fases y la Definición de Hecho (DoD) por fase. Nunca toca `src/`.
- **L2 — deltas de fase** (1:1 con cada fase): contienen el trabajo de código real. Se
  crean incrementalmente, en orden de dependencia (no todos por adelantado).

### Frontera de altitud = cableado de delegación

Es la regla que separa ambos orquestadores sin ambigüedad: `orchestrate-roadmap`
conduce **fases**, y cada fase **es** un specification-delta; por eso invoca
`orchestrate-specification-delta` **una vez por fase**, y nunca llama a las skills de
etapa directamente. El roadmap decide *qué fase sigue*; el orquestador de delta decide
*qué etapa sigue dentro de la fase*.

### Diseño del L1

- **Formato del registro de fases** — vive en el `design.md` del L1, una fila por
  fase:

  | Fase | Change hijo | Bloque | Dependencia | Gate de validación | Docs a actualizar | Legacy a retirar | Estado |
  |------|-------------|--------|-------------|--------------------|-------------------|------------------|--------|
  | `<phaseid>` | `<prefix>-<phaseid>-<slug>` | `<bloque>` | `<deps o «ninguna»>` | `<comando/criterio>` | `<lista docs>` | `<lista legacy o «ninguno»>` | `pendiente` |

  Estados: `pendiente` → `en curso` → `validada` → `archivada`. El **DAG de
  dependencias** se codifica en la columna *Dependencia*.

- **Esquema de la Definición de Hecho (DoD)** — vive en los `specs/` de gobernanza del
  L1 (capacidad `<orchestrator-name>-governance`), como requisitos delta ADDED con al
  menos un escenario verificable Given/When/Then. Requisitos normativos típicos: el
  roadmap se divide en fases trazables 1:1 al change set origen; cada fase se
  materializa como un L2 independiente; una fase no está completa sin (a) gate técnico
  pasado —que incluye la **suite de tests en verde como condición CRITICAL** de
  `verify`—, (b) docs afectados actualizados al estado real, (c) legacy de la fase
  reducido; las dependencias del DAG deben estar `archivada`s antes de iniciar una
  fase dependiente; sin código/doc zombi (lo reemplazado se elimina o se deprecia con
  fecha de retiro); **un commit por delta de fase**: cada L2 freeza y commitea su
  propia fase al archivar (etapa 10 de su pipeline), de modo que el historial del
  roadmap tiene un commit conventional por fase.

- **Convención de nombres L2 y back-reference**: `<prefix>-<phaseid>-<slug>`; cada
  `proposal.md` de L2 incluye `Orchestrator: <orchestrator-name> — Phase <phaseid>`.
  La relación padre→hijo se expresa vía registro + back-reference (OpenSpec no tiene
  jerarquía nativa).

- **Invariante de ubicación de los L2**: cada L2 vive en
  `openspec/changes/<l2-name>/` (raíz indexada por la CLI) durante todo su ciclo;
  **no** se anida bajo la carpeta del orquestador durante el loop (rompe
  `openspec list/validate/apply/archive`). El layout anidado es solo una convención
  **post-archivo**, aplicada al cierre del roadmap.

### El gate de fase, repartido

El roadmap valida cada fase antes de archivarla. Las comprobaciones a nivel de delta
(4C, sync documental, reducción de legacy) ya las hace `verify-specification-delta`
como parte del pipeline de cada fase. El roadmap **retiene solo las comprobaciones que
un delta aislado no puede evaluar**, porque leen el registro y la gobernanza del L1:

- **Trazabilidad de fase**: el delta de fase declara su id de fase y una
  back-reference al orquestador, y ese id existe en el registro. Faltante → CRITICAL.
- **Gate de dependencias**: toda fase prerrequisito ya está archivada según el DAG del
  registro. Verificar antes → CRITICAL.
- **Definición de Hecho**: cada requisito de gobernanza del L1 aplicable a la fase
  tiene evidencia. DoD incumplido → CRITICAL.

Así no se duplica lógica: gate de fase = `verify-specification-delta` (por delta) +
estas tres comprobaciones de roadmap. La escalada a sub-agente read-only para
comprobaciones fan-out **no** vive aquí, sino en `verify-specification-delta`, donde
ahora residen esas comprobaciones; las comprobaciones roadmap-scoped son lecturas
baratas del registro/gobernanza del L1 y no justifican delegación.

---

## Customización de schema

Orden de resolución del schema:

1. Flag CLI `--schema <name>`.
2. Metadatos del change `.openspec.yaml`.
3. Config de proyecto `openspec/config.yaml`.
4. Default `spec-driven`.

Este repo fija `sequential-spec-driven-design` en `openspec/config.yaml`; el fork vive
en `openspec/schemas/sequential-spec-driven-design/` y sobrevive a `openspec update`
por la precedencia project-local.

Flujo de customización: forkear un schema built-in con
`openspec schema fork spec-driven <new-name>`; editar
`openspec/schemas/<new-name>/schema.yaml` y las plantillas bajo
`openspec/schemas/<new-name>/templates/`; usar `context`/`rules` en
`openspec/config.yaml`.

Comportamiento de la config: `context` se inyecta en el prompt de cada artefacto
(límite de 50KB); `rules` se inyecta solo para los IDs de artefacto coincidentes (IDs
desconocidos generan warning); el YAML inválido se reporta con números de línea. Las
plantillas son archivos markdown inyectados en el prompt de IA de cada artefacto. Para
artefactos en otro idioma, declara el idioma en `context`:

```yaml
schema: sequential-spec-driven-design
context: |
  Language: Spanish
  All artifacts must be written in Spanish.
```

---

## Contrato CLI

> Esta sección es la referencia consumida en runtime por las skills (puntero al ancla
> `#contrato-cli`). Se preserva verbatim de la fuente viva, verificada una sola vez
> contra OpenSpec **1.4.1**.

Source of truth for these fields:
`node_modules/@fission-ai/openspec/dist/core/artifact-graph/instruction-loader.d.ts`
and `dist/core/change-status-policy.d.ts`, cross-checked with the active schema
`openspec/schemas/sequential-spec-driven-design/schema.yaml`. Always invoke the
binary as `node_modules/.bin/openspec`.

### Human vs agent usage

Interactive/human-oriented (no `--json`): `openspec init`, `openspec view`,
`openspec config edit`, `openspec feedback`, `openspec completion install`.

Script/agent-oriented (`--json`): `openspec list`, `openspec show`,
`openspec status`, `openspec instructions`, `openspec templates`,
`openspec schemas`, and workspace subcommands. The CLI `openspec validate` is
**not** part of this pipeline (see «Common agent commands» below): delta
completeness/validation is owned exclusively by the project gate
`npm run openspec:verify-stage-completion`.

### `openspec new change <name>`

Scaffolds a change at `openspec/changes/<name>/` with `.openspec.yaml` (and the
schema from config). `new` is a command group whose only subcommand is `change`.
The name must start with a lowercase letter and be lowercase
(`validateChangeName`, `dist/utils/change-utils.js`) — names starting with a digit
or containing uppercase are rejected. This constraint is why the incremental id
is `c<NNNNN>-<slug>` (lowercase `c` prefix mandatory).

### `openspec status --change "<name>" --json`

Returns a `ChangeStatus` object. Relevant fields (from `instruction-loader.d.ts`):

- `changeName` — the change name.
- `schemaName` — active schema (here `sequential-spec-driven-design`).
- `changeRoot` — absolute path to the change directory.
- `planningHome` — `PlanningHomeSummary`: `{ kind: 'repo' | 'workspace', root,
  changesDir, defaultSchema, workspaceName? }`. `changesDir` is the canonical base
  for archive-path derivation (do not hardcode `openspec/changes/archive`).
- `artifactPaths` — `Record<artifactId, ArtifactPathSummary>`, where
  `ArtifactPathSummary = { outputPath, resolvedOutputPath, existingOutputPaths }`
  (see the resemantics note below). Use `existingOutputPaths` to read/resolve files
  that already exist (e.g. delta specs at `artifactPaths.specs.existingOutputPaths`).
- `nextSteps` — plain-language next steps for users and agents.
- `actionContext` — `ActionContext` (machine-readable constraints): `mode`
  (`'repo-local' | 'workspace-planning'`), `sourceOfTruth`, `planningArtifacts`,
  `linkedContext`, `allowedEditRoots`, `requiresAffectedAreaSelection`,
  `constraints`. **Workspace guard**: when `mode == "workspace-planning"` and
  `allowedEditRoots` is empty, linked repos are read-only — `apply` and `archive`
  must stop.
- `applyRequires` — artifact IDs required before the apply phase (from the schema's
  `apply.requires`; here `["tasks"]`).
- `artifacts` — per-artifact `{ id, outputPath, status: 'done' | 'ready' | 'blocked',
  missingDeps? }`.
- `isComplete` — whether all artifacts are complete.

### `openspec instructions <artifact> --change "<name>" --json`

Returns an `ArtifactInstructions` object — the enriched, single source of truth for
**how to write** an artifact (the schema owns this content; the write-stage skills
never embed it). Relevant fields:

- `resolvedOutputPath` — **where to write**: the absolute path, or a glob resolved
  under the change directory (for `specs`, `generates: specs/**/*.md`). This is the
  write destination.
- `outputPath` — the **pattern only** (e.g. `proposal.md`), not a destination.
- `existingOutputPaths` — concrete files that already exist for this artifact.
- `instruction` — schema guidance for this artifact type (the writing guide).
- `template` — the structure to follow (this IS the output format).
- `context` — project background; a constraint for the writer, **not** content for
  the file.
- `rules` — artifact-specific rules from config; constraints for the writer, **not**
  file content.
- `description`, `dependencies` (`{ id, done, path, description }`), `unlocks`.

### `outputPath` vs `resolvedOutputPath` (resemantics, 1.4.1)

In 1.4.1 both fields coexist with **new semantics**: `outputPath` is only the
**pattern** (e.g. `proposal.md`), and `resolvedOutputPath` is **where the artifact
is written** (absolute path, or resolved glob under the change directory). The
1.3.1-era instruction «write to `outputPath`» is **obsolete**: always write to
`resolvedOutputPath`. The write-stage skills avoid the trap by construction — they
delegate to `openspec instructions` and never embed a hardcoded path.

### Common agent commands

- `openspec list --json` — active changes (`{"changes":[...]}`).
- `openspec show <name>` — inspect a change or spec.
- `openspec schemas --json` / `openspec schema which` — discover/identify schemas.
- `openspec templates` — inspect resolved template paths.

**Validation gate (the only one this pipeline uses).** Delta completeness and
validation are owned by the project script, never by the CLI `openspec validate`:

```bash
npm run openspec:verify-stage-completion -- --change "<name>" --through <proposal|specs|design|tasks>
```

Its exit code is the source of truth (non-zero = hard block; `CRITICAL` messages
name each violation). Do **not** use `openspec validate` to validate a delta: it
only knows the built-in `spec-driven` schema and rejects valid registros no canónicos
(a delta whose `specs/` carries no `## ADDED/MODIFIED/REMOVED/RENAMED`
headers). The CLI `validate` is reserved for **schema** validation inside
`apply-sequential-schema` (`npx openspec schema validate`), which is unrelated to
delta validation.

---

## Workspaces, migración y troubleshooting

### Configuración de entorno recomendada

En máquinas con Git para Windows, la instalación por defecto establece
`core.autocrlf=true` a nivel system. Esta configuración convierte los LF del índice
a CRLF en checkout, pero no normaliza los archivos creados fuera de `git checkout`
(scripts, agentes, la extensión VS Code). El resultado son "cambios fantasmas":
archivos reportados como modificados en `git status` sin ningún cambio lógico.

Este repo declara `* text=auto eol=lf` en `.gitattributes`, lo que fija la política
de fin de línea como contrato del repositorio, independientemente de la configuración
local de git. Sin embargo, se recomienda también cambiar la configuración global a
`input` en cada máquina de desarrollo:

```bash
git config --global core.autocrlf input
```

**Por qué `input` y no `false`**: `input` aplica la conversión CRLF→LF al stagear
(si el archivo en disco llega con CRLF, git lo normaliza antes de escribir el blob),
pero no convierte LF→CRLF en checkout. Esto complementa el `.gitattributes`: el repo
siempre almacena LF, y `input` actúa como red de seguridad si un editor escribe CRLF.
`false` también funciona con el `.gitattributes`, pero no atrapa CRLFs de editores que
no respetan la política del repo.

**Nota**: este cambio aplica a nivel `--global` y afecta todos los repos de la
máquina. Si trabajas con repos que requieren CRLF, evalúa si este cambio global es
apropiado — en ese caso, el `.gitattributes` de este repo es suficiente garantía y
puedes omitir el cambio global.

### Workspaces

Usa workspaces solo para planificación cross-repo o multi-folder; por defecto,
prefiere OpenSpec repo-local. El soporte de workspaces está en desarrollo activo —
trata su comportamiento, archivos de estado y salida JSON como más volátiles que el
estado repo-local.

Modelo mental: workspace = superficie de coordinación para changes cross-repo
relacionados; link = nombre estable para un repo o folder; change = un
feature/fix/proyecto.

Archivos de estado: los proyectos repo-local guardan estado en `openspec/specs/` y
`openspec/changes/`; los workspaces lo guardan en
`.openspec-workspace/workspace.yaml` y `.openspec-workspace/local.yaml`.

### Migración

Los workflows legacy de OpenSpec se preservan durante la migración: los changes
existentes, el historial archivado y `openspec/specs/` permanecen intactos. La
integración de tooling bajo `.claude/` es propiedad de este repo, no de las
ejecuciones automáticas de `openspec update`. El modelo core no cambia:
`openspec/specs/` = fuente de verdad, `openspec/changes/` = trabajo activo.

**Nunca** ejecutes `openspec update`, `openspec init --force`, ni comandos similares
que regeneren los archivos de integración de `.claude/` salvo que el usuario lo pida
explícitamente en la tarea actual — sobrescriben las skills mantenidas a mano.

### Troubleshooting

- La skill no se activa → el único punto de entrada es el orquestador; invoca
  `orchestrate-specification-delta` (o `orchestrate-roadmap`) explícitamente. No
  ejecutes `openspec update` para «arreglar» skills.
- Resolución de schema equivocada → inspecciona los metadatos del change,
  `openspec/config.yaml` y cualquier override `--schema`.
- Artefactos de baja calidad → enriquece `context`/`rules` en `openspec/config.yaml`.
- Falla la validación → ejecuta el gate del proyecto
  `npm run openspec:verify-stage-completion -- --change "<name>" --through <artifact>`
  (su exit code y sus mensajes `CRITICAL` son la fuente de verdad) e inspecciona
  `openspec status` y los archivos spec/change relevantes. No uses `openspec validate`
  del CLI para validar un delta: solo conoce el schema built-in y rechaza registros no
  canónicos válidos (retiros o adiciones sin cabeceras de operación).
- Archive se queja de sync faltante → el sync es la etapa 9 obligatoria
  (`synchronize-specification-delta`) que corre antes de archivar; archive ya no
  re-sincroniza.
- Comportamiento inconsistente de workspace → prefiere planificación repo-local salvo
  que la coordinación multi-repo sea realmente necesaria.

---

## Mantenimiento y limitaciones

El ecosistema es una **capa de customización sobre OpenSpec**, no configuración
nativa, y eso tiene un precio de mantenimiento que conviene asumir con los ojos
abiertos:

- El override del schema (DAG secuencial) vive en `openspec/schemas/` y **sobrevive a
  `openspec update`** por la precedencia project-local. Esa parte es robusta.
- Las skills custom (dos orquestadores + diez etapas + esta referencia) viven en tu
  propio namespace, fuera del que OpenSpec regenera, así que `openspec update` no las
  pisa. Pero **eres dueño de ellas**: si una futura versión de OpenSpec cambia la
  interfaz de `openspec instructions`, `openspec status` o el formato de los delta
  specs, tus wrappers delgados podrían requerir ajuste.
- La regla de delegación es lo que mantiene sano el conjunto. Si en algún momento se
  incumple (copiar instrucciones dentro de una skill), reaparece la doble fuente de
  verdad que el diseño busca evitar.
- **Parche de validación de `created` en `.openspec.yaml`** — OpenSpec 1.4.1 solo acepta
  `YYYY-MM-DD` en el campo `created` del `.openspec.yaml`. La extensión EvolutiveX
  Workbench escribe timestamps ISO 8601 completos (`YYYY-MM-DDThh:mm:ssZ`), que el
  validador Zod rechaza; los comandos `openspec instructions`, `openspec new change` y
  `openspec status` fallarían al encontrar ese formato. El script
  `scripting/openspec/patch-openspec-change-metadata.mts` extiende el regex a formato
  dual `(YYYY-MM-DD | ISO 8601 completo)` directamente en
  `node_modules/@fission-ai/openspec/dist/core/change-metadata/schema.js`. Está
  registrado como `postinstall` en `package.json` para reaplicarse automáticamente tras
  cada `npm install`. No existe punto de extensión oficial en OpenSpec 1.4.1 para
  sobreescribir esta validación sin tocar `node_modules/`; cuando se publique una versión
  que lo soporte, este parche debe retirarse.

En balance: el ecosistema convierte un workflow con dos formas divergentes y etapas
opcionales en un único pipeline secuencial, mandatorio y orquestado, a cambio de
mantener una capa fina de skills propias sobre el motor de OpenSpec. Para un uso donde
la coherencia de artefactos y las garantías de calidad importan más que la
configuración cero, el intercambio es favorable.
