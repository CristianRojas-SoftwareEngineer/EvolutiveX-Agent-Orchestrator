# Revisión: coherencia de `new-scientific-maintenance.md` v0.1

> **Fecha:** 2026-06-08  
> **Documento analizado:** `docs/proposals/new-scientific-maintenance.md` (v0.1 borrador, post-embebimiento)  
> **Alcance:** Coherencia interna del documento (§3 narrativa ↔ §5–§9 especificación ↔ §13 skills embebidas)  
> **Sistema vigente en disco:** 15 skills `sm-*` con modos interno (`causa-mode` / `solution-mode`)

---

## Resumen ejecutivo

El documento de propuesta **es autocontenido** (§13 embebe 21 skills + referencias + plantillas + `CLAUDE.md`). La arquitectura de dos cadenas secuenciales es **coherente y operativa**: elimina bifurcaciones internas, separa causa/solución/cierre, modelar precondiciones estructurales (`## Causa confirmada`, `## Solución ganadora`, estado `pausado`).

Sin embargo, persisten **6 hallazgos de coherencia** — discrepancias entre narrativa (§3), especificación (§5–§9), fases procedimentales (§7), y skills embebidas (§13):

1. **CRÍTICA — "Diferido" huérfano:** término mencionado en §5.3 y §7.15 pero no implementado en skills.
2. **CRÍTICA — `case_resumed_at` ausente de §5–§8:** campo documentado en §9.5 y §13 pero no en secciones de precondiciones/artefactos.
3. **ALTA — Contradicción append vs superseded en fase 12:** §7.10 vs §13.1.2 sobre si hipótesis descartadas usan `superseded`.
4. **ALTA — Versionado Bucle A/B inconsistente:** §8.4 vs §13.1.2 sobre MAJOR/MINOR en bucles de refutación.
5. **ALTA — Trigger de "candidatas agotadas" indefinido:** menciona agotamiento pero no cómo se detecta.
6. **ALTA — Precondición 17 vs 16 condicional no explícita:** §5.3 requiere `## Solución ganadora` incluso cuando cadena no abrió.

**Recomendación:** los 6 hallazgos son resolubles con edits quirúrgicos en el documento. Ninguno invalida el diseño arquitectónico. La migración puede aprobarse tras resolver estos 6 puntos.

---

## 1. Hallazgos detallados y opciones de solución

### Hallazgo 1 [CRÍTICA] — "Diferido" huérfano

**Dónde aparece:**
- §5.3 (líneas 259–262): «Si la fase 08 no contiene esa sección, el orquestador **no** invoca la fase 11: en su lugar, salta directamente a la fase 17 para emitir "no resuelto" o "diferido" (según indique el caso: si la causa está confirmada pero la fase 16 no se ejecutó porque se agotaron las candidatas, es "no resuelto"; si la causa y la solución están confirmadas pero la spec necesita información que el usuario no ha provisto, es "diferido").»
- §7.15 (línea 702): misma mención en la subsección de fase 17.

**Problema:**
La skill `sm-phase-conclusion` (§13.3.1, pasos 3a/3b) implementa solo 2 rutas:
- 3a: `status: done` → emitir spec.
- 3b: `status: pausado` → emitir "no resuelto" + lección + `case_paused_at`.

No existe rama para "diferido" ni estado intermedio en `case.md`. Las fases 16 y 17 embebidas tampoco mencionan "diferido". El orquestador (§13.5) también coloca solo "done" o "pausado".

**Impacto:** ambigüedad sobre cómo se maneja el caso donde causa y solución están confirmadas pero falta información del usuario.

**Opciones de resolución:**

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A — Eliminar "diferido"** | Colapsar en "no resuelto" + `pausado` + lección. La lección documenta qué información falta. Bucle C re-apertura permite al usuario proporcionar info adicional. | Simplifica el modelo: dos estados (`done`, `pausado`). Coherente con impl embebida. Lección es flexible para capturar dependencias. | El nombre "no resuelto" puede ser confuso si la causa y solución técnicamente están confirmadas. |
| **B — Formalizar "diferido"** | Añadir estado `diferido` a `case.md` + rama en skills 16/17. Diferido ≠ pausado: necesita info del usuario, no re-apertura de 03–08. | Semántica más clara: diferido = waiting-for-input, pausado = waiting-for-more-research. Ajustar a contextos complejos. | Añade estado y branches en skills. Requiere cambios en orquestador + §13. |
| **C — Híbrido: "diferido" como metadata de pausa** | Mantener `pausado`, pero enriquecer con un campo `pause_reason: 'candidatas-agotadas' \| 'informacion-pendiente'` en `case.md`. | Una estructura, múltiples semánticas. Sin branches de código. Lección y metadatos documentan el motivo. | Requiere ajuste en el schema de `case.md`; menos explícito que un estado dedicado. |

