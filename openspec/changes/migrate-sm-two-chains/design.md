## Context

El sistema de mantenimiento científico vigente (`.claude/skills/sm-*`, documentado en `docs/proposals/scientific-maintenance.md` v1.0) implementa una única cadena de 10 fases que alterna internamente entre "causa-mode" y "solution-mode" según el estado del artefacto. Las fases 05–08 bifurcaban su lógica, la sección `## Solution comparison` en `08-analysis.md` era condicional, y la frontera de Etapa B con OpenSpec se citaba como "fase 09". El caso `20260607-clean-modules-windows` demostró que este diseño emite decisiones arquitectónicas sin haber comparado trade-offs entre alternativas de solución. El doc `docs/proposals/new-scientific-maintenance.md` v0.6 propone la corrección: dos cadenas especializadas, sin bifurcación interna por modo.

## Goals / Non-Goals

**Goals:**
- Implementar la arquitectura de dos cadenas (causa 01–08, solución 11–16, cierre 17–18) según el diseño v0.6.
- Eliminar la lógica de modo interno de las fases 05–08 de causa.
- Añadir las 6 skills de solución (fases 11–16) con sus propios contratos.
- Actualizar el orquestador con precondiciones por cadena, 3 bucles (A, B, C), y estado `pausado`.
- Corregir la integración SM↔OpenSpec: frontera de Etapa B en fase 17 (no fase 09).
- Ampliar la `phase_policy matrix` de 10 a 16 entries en cada perfil.

**Non-Goals:**
- Modificar `maintenance-cases/`, `routing/`, `src/`, u otras capas de aplicación.
- Ejecutar `openspec update` como parte de este change.
- Implementar código de las skills más allá de lo descrito en las referencias §13.x del doc fuente. El código embebido en §13 se移植á en la fase de apply, no en la planificación.
- Alterar el comportamiento de los casos SM que están en curso; los casos existentes conservan su workflow hasta que se re-ejecuten.

## Decisiones

### Decisión 1: Arquitectura de dos cadenas en lugar de extensión por modos

**Opción elegida:** Separación física de la cadena de causa (01–08) y la cadena de solución (11–16).

**Alternativa descartada:** Mantener 1 cadena con bifurcación interna por modo (la "solución de modos" de los commits `46de4ea`, `ca0b86e`, `3c42a93`). Esta alternativa fue insuficiente porque: (a) re-entry rules distintas para cada modo se solapaban; (b) la sección `## Solution comparison` era condicional dentro de `08-analysis.md`; (c) el modo se detectaba dinámicamente desde el estado del artefacto, haciendo al sistema frágil ante refutaciones que cruzaban ambos espacios.

**Rationale:** La separación física garantiza que cada fase tiene un único procedimiento, un único contrato, y un único conjunto de precondiciones. La frontera "causa confirmada" es una precondición estructural, no una convención.

### Decisión 2: Renumeración de fases 09→17 y 10→18

**Opción elegida:** Las antiguas fases 09 y 10 (conclusión y comunicación del sistema de 1 cadena) se renumeran a 17 y 18 para dejar el rango 11–16 disponible a las fases de solución.

**Rationale:** Los saltos 09–10 → 11–12 permiten que las fases de causa y solución tengan el mismo ordinal dentro de su cadena (03↔11, 04↔12, 05↔13, 06↔14, 07↔15, 08↔16), facilitando el razonamiento sobre ortogonalidad. Además, la frontera de Etapa B queda al final del sistema (fase 17), no mezclada con las fases de causa.

### Decisión 3: Tres bucles ortogonales en lugar de uno mixto

**Opción elegida:** Bucle A (refutación interna de causa, 1-a-1), Bucle B (batch comparativo de solución), Bucle C (re-apertura post-pausa).

**Alternativa descartada:** Un solo bucle mixto que iterara tanto causas como soluciones. Esto reintroducía el problema de mezcla de espacios que el diseño de dos cadenas busca resolver.

**Rationale:** Los tres bucles operan en dominios ortogonales: A itera causas (hipótesis una a una), B itera soluciones (batch comparativo), C re-abre el caso completo con nuevo contexto. Cada uno tiene su propio trigger, acción, y condición de agotamiento.

### Decisión 4: Frontera de Etapa B en fase 17

**Opción elegida:** La spec validada que alimenta OpenSpec se emite en fase 17, no en fase 09 como en v0.3. La corrección se aplica en el mismo plan de migración, actualizando `docs/proposals/scientific-method-and-openspec-integration.md` a v0.6.

**Rationale:** En el sistema de dos cadenas, la spec se construye con datos de ambas cadenas (causa confirmada en 08 + solución ganadora en 16). No puede emitirse en la fase 09 del sistema antiguo porque esa fase solo tenía datos de la cadena de causa.

### Decisión 5: Orden de implementación (§11.1)

El orden de migración sigue las 8 fases documentadas en §11.1 del doc fuente:

1. Añadir las 6 skills de solución nuevas (fases 11–16) bajo `.claude/skills/`.
2. Renumerar las 2 skills de cierre (09→17, 10→18).
3. Actualizar el orquestador con las 16 fases, 3 bucles, precondiciones, y `pausado`.
4. Actualizar los 4 perfiles con `phase_policy matrix` de 16 entries.
5. Actualizar la plantilla `case.md` (16 entries + nuevos campos).
6. Actualizar `phase-policy-schema.md` (16 claves válidas).
7. Actualizar `artifact-conventions.md` (campo `chain`, rango 01..18).
8. Actualizar `.claude/CLAUDE.md` (scientific_maintenance section).

