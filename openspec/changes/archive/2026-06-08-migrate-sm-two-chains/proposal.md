## Why

El sistema actual de mantenimiento científico (`docs/proposals/scientific-maintenance.md` v1.0) modela **una única cadena de 10 fases** que alterna internamente entre "causa-mode" y "solution-mode". Esto introdujo ambigüedades estructurales: las fases 05–08 bifurcaban su lógica según el modo, la sección `## Solution comparison` era condicional, y el bucle de refutación de causa se solapaba con el de soluciones. El caso `20260607-clean-modules-windows` evidenció el gap: la fase 09 emitió decisiones arquitectónicas sin haber comparado trade-offs entre alternativas, y la implementación divergió del plan en Etapa B. La corrección arquitectónica correcta, documentada en `docs/proposals/new-scientific-maintenance.md` v0.6, es **separar físicamente** la búsqueda de causa y la búsqueda de solución en dos cadenas especializadas sin bifurcación interna.

## What Changes

- **Nueva cadena de solución (fases 11–16):** 6 skills nuevas (`sm-phase-solution-*`) que operan exclusivamente sobre el espacio de hipótesis de solución con su propio contrato y artefactos.
- **Renumeración de fases de cierre:** antiguas fases 09 y 10 → 17 y 18. La frontera de Etapa B pasa de "fase 09" a "fase 17".
- **Actualización del orquestador:** conoce las 16 fases (rango 01..18 con 09–10 vacantes), los 3 bucles (A, B, C), precondiciones por cadena, estado `pausado`, `integration_mode`, y la integración OpenSpec corregida.
- **Perfiles ampliados:** `phase_policy matrix` de 10 a 16 entries en cada uno de los 4 perfiles.
- **Plantillas y referencias actualizadas:** `case.md` (16 entries, nuevos campos), `phase-artifact.md` (campo `chain`), `phase-policy-schema.md` (16 claves válidas).
- **Eliminación de lógica de modo interno:** las fases 05–08 de causa pierden la bifurcación `solution-mode`; operan solo sobre el eje de causa.
- **Corrección de integración SM↔OpenSpec:** la frontera de Etapa B se renombra de "fase 09" a "fase 17" en `docs/proposals/scientific-method-and-openspec-integration.md` (actualización a v0.6).

## Capabilities

### New Capabilities

- `scientific-maintenance-two-chains`: Sistema de mantenimiento científico de dos cadenas secuenciales (causa 01–08, solución 11–16, cierre 17–18) con 3 bucles de iteración (A: refutación de causa, B: batch comparativo de solución, C: re-apertura post-pausa). Define 16 fases con contrato propio; la cadena de solución abre solo si la fase 08 confirma una causa. Fase 17 consume datos de ambas cadenas y emite uno de tres veredictos de cierre (a/b/c). El estado `pausado` permite re-apertura con `case_run` incrementado.

### Modified Capabilities

- `scientific-maintenance`: El perfil existente (v1.0) se extiende de 10 a 16 entries en `phase_policy matrix`; las fases 05–08 pierden bifurcación por modo; la frontera de integración con OpenSpec pasa de fase 09 a fase 17.

## Impact

**Dentro del alcance:**
- `.claude/skills/sm-*` — 23 archivos según la tabla §11.2 del doc fuente (1 orquestador modificado, 4 perfiles ampliados, 8 skills de causa actualizadas, 6 skills de solución nuevas, 2 skills de cierre renumeradas, 2 plantillas, 5 referencias, CLAUDE.md).
- `docs/proposals/scientific-method-and-openspec-integration.md` — actualización de "fase 09" a "fase 17" como frontera de Etapa B (v0.3 → v0.6).

**Fuera del alcance:**
- `maintenance-cases/` — sin cambios; los casos existentes siguen el workflow anterior.
- `routing/`, `src/` — sin cambios.
- `openspec update` — no se ejecuta en este change.
- Cualquier otra modificación no listada en la tabla §11.2 del doc fuente.

**Capas PKA:** este cambio no afecta la arquitectura de ejecución (capas 1–5-user-interfaces). Es una migración del sistema de proceso (skills SM) y de su documentación de integración.