**Recomendación:** **Opción A** (eliminar "diferido"). Justificación: el documento enfatiza que "no resuelto" es el veredicto cuando falta confirmación (causa O solución). Si ambas están confirmadas y falta info del usuario, eso sigue siendo un "no" a la emitencia inmediata de spec; la pausa + lección + Bucle C permiten la continuación. La Opción B requeriría reescribir §13 (las skills), que es rígido en el nuevo análisis.

---

### Hallazgo 2 [CRÍTICA] — `case_resumed_at` ausente de §5–§8

**Dónde falta:**
- §5 (Precondiciones): menciona `case_paused_at` en §5.4 línea 274, pero NO `case_resumed_at`.
- §8 (Artefactos): 
  - §8.1 (Convención de nombres): no lista `case_resumed_at`.
  - §8.2 (Formato): bloque YAML ejemplo (líneas 763–778) solo muestra `status`, no los campos de pausa/re-apertura.

**Dónde SÍ aparece:**
- §3.1.3 (Bucle C): línea 184-190, documenta "campos de control" `case_paused_at` y `case_resumed_at`.
- §9.5 (Estado `pausado`): líneas 881–911, docum enta ambos campos con ISO-8601 UTC.
- §10.5 (Ejemplo "no resuelto"): línea 1109-1110, muestra `case_resumed_at: 2026-06-09T09:15:00Z`.
- §13.7.1 (Plantilla `case.md`): línea 3086, `case_resumed_at: ""`.
- §13.5 (Orquestador, paso 9): línea 2670, "Fix `case_resumed_at: <ISO-8601 UTC>`".

**Problema:** asimetría. El documento NO prescriba los campos en las secciones autoritativas (§5 precondiciones, §8 artefactos), pero SÍ los usa en la implementación (§13). Cualquier lector que consulte solo §5–§8 no encontrará `case_resumed_at` documentado.

**Impacto:** cuando se migre, la validación de esquema YAML puede fallar si no se explicita en §5.4.

**Opciones de resolución:**

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A — Añadir a §5.4 y §8** | Incluir `case_paused_at` y `case_resumed_at` en la tabla de campos canónicos de §5.4, y en el ejemplo YAML de §8.2. | Completes la especificación normativa. Coherencia cross-reference con §9.5 y §13. | Small diff; requiere actualizar 2–3 bloques. |
| **B — Mantener en §9.5 como "NUEVO" únicamente** | Dejar como está; considerar que §9.5 "Estado `pausado` del caso" es la sección normativa de estos campos. | Preserva la estructura: precondiciones en §5, estado en §9. | Requiere que lectores lean §9.5 para entender el schema completo. |

**Recomendación:** **Opción A**. El campo aparece en §5.2 (precondición de cadena) y el orquestador lo modifica en paso 9; debe estar en §5.4 por completitud. Similar para §8.2: si el artefacto tiene estos campos, su formato debe estar documentado en §8.

---

### Hallazgo 3 [ALTA] — Contradicción append-only vs `superseded` en fase 12

**Dónde aparece:**
- §7.10 (Fase 12): líneas 633–635: «la fase 12 es **idempotente**: re-ejecutada por el Bucle B (refutación interna de solución, ver §3.1.2), **appende nuevas hipótesis y marca las refutadas como `superseded` con su razón de descarte**.»
- §13.1.2 (Skill embebida): líneas 1597–1601: «Do NOT overwrite or remove previously tested hypotheses — they are the audit trail of the solution-space iteration (the batch comparison in 16 already weighed them and concluded none won).»
- §3.1.2 (Bucle B): línea 160: «pero preserva `11-solution-research.md` (el mapa del espacio) y `12-solution-hypothesis.md` (las hipótesis descartadas son audit trail; se append con nuevas candidatas).»

**Problema:** contradicción directa. §7.10 dice "marca las refutadas como `superseded`", pero §13.1.2 (skill embebida, autorizada) dice "do NOT... they are the audit trail". §3.1.2 también apunta a append puro.

**Raíz:** §7.10 fue redactado sin revisar la skill embebida en §13.1.2 que implementa el behavior real.

**Impacto:** cuándo se migre, el comportamiento será append-only (seguirá §13.1.2), pero el documento narrativo (§7.10) promete `superseded`. Confusión o implementación divergente.

