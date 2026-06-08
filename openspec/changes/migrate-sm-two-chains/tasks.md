## 1. Añadir las 6 skills de solución (fases 11–16)

**Precondición:** Las tareas 1.1–1.6 pueden ejecutarse en paralelo o en cualquier orden entre sí, pero el grupo no es verificable como sistema invocable hasta que la tarea 3.1 (orchestrator actualizado) las referencie en su lógica de 3 bucles. Tras completar la tarea 3.1, ejecutar `openspec validate --change migrate-sm-two-chains` para confirmar la integridad referencial de las 6 skills nuevas.

- [ ] 1.1 Crear `.claude/skills/sm-phase-solution-research/SKILL.md` — fase 11, mapear espacio de soluciones; implementar según §13.1.1 del doc fuente
- [ ] 1.2 Crear `.claude/skills/sm-phase-solution-hypothesis/SKILL.md` — fase 12, formular hipótesis falsables de solución con predicción observable y criterio de refutación; implementar según §13.1.2
- [ ] 1.3 Crear `.claude/skills/sm-phase-solution-experiment-design/SKILL.md` — fase 13, diseñar experimento comparativo único con métricas comunes, condiciones iniciales idénticas y rollback entre ejecuciones; implementar según §13.1.3
- [ ] 1.4 Crear `.claude/skills/sm-phase-solution-execution/SKILL.md` — fase 14, ejecutar hipótesis secuencialmente en orden de prioridad con rollback explícito entre ejecuciones; implementar según §13.1.4
- [ ] 1.5 Crear `.claude/skills/sm-phase-solution-data-collection/SKILL.md` — fase 15, capturar y normalizar métricas de cada hipótesis a schema común (tabla comparativa); implementar según §13.1.5
- [ ] 1.6 Crear `.claude/skills/sm-phase-solution-analysis/SKILL.md` — fase 16, análisis comparativo y veredicto de solución ganadora; emitir `## Solución ganadora` (condicional) y `## Hipótesis descartadas` (obligatoria); implementar según §13.1.6

## 2. Renumerar skills de cierre (09→17, 10→18)

- [ ] 2.1 Renumerar `.claude/skills/sm-phase-conclusion/SKILL.md` de fase 09 a fase 17; consumir datos de cadenas 01–08 y 11–16; manejar tres rutas de cierre (a/b/c) y estado `pausado`; implementar según §13.3.1
- [ ] 2.2 Renumerar `.claude/skills/sm-phase-communication/SKILL.md` de fase 10 a fase 18; citar solución ganadora de `16-solution-analysis.md` en commit; manejar oferta Bucle C en comunicación de pausa; implementar según §13.3.2

## 3. Actualizar sm-orchestrator con 16 fases, 3 bucles y precondiciones

- [ ] 3.1 Actualizar `.claude/skills/sm-orchestrator/SKILL.md` — conocer rango 01..18 con 09–10 vacantes; implementar lógica de 3 bucles (A: refutación causa, B: batch comparativo solución, C: re-apertura post-pausa); precondiciones por cadena (§5.1, §5.2, §5.3); estado `pausado`; `integration_mode`; frontera de Etapa B en fase 17; implementar según §13.5

## 4. Actualizar 4 perfiles con phase_policy matrix de 16 entries

- [ ] 4.1 Actualizar `.claude/skills/sm-profile-corrective/SKILL.md` — `phase_policy matrix` con 16 entries (8 causa + 6 solución + 2 cierre); policy de cadena de solución y cierre según §6.1; implementar según §13.4.1
- [ ] 4.2 Actualizar `.claude/skills/sm-profile-adaptive/SKILL.md` — `phase_policy matrix` con 16 entries; policy de cadena de solución y cierre según §6.2; implementar según §13.4.2
- [ ] 4.3 Actualizar `.claude/skills/sm-profile-perfective/SKILL.md` — `phase_policy matrix` con 16 entries; policy de cadena de solución y cierre según §6.3; implementar según §13.4.3
- [ ] 4.4 Actualizar `.claude/skills/sm-profile-preventive/SKILL.md` — `phase_policy matrix` con 16 entries; policy de cadena de solución y cierre según §6.4; implementar según §13.4.4

## 5. Actualizar plantillas y referencias

