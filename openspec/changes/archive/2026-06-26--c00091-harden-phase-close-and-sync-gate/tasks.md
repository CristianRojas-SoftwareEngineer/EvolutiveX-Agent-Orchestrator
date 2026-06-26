## 1. Gate post-synchronize (GAP 1)

- [ ] 1.1 Extender `ARTIFACT_ORDER` en `scripting/openspec/verify-stage-completion.ts` añadiendo `'synchronized'` como quinto nivel, actualizando el tipo derivado y la validación de `--through`
- [ ] 1.2 Implementar la rama de verificación para `--through synchronized`: leer el campo `status` del `.openspec.yaml` del change y verificar que es `synchronized` (o el valor canónico que synchronize escribe); emitir diagnóstico legible si falla
- [ ] 1.3 Actualizar `.claude/agents/closer-specification-delta.md` para invocar `npm run openspec:verify-stage-completion -- --change "<change>" --through synchronized` entre las etapas synchronize y archive

## 2. Script compartido `close-phase.ts` (GAP 2)

- [ ] 2.1 Crear `scripting/openspec/close-phase.ts` con parámetros `--phase <explorer|planner|implementer|closer>`, `--change <name>` y `--duration-ms <n>` (número finito ≥ 0 proveniente del harness)
- [ ] 2.2 Implementar en `close-phase.ts`: validación de `--duration-ms` (falla exit 1 si no es número finito), luego (a) `writePhaseMarker(phase, change)` importado de `read-phase-marker.ts`, (b) escritura atómica del sidecar `openspec/.workbench/<phase>.timings.json` con `durationMs` numérico, (c) limpieza de workbench si `--phase=closer`
- [ ] 2.3 Añadir el npm script `openspec:close-phase` en `package.json` apuntando a `tsx scripting/openspec/close-phase.ts`

## 3. Migración de subagentes a `close-phase.ts` (GAP 2 — 4 archivos)

- [ ] 3.1 Migrar `.claude/agents/explorer-specification-delta.md`: reemplazar el bloque `node -e` inline de timings + marcador por invocación única a `npm run openspec:close-phase -- --phase explorer --change "<change>" --duration-ms <n>` donde `<n>` es el `duration_ms` real del harness
- [ ] 3.2 Migrar `.claude/agents/planner-specification-delta.md`: ídem con `--phase planner`
- [ ] 3.3 Migrar `.claude/agents/implementer-specification-delta.md`: ídem con `--phase implementer`
- [ ] 3.4 Migrar `.claude/agents/closer-specification-delta.md`: ídem con `--phase closer` (la limpieza de workbench queda encapsulada en el script)

## 4. Fix tipo `durationMs` en explorer (GAP 3)

- [ ] 4.1 Verificar que la migración de la tarea 3.1 elimina el placeholder `durationMs: '<%= it.harnessDurationMs %>'` entre comillas; confirmar que `close-phase.ts` recibe `--duration-ms` como número entero (no string) y lo escribe como número en el JSON del sidecar
- [ ] 4.2 Si el fix no queda subsumido por 3.1, corregir manualmente la línea 168 de `.claude/agents/explorer-specification-delta.md` quitando las comillas del valor de `durationMs`

## 5. Reconciliación de doc del orquestador (GAP 4)

- [ ] 5.1 Reconciliar el timing del orphan check (4a): establecer en `.claude/agents/orchestrate-specification-delta.md` un único punto de verdad (Step 0 antes de explore, o después del planner handoff) y eliminar la referencia contradictoria
- [ ] 5.2 Documentar la semántica de `expected=null` en el orphan check (4b): añadir una nota que explique que `null` significa "no se espera ningún valor previo; si existe uno, es un change huérfano"
- [ ] 5.3 Documentar el gate `create-plan` en modo GUIDED (4c): añadir la descripción del comportamiento en GUIDED (análogo a la descripción ya existente para AUTO)
- [ ] 5.4 Aclarar el manejo de `NEEDS_DECISION`/`resumeToken` procedente de explore pre-change (4d): documentar la limitación o el comportamiento correcto para que el orquestador sepa cómo manejar este caso
- [ ] 5.5 Documentar en `.claude/agents/orchestrate-specification-delta.md` que el orquestador emite la línea `Fase duración` en cada transición leyendo el sidecar `<phase>.timings.json`; si el sidecar es inválido (ausente, malformado o `durationMs` no finito), el orquestador hace fallback a la duración real del harness (`tool_result.usage.duration_ms`)

## 6. Criterios de aceptación (verificación post-implementación)

- [ ] 6.1 Ejecutar `npm run openspec:close-phase -- --phase explorer --change <test-change> --duration-ms 174911` y verificar que el sidecar resultante tiene `durationMs: 174911` (número, no string) y `durationMs > 0`
- [ ] 6.2 Ejecutar `npm run openspec:close-phase -- --phase planner --change <test-change> --duration-ms abc` y verificar que el script falla con exit 1 y no escribe el sidecar
- [ ] 6.3 Verificar que ninguno de los 4 archivos de definición de subagente contiene bloques `node -e` para escritura de timings o marcador tras la migración (grep sobre los 4 archivos .claude/agents/)
- [ ] 6.4 Ejecutar el gate `npm run openspec:verify-stage-completion -- --change <change-sincronizado> --through synchronized` sobre un change en estado `synchronized` y verificar exit 0; ejecutarlo sobre un change en estado `in-progress` y verificar exit 1
- [ ] 6.5 Verificar que el closer invoca el gate `--through synchronized` ANTES de `archive` en su definición de agente
- [ ] 6.6 Verificar que la línea 168 de `.claude/agents/explorer-specification-delta.md` no contiene `durationMs` entre comillas de string (grep `durationMs.*'` en el archivo)