**Opciones de resolución:**

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A — Append-only (seguir skill embebida)** | Reescribir §7.10: «appende nuevas hipótesis, **sin sobrescribir las previas**. Las hipótesis probadas en rondas anteriores viven como filas de `12-solution-hypothesis.md` con sus métricas y resultados de 15; no se marcan `superseded` (son audit trail de la iteración). El descarte explícito aparece en `## Hipótesis descartadas` de `16-solution-analysis.md`.» | Coherente con §13.1.2 (skill embebida). Auditoría limpia: historial completo en un archivo. Append puro es versión-simple (MINOR++ si se añaden candidatas). | Requiere redacción de §7.10. |
| **B — Formalizar `superseded` en 12** | Reescribir §13.1.2 para marcar hipótesis refutadas con `superseded` + MAJOR++ en cada Bucle B. Crear una sección `## Hipótesis superseded` en 12. | §7.10 se mantiene como está; explícito que refutaciones generan versión. Auditoría por versiones. | Cambiar la skill embebida (más rígido). Aumenta complejidad de versionado. |

**Recomendación:** **Opción A**. La skill embebida §13.1.2 es la fuente de verdad más reciente. Append-only es más simple que versiones, y la lección captura el contexto de por qué una hipótesis no ganó (aprendizaje, no solo "superseded").

---

### Hallazgo 4 [ALTA] — Versionado Bucle A/B inconsistente

**Dónde aparece:**
- §8.4 (Convención de versionado): líneas 806–815. «En el **Bucle A**, los artefactos 04–08 de la hipótesis refutada se marcan `superseded`; en el **Bucle B**, los artefactos 12–16 de la solución refutada se marcan `superseded`. En ambos casos la nueva versión incrementa MAJOR (los insumos aguas arriba cambiaron).»
- §3.1.2 (Bucle B): línea 160: «marca los artefactos `13`–`16` con `status: superseded` (el diseño 13 y los resultados 14–16 ya no aplican) **pero preserva** `11-solution-research.md` (el mapa del espacio) y `12-solution-hypothesis.md` (las hipótesis descartadas son audit trail; se append con nuevas candidatas).»
- §13.1.2 (Skill embebida): línea 1597: «Idempotent: re-invoked by the Solution Refutation Loop (Bucle B), appends new hypotheses without overwriting refuted ones.»

**Problema:** §8.4 promete que Bucle B marca 12–16 como `superseded` MAJOR++. Pero §13.1.2 (skill) implementa append puro sin `superseded` en 12. El conflicto es: ¿incrementa versión?

Además, §3.1.2 dice que 12 se "preserva" (append), pero §8.4 dice que 12-16 se marcan `superseded` en el bucle. Inconsistencia.

**Impacto:** en la migración, ¿se marcan artefactos 12 como `superseded` o no? ¿MINOR o MAJOR?

**Opciones de resolución:**

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A — Unificar versionado según skill embebida** | Reescribir §8.4: «En **Bucle A**, artefactos 04–08 se marcan `superseded` + MAJOR++ (inputs cambió: nueva hipótesis de causa). En **Bucle B**, artefactos 13–16 se marcan `superseded` + MAJOR++ (diseño experimental y resultados cambian); artefactos 11–12 se **preservan sin superseded** (append puro, MINOR++ si hay nuevas candidatas — inputs aguas arriba, 11, no cambiaron; solo se añaden al mapeo).» | Coherente con §13.1.2. Claridad: 13–16 MAJOR (inputs de 12 cambiaron), 12 MINOR (append-only). Auditoría clara. | Requiere distinguir 12 de 13–16 en §8.4. |
| **B — Bucle B marca TODOS como superseded (04–16)** | Reescribir §13.1.2 para marcar 12 con `superseded` también. Bucle A y B tienen el mismo patrón. | Uniformidad: Bucle A = Bucle B. | Contradice la skill embebida (append-only). Más complejo. |

**Recomendación:** **Opción A**. Bucle B es asimétrico a Bucle A por diseño (batch comparativo, no iterativo). La skill embebida §13.1.2 es la fuente de verdad. Reescribir §8.4 para reflejar que 12 es append-only (MINOR), mientras 13–16 son superseded (MAJOR).

---

### Hallazgo 5 [ALTA] — "Candidatas agotadas" sin trigger definido

**Dónde aparece:**
- §3.1.1 (Bucle A): línea 150: «una hipótesis se confirma, o se agotan las candidatas. Si se agotan, la fase 17 emite "no resuelto" + estado `pausado` (Bucle C, ver §3.1.3).»
- §3.1.2 (Bucle B): línea 162: «una solución gana el veredicto de 16, o se agotan las candidatas. Si se agotan, la fase 17 emite "no resuelto" + estado `pausado` (Bucle C, ver §3.1.3).»
- §3.1.3 (Bucle C): línea 170-172: «Disparador: la fase 17 emite "no resuelto" porque (a) el Bucle A agotó las candidatas de causa sin confirmar, o (b) el Bucle B agotó las candidatas de solución sin veredicto, o (c) la fase 11 no encontró soluciones viables.»