Cada paso es referenciable a §13.x del doc fuente para el detalle de implementación. La fase 18 (comunicación, actualización de integración SM↔OpenSpec) se ejecuta como último paso del orden para garantizar que la corrección de la frontera de Etapa B se aplique sobre un sistema ya migrated.

## Risks / Trade-offs

- **[Risk] Contract break durante migración:** Los casos en curso (con `maintenance-cases/` en disco) usan el workflow antiguo (1 cadena con modos). Si se ejecutan durante la migración, sus artefactos pueden quedar inconsistentes con el nuevo sistema.
  → **Mitigation:** La migración no re-escribe artefactos existentes. Los casos en curso conservan el workflow antiguo hasta su cierre. La re-ejecución de un caso pausado usará el nuevo sistema con `case_run` incrementado.

- **[Risk] Skills de solución sin validación empírica:** Las 6 nuevas skills (fases 11–16) son diseño nuevo, no演进 de código existente. No hay experiencia de uso previa.
  → **Mitigation:** Cada skill sigue el mismo patrón de las skills de causa existentes (§13.2.x), con el mismo contrato de fase (`focus`, `reasoning_effort`, `evidence`, `acceptance`, `risk_controls`). El primer caso real que use la cadena de solución proporcionará la primera validación empírica.

- **[Risk] Desincronización temporal de la integración SM↔OpenSpec:** Si la actualización de `scientific-method-and-openspec-integration.md` (paso 18 del orden) se ejecuta en un commit separado del orquestador actualizado, el doc de integración y el código pueden estar desincronizados brevemente.
  → **Mitigation:** Todos los cambios de la migración se ejecutan en el mismo plan (openspec apply completo), garantizando que la corrección de la frontera de Etapa B y la actualización del orquestador se commitean juntos.

- **[Trade-off] 16 fases vs. 10:** El sistema nuevo tiene más fases, lo que puede percibir como mayor carga cognitiva.
  → **Mitigation:** La separación física de cadenas reduce la carga comparada con el sistema de modos: cada fase tiene un único procedimiento, sin bifurcación. Los ordinalos compartidos (03↔11, 04↔12, etc.) facilitan recordar la estructura.

## Migration Plan

1. **Fase 1 del plan:** Añadir las 6 skills de solución nuevas (research, hypothesis, experiment-design, execution, data-collection, analysis) bajo `.claude/skills/sm-phase-solution-*/`. Cada una con SKILL.md siguiendo el patrón de las skills de causa. Implementar según §13.1.x del doc fuente.

2. **Fase 2:** Renumerar `sm-phase-conclusion` (09→17) y `sm-phase-communication` (10→18). Actualizar referencias internas. Implementar según §13.3.x.

3. **Fase 3:** Actualizar `sm-orchestrator` con las 16 fases, 3 bucles, precondiciones por cadena (§5.1, §5.2, §5.3), estado `pausado`, `integration_mode`, y Etapa B/C OpenSpec. Implementar según §13.5.

   **Precondición de consistencia:** Las tareas del paso 3 (orchestrator) y del paso 6 (skills 05–08 de causa) deben commitearse en el mismo commit o en commits consecutivos sin pruebas intermedias. De lo contrario, el sistema queda inconsistente: el orchestrator reescrito no bifurca por modo, pero las skills 05–08 conservan su rama `solution-mode` heredada del diseño anterior. Esta inconsistencia haría que el sistema emitiera errores de fase o bucles infinitos durante la ejecución.

4. **Fase 4:** Actualizar los 4 perfiles (`sm-profile-corrective`, `sm-profile-adaptive`, `sm-profile-perfective`, `sm-profile-preventive`) con `phase_policy matrix` de 16 entries. Implementar según §13.4.x.

5. **Fase 5:** Actualizar la plantilla `case.md` con 16 entries de `phase_policy` y `phases`, más `case_run`, `case_paused_at`, `case_resumed_at`, `integration_mode`. Implementar según §13.7.1.

6. **Fase 6:** Actualizar `phase-policy-schema.md` (16 claves válidas). Implementar según §13.6.1. Este paso se ejecuta en el mismo commit atómico que el paso 3 (ver Precondición de consistencia).

7. **Fase 7:** Actualizar `artifact-conventions.md` (campo `chain` en frontmatter, rango NN ∈ 01..18 con 09-10 vacantes). Implementar según §13.6.3.

8. **Fase 8:** Actualizar `.claude/CLAUDE.md` (scientific_maintenance section: rango 01..18, estado `pausado`, precondiciones de cadena y cierre). Actualizar `scientific-method-and-openspec-integration.md` a v0.6 (frontera de Etapa B en fase 17). Implementar según §13.8.

**Rollback:** Si el usuario rechaza la migración tras apply, `git revert` del commit de migración revierte todos los archivos al estado anterior. Los casos en disco que usaron el nuevo sistema no se revierten (son un efecto colateral de la migración, no del change en sí).

**Verificación incremental:** Tras cada paso de implementación, verificar que los artefactos del sistema SM siguen siendo válidos con `openspec validate --change <caso>`. No ejecutar `openspec update`.