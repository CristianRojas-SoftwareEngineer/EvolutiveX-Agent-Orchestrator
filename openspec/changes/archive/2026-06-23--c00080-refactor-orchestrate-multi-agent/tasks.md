## 1. Orquestador nativo

- [x] 1.1 Crear `.claude/agents/orchestrate-specification-delta.md` con frontmatter, descripción, herramientas y control de flujo
- [x] 1.2 Implementar mode selection (AUTO/GUIDED) en el orquestador con clasificación según criterios del skill original
- [x] 1.3 Implementar sentinel AUTO con campos `phase` (valores: explorer/planner/implementer/closer) y `stage` (valores 1–10) coexistentes; ownership: el orquestador actualiza `phase` (fire-and-forget) antes de cada spawn, el subagente actualiza `stage` (fire-and-forget) antes de cada invocación de skill
- [x] 1.4 Implementar bucle conductor: 4 spawns secuenciales, lectura del handoff JSON, validación de esquema, transición entre fases
- [x] 1.5 Implementar cierres del pipeline: eliminación del sentinel en fase `closer`, reporte final al usuario
- [x] 1.6 Implementar contratos de reporte (D6): reemplazar el `<output_template>` actual por la versión de doble línea `Fase [i/4] <phase-slug> / Etapa [j/10] <stage-slug>`; emitir el reporte en cada transición

## 2. Subagente Explorer

- [x] 2.1 Crear `.claude/agents/explorer-specification-delta.md` con frontmatter, declaración de herramientas, briefing y contrato de handoff
- [x] 2.2 Documentar el briefing que recibe del orquestador (reporte del usuario, modo, contexto de fase) y el handoff JSON que retorna
- [x] 2.3 Documentar el permiso excepcional de código de instrumentación temporal y la invariante de limpieza antes de retornar (`git status --short` vacío)
- [x] 2.4 Documentar la sub-invocación opcional del skill `investigate` para exploración estructurada
- [x] 2.5 Documentar el contrato de escritura de `stage` en el sentinel: fire-and-forget, justo antes de invocar el skill de etapa que corresponda (etapa 1)
- [x] 2.6 Documentar el template de reporte de fase: `Fase [1/4] explorer-specification-delta` al iniciar y al finalizar

## 3. Subagente Planner

- [x] 3.1 Crear `.claude/agents/planner-specification-delta.md` con frontmatter, declaración de herramientas, briefing y contrato de handoff
- [x] 3.2 Documentar el briefing que recibe (reporte del Explorador, slug sugerido, modo) y el handoff JSON que retorna (`change`, `apply_ready`, `artifacts`)
- [x] 3.3 Documentar la invocación secuencial de los 5 skills de etapa (create, propose, define, design, plan) vía herramienta `Skill`
- [x] 3.4 Documentar la ejecución de los tres gates de stage-completion (`--through specs`, `--through design`, `--through tasks`) como precondición para retornar
- [x] 3.5 Documentar el contrato de escritura de `stage` en el sentinel: fire-and-forget, justo antes de invocar cada uno de los 5 skills de etapa (etapas 2, 3, 4, 5, 6)
- [x] 3.6 Documentar el template de reporte de fase: `Fase [2/4] planner-specification-delta` al iniciar y al finalizar

## 4. Subagente Implementer

- [x] 4.1 Crear `.claude/agents/implementer-specification-delta.md` con frontmatter, declaración de herramientas, briefing y contrato de handoff
- [x] 4.2 Documentar el briefing que recibe (`<change-name>`, modo) y el handoff JSON que retorna (`change`, `verify`, `critical_findings`)
- [x] 4.3 Documentar el bucle interno `apply → verify` hasta `verify PASS`, con routing al skill `apply-specification-delta` ante cualquier CRITICAL
- [x] 4.4 Documentar la transmisión del verify hard gate (sin CRITICAL, sin test suite fallando) como precondición para handoff
- [x] 4.5 Documentar el contrato de escritura de `stage` en el sentinel: fire-and-forget, justo antes de invocar cada uno de los 2 skills de etapa (apply=7, verify=8), incluyendo las iteraciones del bucle apply↔verify
- [x] 4.6 Documentar el template de reporte de fase: `Fase [3/4] implementer-specification-delta` al iniciar y al finalizar

## 5. Subagente Closer

- [x] 5.1 Crear `.claude/agents/closer-specification-delta.md` con frontmatter, declaración de herramientas, briefing y contrato de handoff
- [x] 5.2 Documentar el briefing que recibe (`<change-name>`, modo) y el handoff JSON que retorna (`change`, `archive_path`, `commit`)
- [x] 5.3 Documentar la invocación de los 2 skills de etapa (synchronize, archive) vía herramienta `Skill` en orden
- [x] 5.4 Documentar la eliminación del sentinel AUTO como parte del freeze (el subagente retira el archivo al confirmar el archivado)
- [x] 5.5 Documentar el contrato de escritura de `stage` en el sentinel: fire-and-forget, justo antes de invocar cada uno de los 2 skills de etapa (synchronize=9, archive=10)
- [x] 5.6 Documentar el template de reporte de fase: `Fase [4/4] closer-specification-delta` al iniciar y al finalizar

## 6. Skill de exploración (sin cambios)

- [x] 6.1 Verificar que `.claude/skills/explore-specification-delta/SKILL.md` no requiere modificación: el framing "Stage 1 of 10" se preserva; la carga por el subagente Explorador es transparente al skill
- [x] 6.2 Verificar que la postura read-only, la sub-invocación opcional de `investigate`, y la escalada a `resolve-open-decisions` se mantienen sin cambios

## 7. Retiro del skill orquestador

- [x] 7.1 Eliminar `.claude/skills/orchestrate-specification-delta/SKILL.md` y su carpeta
- [x] 7.2 Verificar que ningún otro archivo del repo (CLAUDE.md, otros skills, scripts, docs) referencia el skill retirado

## 8. Validación del pipeline

- [x] 8.1 Probar el pipeline con un delta pequeño en modo GUIDED (validar encadenamiento de 4 subagentes, handoff JSON, briefing)
- [x] 8.2 Probar el pipeline con un delta pequeño en modo AUTO (validar sentinel `phase`, ausencia de pausas, eliminación del sentinel en fase `closer`)
- [x] 8.3 Verificar que `orchestrate-roadmap` sigue invocando al orquestador nativo sin cambios
- [x] 8.4 Validar que el sentinel en AUTO expone ambos campos (`phase` y `stage`) de forma coexistente: el lector puede inspeccionar `phase` para saber qué subagente está activo y `stage` para saber qué etapa del skill está en ejecución, sin asumir uno en función del otro
- [x] 8.5 Validar que el output del orquestador y los reportes de subagente siguen el contrato `Fase [i/4] <phase-slug> / Etapa [j/10] <stage-slug>` en cada transición, sin divergencia entre fases