**Problema:** ¿cómo se detecta que "se agotan las candidatas"? ¿Quién lo valida? ¿Es una lista vacía en el artefacto? ¿Un contador en el orquestador?

- §13.5 (Orquestador embebido): pasos 6–7 (refutación Bucle A/B) dicen "Re-invokes phase 04/12... to append the next candidate... Repeat until... candidates are exhausted" — pero no define qué significa "exhausted". ¿Cero `pending`? ¿Cero viables?

**Impacto:** cuando se implemente, el orquestador debe saber cuándo terminar un bucle. Sin criterio claro, puede quedar en loop infinito o terminar prematuramente.

**Opciones de resolución:**

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A — Lista `pending` en artefacto** | Reescribir §3.1.1/§3.1.2: «**Trigger de agotamiento:** cada artefacto de hipótesis (04 en Bucle A, 12 en Bucle B) mantiene una lista de candidatas en estado `pending` (no aún probadas). El bucle itera mientras `pending` ≠ ∅. Cada iteración toma la siguiente `pending`, la re-ejecuta, marca su veredicto (confirmada, refutada, etc.). El bucle termina cuando `pending` queda vacía — el orquestador detecta esta condición consultando el artefacto al final de cada iteración.» | Explícito y auditable: el artefacto es la fuente de verdad. Orquestador es simple: pregunta "¿hay `pending`?". | Requiere que §7 (fases) documente explícitamente el campo `pending`. |
| **B — Contador de intentos en case.md** | Añadir campo `bucle_a_attempts` / `bucle_b_attempts` al bloque canónico de `case.md`. El orquestador incrementa el contador cada iteración; si llega a un límite (p.ej. 10), detiene y emite "no resuelto". | Límite explícito, previene loops infinitos. | Requiere schema change en `case.md`. Número mágico (10). |
| **C — Explícito en la spec del procedimiento** | Reescribir §13.5 (orquestador) paso 6–7 para detallar: «Repeat until a cause is confirmed (the `## Causa confirmada` section is written) **OR no more pending candidates exist in 04-hypothesis.md** (consult the artifact status list). Similarly for Bucle B...» | Autoritativo (skill embebida). Claridad en procedimiento. | Requiere Edit en §13.5. |

**Recomendación:** **Opción A + C** (combinados). Reescribir §3.1.1/§3.1.2 para documentar el "estado `pending` en el artefacto" como trigger, y luego actualizar §13.5 (orquestador embebido) para que el paso 6–7 explícitamente diga "check for pending candidates in the artifact".

---

### Hallazgo 6 [ALTA] — Precondición 17 vs 16 condicional no explícita

**Dónde aparece:**
- §5.3 (líneas 256–263): «La fase 17 **solo** emite la spec validada si `16-solution-analysis.md` existe y contiene una sección `## Solución ganadora` con veredicto explícito (solución elegida + justificación cuantitativa). Sin esa sección, la fase 17 emite un veredicto de "no resuelto" o "diferido" (según indique el caso: si la causa está confirmada pero la fase 16 no se ejecutó porque se agotaron las candidatas, es "no resuelto"; si la causa y la solución están confirmadas pero la spec necesita información que el usuario no ha provisto, es "diferido"). La precondición es estructural: el artefacto de la fase 16 es la **única** fuente de la solución ganadora.»

**Problema:** §5.3 no explicita que el requerimiento de `## Solución ganadora` es **condicional**: la cadena de solución (11–16) solo abre si §5.2 (precondición de cadena) se cumple. Si la cadena NO abrió, entonces 16 no existe y `## Solución ganadora` **no aplica**. El texto de §5.3 no deja esto claro.

Lector desprevenido entiende: "17 SIEMPRE requiere 16", pero la verdad es: "17 requiere 16 **solo si la cadena abrió**".

**Impacto:** confusión en la especificación de precondiciones. El orquestador embebido en §13.5 paso 8 sí lo implementa correctamente, pero el documento normativo (§5.3) es ambiguo.

**Opciones de resolución:**

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A — Reescribir §5.3 con condicional explícito** | §5.3 línea 1: «Cuando la cadena de solución abrió (ver §5.2), la fase 17 **solo** emite la spec validada si `16-solution-analysis.md` existe...». Luego documentar qué ocurre si la cadena NO abrió. | Claridad: precondición es explícitamente condicional. Lectores entienden la dependencia. | Requiere editar §5.3. |
| **B — Separar en subsecciones: §5.3a (cadena abrió) y §5.3b (no abrió)** | §5.3 → §5.3 (Precondición del cierre — cuando la cadena abrió) + §5.3b (Veredicto "no resuelto" — cuando la cadena no abrió o se agotó). | Estructural: dos caminos, dos secciones. Claridad máxima. | Más contenido; requiere reestructurar §5. |