- [ ] 5.1 Actualizar `.claude/skills/sm-orchestrator/templates/case.md` — `phase_policy` con 16 entries; `phases` con 16 entries; añadir campos `case_run`, `case_paused_at`, `case_resumed_at`, `integration_mode`; implementar según §13.7.1
- [ ] 5.2 Actualizar `.claude/skills/sm-orchestrator/templates/phase-artifact.md` — añadir campo `chain` en frontmatter (`cause`/`solution`/`closure`); implementar según §13.7.2
- [ ] 5.3 Actualizar `.claude/skills/sm-orchestrator/references/phase-policy-schema.md` — admitir 16 claves válidas (rango 01..18 con 09–10 vacantes); contrato por entry sin cambios estructurales; implementar según §13.6.1
- [ ] 5.4 Actualizar `.claude/skills/sm-orchestrator/references/artifact-conventions.md` — campo `chain` en frontmatter; rango `NN ∈ 01..18`; 3 bucles documentados; implementar según §13.6.3
- [ ] 5.5 Verificar `.claude/skills/sm-orchestrator/references/classification-guide.md` — confirmar ausencia de tokens "fase 09", "fase 10", "## Solution comparison", "09-conclusion", "10-communication"; si se encuentran, editarlos in-situ; si no, marcar como verificado
- [ ] 5.6 Verificar `.claude/skills/sm-orchestrator/references/knowledge-base.md` — confirmar ausencia de los mismos tokens; si se encuentran, editarlos in-situ; si no, marcar como verificado
- [ ] 5.7 Verificar `.claude/skills/sm-orchestrator/references/changelog.md` — confirmar ausencia de los mismos tokens; si se encuentran, editarlos in-situ; si no, marcar como verificado

## 6. Eliminar lógica de modo interno de skills de causa (05–08)

- [ ] 6.1 Actualizar `.claude/skills/sm-phase-experiment-design/SKILL.md` — eliminar bifurcación `solution-mode`; solo procedimiento de causa; sin cambios en numeración; implementar según §13.2.5
- [ ] 6.2 Actualizar `.claude/skills/sm-phase-experiment-execution/SKILL.md` — eliminar bifurcación `solution-mode`; solo procedimiento de causa; implementar según §13.2.6
- [ ] 6.3 Actualizar `.claude/skills/sm-phase-data-collection/SKILL.md` — eliminar bifurcación `solution-mode`; solo procedimiento de causa; implementar según §13.2.7
- [ ] 6.4 Actualizar `.claude/skills/sm-phase-analysis/SKILL.md` — emitir `## Causa confirmada` obligatoriamente (precondición para cadena de solución); eliminar lógica de modo dinámico; implementar según §13.2.8

## 7. Actualizar .claude/CLAUDE.md y documentación de integración

- [ ] 7.1 Actualizar `.claude/CLAUDE.md` (scientific_maintenance section) — rango 01..18 con 09–10 vacantes; estado `pausado`; precondiciones de cadena y cierre; implementar según §13.8
- [ ] 7.2 Actualizar `docs/proposals/scientific-method-and-openspec-integration.md` con alcance detallado: (a) renumerar "fase 09" → "fase 17" y "fase 10" → "fase 18" en todas las secciones (§3.3, §4.1, §4.3, §5.1, §5.2, §5.3, §5.4, §8.2, §9.1–§9.4); (b) actualizar cabecera del doc a v0.6 con changelog v0.3→v0.6; (c) insertar subsección "Adaptación al sistema de dos cadenas" al inicio del cuerpo con contenido de §12.2 del doc fuente v0.6 (3 bucles ortogonales, estado pausado, §12.2.4 modos de integración); (d) documentar los 3 bucles y estado pausado según §12.2

## 8. Verificación de la migración completa

- [ ] 8.1 Verificar que todas las 29 entradas de la tabla §11.2 fueron cubiertas por las tareas 1.1–7.2 (trazabilidad: cada archivo tiene una tarea asociada)
- [ ] 8.2 Ejecutar `openspec validate --change migrate-sm-two-chains` y confirmar que sale 0
- [ ] 8.3 Verificar que `openspec status --change migrate-sm-two-chains --json` muestra todos los artefactos (proposal, design, specs, tasks) en estado `done`
- [ ] 8.4 Crear caso de prueba temporal con perfil `corrective` en modo `full` para verificar que el nuevo sistema genera 16 entries en `phase_policy` y los nuevos campos en `case.md`. Limpiar el caso de prueba después de validar: borrar la carpeta `maintenance-cases/<id>/` o revertir el commit con la creación. El caso de prueba NO debe quedar en el repo.
- [ ] 8.5 Verificar: (a) que la plantilla `.claude/skills/sm-orchestrator/templates/phase-artifact.md` tiene el campo `chain` con valores `cause | solution | closure` en su frontmatter; (b) que el orquestador infiere `chain` del NN de fase si está ausente; (c) que las skills de causa (01–08) mencionan `chain: cause` en sus bloques `produces:` o referencias internas; (d) que las skills de solución (11–16) mencionan `chain: solution`; (e) que las skills de cierre (17–18) mencionan `chain: closure`. Las skills como archivos independientes no llevan `chain` en su frontmatter; la verificación se hace por contenido referenciado, no por frontmatter de skill.