**Recomendación:** **Opción A**. Reescribir el primer párrafo de §5.3 para que diga explícitamente "**Cuando la cadena de solución abrió** (ver §5.2), la fase 17 solo emite la spec validada si..." y luego añadir un párrafo separado que diga "**Si la cadena de solución no abrió** (porque la fase 08 no confirmó causa), la precondición no aplica; la fase 17 emite directamente 'no resuelto' + lección + `pausado`".

---

## 2. ¿Está todo el código fuente embebido?

### 1.1 Sí — con alcance definido

§12 declara el documento **completamente autocontenido**. El código vive en **§13** (~1.800 líneas).

| Sección | Contenido embebido |
|---------|-------------------|
| §13.1 | 6 skills nuevas de solución (fases 11–16) |
| §13.2 | 8 skills de causa (fases 01–08) |
| §13.3 | 2 skills de cierre renumeradas (17–18) |
| §13.4 | 4 perfiles con `phase_policy` de 16 entradas |
| §13.5 | Orquestador |
| §13.6 | 5 referencias del orquestador |
| §13.7 | 2 plantillas (`case.md`, `phase-artifact.md`) |
| §13.8 | `.claude/CLAUDE.md` |

**Total:** 21 skills `sm-*` + infraestructura asociada. La tabla §11.2 lista 29 archivos (incluye `CLAUDE.md`).

### 2.2 Nota sobre el conteo «16 fases»

El documento menciona "16 fases" para las operativas (8 causa + 6 solución + 2 cierre) y rango numérico `01..18` (con 09–10 vacantes). Esto es consistente y bien documentado en §5.4. No es ambigüedad.

### 2.3 No embebido (referenciado como externo)

| Recurso | Motivo |
|---------|--------|
| `.claude/skills/artifact-structuring/SKILL.md` | Política de idioma; sin cambios |
| `.claude/skills/conventional-commits/SKILL.md` | Formato de commits; sin cambios |
| `docs/proposals/scientific-maintenance.md` (v1.0) | Sistema vigente hasta aprobación |
| `docs/proposals/scientific-method-and-openspec-integration.md` | Integración OpenSpec; ajuste diferido |
| `.claude/memory/*.md` | Lecciones; no son código del sistema |

---

## 2. Coherencia con el nuevo diseño (aspectos correctos)

### 2.1 Separación física de cadenas

- Cadena de causa (01–08) y cadena de solución (11–16) tienen skills, artefactos y contratos propios.
- Campo `chain: cause|solution|closure` en frontmatter (§13.6.3, §13.7.2).
- Sin bifurcación `causa-mode` / `solution-mode` en el código embebido.

### 2.2 Precondiciones estructurales

| Precondición | Gate | Comportamiento si falla |
|--------------|------|-------------------------|
| §5.2 Cadena de solución | `08-analysis.md` contiene `## Causa confirmada` | Salta 11–16; ruta a 17 como «no resuelto» |
| §5.3 Cierre con spec | `16-solution-analysis.md` contiene `## Solución ganadora` | 17 no emite spec validada |

Reflejado en: `sm-phase-analysis` (§13.2.8), `sm-phase-solution-analysis` (§13.1.6), `sm-phase-conclusion` (§13.3.1), orquestador (§13.5).

### 2.3 Tres bucles modelados

- **Bucle A:** refutación de causa → re-ejecuta 04–08; preserva 01–03.
- **Bucle B:** refutación de solución → re-ejecuta 12–16; preserva 11.
- **Bucle C:** re-apertura post «no resuelto» → re-ejecuta 03–08; preserva 01–02.

### 2.4 Eliminación de la ambigüedad principal del v1.0 con modos

Comparación con el sistema **actual en disco**:

| Aspecto | v1.0 en disco | Embebido en §13 |
|---------|---------------|-----------------|
| Fase 08 | Detecta modo; emite `## Solution comparison` en solution-mode | Solo emite `## Causa confirmada`; veredicto de solución en fase 16 |
| Fases 05–07 | Bifurcan entre cause-mode y solution-mode | Solo procedimiento de causa |
| Fase 09 (conclusión) | Verifica `## Solution comparison` en 08 | Renumerada a 17; consume `16-solution-analysis.md` |
| Orquestador | «Solution loop» dentro de 05→08 | Cadena 11–16 separada |

El rediseño **sí corrige** el gap que motivó la propuesta (decisiones arquitectónicas en cierre sin medir trade-offs).

### 2.5 Matrices y esquema

- `phase_policy` pasa de 10 a 16 entradas con claves `solution-*` y cierre renumerado.
- `phases` en `case.md` con 16 entradas y huecos 09–10 vacantes.
- Campos `case_paused_at` / `case_resumed_at` para Bucle C.

---

## 3. Ambigüedades y tensiones detectadas

### 3.1 [CRÍTICA] Bucle B: modelo iterativo vs. experimento comparativo batch

**Dónde aparece:**

- §3.1.2: la fase 16 «refuta la **solución activa**» porque la candidata activa no cumple criterios.
- Orquestador §13.5: «If phase 16 refutes the **active solution**» → marca 12–16 superseded → re-ejecuta 12.
- Skills §13.1.3–§13.1.6: fase 13 diseña **un único experimento comparativo** que cubre **todas** las hipótesis; fase 14 las ejecuta secuencialmente; fase 16 compara la tabla completa y elige ganadora.

**Problema:** son dos modelos incompatibles.

| Modelo A (narrativa §3.1.2) | Modelo B (skills §13.1.3–16) |
|-----------------------------|------------------------------|
| Una solución activa a la vez | Todas las hipótesis probadas en un batch |
| Refutación → siguiente candidata | Comparación → ganadora o ninguna |
| Análogo al Bucle A de causa | Análogo a un benchmark multi-candidato |

**Preguntas sin respuesta en el documento:**

1. Si ya se probaron todas las candidatas en el batch, ¿cuándo se dispara Bucle B?
2. ¿Bucle B solo aplica cuando se **añaden** nuevas candidatas desde el mapa de fase 11 (no contempladas en el batch inicial)?
3. Si la ganadora de prioridad 2 supera a la de prioridad 1 en la tabla, ¿hay Bucle B o solo veredicto de fase 16?

**Impacto:** este es el mecanismo central que el rediseño quería corregir (medir trade-offs antes de la spec). Debe resolverse antes de implementar.

**Opciones de resolución (para revisión manual):**

- **Opción A:** Adoptar batch como modelo canónico; reescribir §3.1.2 y Bucle B del orquestador: Bucle B = agotar candidatas del mapa 11 sin ganadora en 16 → append en 12 → re-run 13–16.
- **Opción B:** Adoptar iteración como modelo canónico; reescribir skills 13–16 para probar una candidata por ciclo (como causa).
- **Opción C:** Híbrido explícito: batch inicial + Bucle B solo para candidatas nuevas no incluidas en el diseño 13.

---

### 3.2 [ALTA] Contradicción en tratamiento de hipótesis refutadas (fase 12)

| Fuente | Instrucción |
|--------|-------------|
| §7.10 | En re-invocación por Bucle B, «marca las refutadas como `superseded` con su razón de descarte» |
| §13.1.2 embebido | «do NOT overwrite or remove previously refuted hypotheses — they are the audit trail» |

Son instrucciones opuestas sobre el mismo artefacto `12-solution-hypothesis.md`.

**Sugerencia:** unificar con la convención de versionado de §8.4 (artefacto superseded + nueva versión) o con append-only en el mismo archivo (sin `superseded` en el contenido, solo en frontmatter de versiones).

---

### 3.3 [ALTA] Precondición lineal `N-1` vs. huecos 09–10 y salto a 17

**§5.1:** «La fase N solo se ejecuta si la fase N-1 está `done`.»

**Problemas:**

1. Para fase 11, `N-1` sería 10 — que **no existe** (vacante). El diseño dice que 11 requiere 08, no 10.
2. Fase 17 puede ejecutarse **sin** 11–16 si no hay causa confirmada. §5.1 no contempla este atajo.

**Orquestador §13.5** repite «verify phases 01..N-1 are `done`» en el paso 5, pero el paso 6 salta a 17 sin 11–16. El paso 7 verifica `## Causa confirmada` para 11, no la precondición N-1.

**Sugerencia:** reemplazar la regla genérica por precondiciones por cadena:

- Causa: 01..08 secuencial.
- Solución: 11 requiere 08 con `## Causa confirmada`; 12..16 secuencial dentro de cadena.
- Cierre: 17 requiere 08 `done`; 16 `done` solo si cadena de solución abrió; 18 requiere 17.

---

### 3.4 [MEDIA] Veredicto «diferido» huérfano

**§5.3 y §7.15** mencionan veredictos «no resuelto» **o** «diferido» (cuando causa y solución están confirmadas pero falta información del usuario).

**§13.3.1 (fase 17 embebida)** solo implementa:

- 3a: cierre con spec (`status: done`)
- 3b: pausa (`status: pausado`, «no resuelto»)

No hay rama «diferido» ni estado intermedio en `case.md`.

**Sugerencia:** eliminar «diferido» del diseño o implementarlo (nuevo valor de `status`, procedimiento en 17/18).

---

### 3.5 [MEDIA] Typos de nombre de artefacto

En skills embebidas aparece `16-analysis.md` en lugar de `16-solution-analysis.md`:

| Ubicación | Línea aproximada | Texto erróneo |
|-----------|------------------|---------------|
| §13.3.1 `sm-phase-conclusion` | Output, spec validada | `16-analysis.md ## Solución ganadora` |
| §13.3.2 `sm-phase-communication` | Output | `16-analysis.md ## Solución ganadora` |
| §13.5 orquestador | Paso 8 | `16-analysis.md` (§5.3) |

El resto del documento usa consistentemente `16-solution-analysis.md`.

---

### 3.6 [MEDIA] «Sin cambios» vs. realidad del repo actual

§13.2 y tabla §11.2 marcan fases 01–07 como «sin cambios respecto a v1.0».

**En disco actual**, las fases 05–07 **sí contienen lógica de modo**:

- `sm-phase-experiment-design`: detecta tipo de hipótesis activa → cause-mode vs solution-mode.
- `sm-phase-experiment-execution`: sub-experiment results (solution mode only).
- `sm-phase-data-collection`: comparative metrics table (solution mode only).

**En §13 embebido**, 05–07 están **limpias** (solo causa). Coherente con el nuevo diseño, pero **no idénticas al v1.0 en disco**.

La fase 08 también cambia (añade `## Causa confirmada` obligatoria; elimina solution-mode).

**Implicación para migración:** la tabla §11.2 subestima el diff real. Fases 05–08 requieren poda de modos, no solo «sin cambios» en 01–07.

---

### 3.7 [MEDIA] Integración OpenSpec / Etapa B — hueco deliberado

El diseño dice (resumen ejecutivo): «La integración con OpenSpec (Etapas A/B/C) **no cambia** en este plan.»

Pero las skills embebidas **no contienen**:

- `Etapa B`, `openspec-verify`, re-ejecución de fase 08 post-verify
- `integration_mode`, `openspec_change` en `case.md`
- Lógica de frontera SM→OpenSpec en orquestador

Todo eso **sí existe** en el orquestador, conclusión y análisis actuales en disco.

§12 y §11.3 difieren la actualización de `scientific-method-and-openspec-integration.md` (fase 09 → 17) a un commit aparte, **después** de la migración.

**Riesgo:** implementar §13 tal cual **rompe** la integración OpenSpec hasta un plan aparte. No es ambigüedad del diseño de dos cadenas, pero sí un **vacío de migración** que debe planificarse explícitamente.

---

### 3.8 [BAJA] Bucle C + «SUBSEQUENT CASE RUNNING»

Orquestador §13.5: si tras re-apertura (03–08) se confirma causa, la cadena de solución abre en una **corrida posterior**, no en la misma sesión.

**Motivación declarada:** evitar mezclar dos ciclos de vida en el mismo expediente.

**Problema de usabilidad:** regla poco intuitiva; §10.5 (ejemplo de «no resuelto») no demuestra el flujo completo causa-confirmada-en-reapertura → nueva corrida → solución.

**Sugerencia:** añadir ejemplo §10.6 o aclarar en §3.1.3 qué acción concreta toma el orquestador (¿cierra la corrida actual y pide al usuario iniciar otra?).

---

### 3.9 [BAJA] Reutilización del experimento 13 en Bucle B

§3.1.2: «El experimento comparativo de 13 puede **re-utilizarse** sin cambios (las hipótesis descartadas ya estaban contempladas en el diseño); si no, 13 se rehace.»

Orquestador §13.5: solo dice «re-run 13–16» sin distinguir reutilizar vs. rediseñar.

**Sugerencia:** añadir criterio en orquestador o skill 13: reutilizar si las nuevas candidatas encajan en el diseño comparativo existente; rediseñar si no.

---

### 3.10 [BAJA] Idempotencia de fase 11 vs. orquestador

§7.9: fase 11 es idempotente; re-ejecutada «amplía con nuevas candidatas».

Orquestador: fase 11 **no se re-invoca** en Bucle B.

Compatible si nunca se llama, pero §7.9 sugiere un uso que el orquestador no permite. Aclarar si la ampliación del mapa ocurre solo vía Bucle C (re-apertura 03–08, que no abre solución) o si Bucle B debería re-invocar 11.

---

### 3.11 [INFORMATIVA] Discrepancia 16 fases vs. rango 01..18

El documento lo reconoce explícitamente (§5.4, nota al pie): 16 fases operativas, rango numérico 01..18 con 09–10 vacantes por renumeración 09→17, 10→18. No es un bug si se entiende la convención; puede confundir en validación de esquema.

---

## 2. Matriz de resolución por hallazgo

| # | Severidad | Problema | Bloquea aprobación | Opción recomendada | Acción |
|---|-----------|----------|--------------------|--------------------|--------|
| 1 | CRÍTICA | "Diferido" huérfano | Sí | **A** — Eliminar "diferido", colapsar en "no resuelto" + `pausado` | Editar §5.3, §7.15 |
| 2 | CRÍTICA | `case_resumed_at` ausente de §5–§8 | Sí | **A** — Añadir a §5.4, §8.1, §8.2 | Editar 3 bloques |
| 3 | ALTA | Append-only vs `superseded` en fase 12 | Recomendable | **A** — Append-only (seguir skill §13.1.2) | Editar §7.10 |
| 4 | ALTA | Versionado Bucle A/B inconsistente | Recomendable | **A** — 13–16 MAJOR, 12 MINOR | Editar §8.4 |
| 5 | ALTA | Trigger "candidatas agotadas" | Recomendable | **A+C** — Usar estado `pending` en artefacto + orquestador | Editar §3.1.1/2, §13.5 |
| 6 | ALTA | Precondición 17 vs 16 condicional | Recomendable | **A** — Reescribir §5.3 con condicional explícito | Editar §5.3 |

---

## 3. Orden de ejecución de fixes (minimiza dependencias)

1. **Hallazgo 1+6** (mismo §5.3): eliminar "diferido", explicitar condicional en §5.3.
2. **Hallazgo 2**: añadir `case_resumed_at` a §5.4, §8.1, §8.2.
3. **Hallazgo 3**: reescribir §7.10 para append-only.
4. **Hallazgo 4**: reescribir §8.4 para distinguir Bucle A/B versionado.
5. **Hallazgo 5**: actualizar §3.1.1, §3.1.2, §13.5 para trigger explícito.

**Validación final:** releer §3.1 (bucles), §5 (precondiciones), §7.10/7.15 (fases), §8 (artefactos), §13 (skills). Verificar coherencia cruzada.

**Commit:** `docs(proposals): resolver 6 hallazgos de coherencia en new-scientific-maintenance` (conventional-commits español, detallando cada hallazgo en la sección Resumen de cambios).

---

---

## 5. Checklist de validación post-fix

Después de aplicar los 6 fixes, releer y verificar:

- [ ] §5.3 elimina "diferido" y aclara que precondición `## Solución ganadora` es condicional.
- [ ] §5.4 incluye `case_paused_at` y `case_resumed_at` en la tabla de campos canónicos.
- [ ] §7.10 (fase 12) describe append-only, sin mención de `superseded`.
- [ ] §8.2 (formato YAML) muestra ambos campos `case_paused_at` y `case_resumed_at`.
- [ ] §8.4 (versionado) distingue explícitamente: Bucle A todo MAJOR, Bucle B: 12 MINOR (append), 13–16 MAJOR.
- [ ] §3.1.1 y §3.1.2 documentan trigger explícito: "mientras `pending` ≠ ∅".
- [ ] §13.5 (orquestador) paso 6–7 consulta estado `pending` del artefacto.
- [ ] §10.5 (ejemplo "no resuelto") sigue siendo consistente tras cambios.
- [ ] Cero referencias a "diferido" en el documento.
- [ ] Cero typos tipo `16-analysis.md` (debe ser `16-solution-analysis.md`).

---

## 6. Conclusión final

**Estado del documento:** `new-scientific-maintenance.md` v0.1 es **arquitectónicamente sólido** — dos cadenas especializadas, precondiciones estructurales claras, skills embebidas funcionales.

**Hallazgos resueltos:** los 6 hallazgos de coherencia son **resolubles con edits quirúrgicos** en el documento; ninguno invalida la arquitectura.

**Recomendación:** aplicar los 6 fixes recomendados (Opción A para cada uno), validar con el checklist, y entonces el documento está **listo para aprobación** y posterior migración.

**Diferencia vs. revisión anterior:** esta revisión **actualizada documenta las opciones de solución** con tabla de ventajas/desventajas para cada hallazgo, permitiendo que el usuario del documento tome una decisión informada sobre cuál opción preferir. Los 6 hallazgos nuevos (vs. los 11 anteriores) son los **más críticos** para la coherencia del documento y la migración.

---

## Referencias

- Propuesta: `docs/proposals/new-scientific-maintenance.md`
- Sistema vigente: `docs/proposals/scientific-maintenance.md` v1.0
- Lección motivadora: `.claude/memory/clean-modules-windows-atomicity-2026-06.md`
- Caso de referencia del gap: `maintenance-cases/20260607-clean-modules-windows/`
