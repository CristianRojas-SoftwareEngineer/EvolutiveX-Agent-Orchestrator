---
name: clean-modules-windows-atomicity-2026-06
description: rimraf en Windows 11 no es transaccional (defecto de atomicity); el flujo SM previo no iteraba el espacio de soluciones antes de emitir la spec (gap metodológico); la corrección correcta es separar causa y solución en dos cadenas especializadas, no en modos internos. Solución: script dedicado que mata procesos con handles (esbuild, vitest; no node para evitar cascada al gateway) antes de rimraf y verifica estado post-borrado.
metadata:
  type: defect-class
  component: scripting/clean-modules
  defect-class: atomicity
  profile: corrective
---

# Lección: rimraf no garantiza atomicidad transaccional en Windows

## Root cause

`rimraf` en Windows 11 (v6.1.3) no garantiza atomicidad transaccional. Cuando el borrado de `node_modules/` falla por un lock (archivo en uso por proceso con handle abierto), el directorio queda en **estado parcial** — parcialmente borrado, corrupto. rimraf sale con código 1 pero no revierte lo ya borrado.

El comportamiento en el experimento:
- 1 archivo bloqueado por proceso PowerShell detached.
- `npm run clean:modules` → exit code 1, 350 items restantes de ~1000.
- `node_modules/` corrupto, `node_modules/.bin/` vacío.

## Por qué no es silent failure

La hipótesis original H1 ("`fixEPERM` silently gives up") fue refinada: rimraf sí propagó el error (exit 1). El problema no es que rimraf silenciosamente ignore el error — es que **no hay rollback transaccional**. Cuando falla a mitad, ya borró 650 items y no puede revertirlos.

## Cómo aplicar la solución

1. **Crear `scripting/clean-modules.ts`** dedicado que:
   - En Windows: mate procesos con handles (`esbuild`, `vitest` — el script no mata `node` para evitar cascadear al gateway de Claude Code) antes de rimraf.
   - Ejecute rimraf.
   - Verifique estado post-borrado: si `node_modules/` existe con items restantes, ejecutar `npm install` y reportar.
   - En otros entornos: delegar directamente a rimraf.

2. **Actualizar `package.json`**:
   ```json
   "clean:modules": "tsx scripting/clean-modules.ts"
   ```

3. **Actualizar `verify-config.ts`**:
   - El step `clean-modules` ya usa `verifier: 'path-absent-node-modules'` — sigue funcionando con el nuevo script si este garantiza que el directorio se elimina completamente o falla con exit no-cero.

## Nota sobre retry de rimraf

`retryBusy` tiene `MAXRETRIES = 10` para `EBUSY`/`EMFILE`/`ENFILE` con backoff máximo de 200ms. El problema no es la cantidad de retries sino la falta de rollback cuando todas las retries se agotan.

**Why:** El mecanismo de retry de rimraf funciona para locks transitorios, pero cuando el lock persiste más allá de los retries, el directorio queda corrupto. La solución correcta es prevenir los locks antes de rimraf (matando procesos) y detectar el estado corrupto post-borrado.

## Gap metodológico detectado

El caso `20260607-clean-modules-windows` recorrió las diez fases del flujo SM con rigor formal
pero su fase 09 emitió decisiones arquitectónicas (qué procesos matar, cómo recuperarse) sin
haber medido trade-offs entre alternativas. La consecuencia fue que la implementación divergió
del plan en Etapa B: las decisiones D2/D3 de la fase 09 chocaron con la realidad (cascada al
gateway, bloqueo del padre) en `openspec-apply`, obligando a divergir del plan y dejando los
artefactos sin sincronizar con el código.

**Causa raíz del gap:** las fases 03–08 estaban diseñadas para iterar el espacio de causas
(qué produjo el defecto), no el de soluciones. Cuando la causa quedó confirmada, el agente
sal tó a la primera idea de fix sin haber comparado alternativas.

**Regla a futuro:** la fase 09 no debe emitir la spec validada si `08-analysis.md` no
contiene una sección `## Solution comparison` con veredicto de ganadora y justificaciones de
descarte. Esta precondición está ahora documentada en:
- `sm-orchestrator` paso 6.1 (precondición de Etapa B)
- `sm-phase-conclusion` procedimiento paso 6 (verificación antes de emitir spec)
- `docs/proposals/scientific-method-and-openspec-integration.md` §5.4.1 (bucle del espacio
  de soluciones como sub-bucle paralelo)

El campo `solution_hypotheses` en `case.md` (plantilla) y la sección `## Solution comparison`
en `08-analysis.md` son los mecanismos que hacen cumplir esta regla.

## Transición a dos cadenas (2026-06-08)

La "solución de modos" (commits `46de4ea`, `ca0b86e`, `3c42a93`) fue el primer intento de cerrar
el gap metodológico descrito arriba. La idea era extender las fases 03–08 con un modo dinámico
detectado desde el estado del artefacto: cuando 03–08 operaban sobre el espacio de causas, eran
"causa-mode"; cuando operaban sobre el espacio de soluciones, eran "solution-mode". El mismo
`SKILL.md` bifurcaba su lógica internamente.

El resultado fue insuficiente. Las fases bifurcaban su lógica internamente (violación del
principio §2.1 de separación estricta de roles), las re-entry rules del Bucle A y del nuevo
bucle de soluciones eran distintas y se solapaban, la sección `## Solution comparison` quedaba
como contenido condicional dentro de `08-analysis.md` (a veces presente, a veces no), y el modo
se detectaba dinámicamente desde el estado del artefacto —lo que hacía al sistema frágil
ante refutaciones que cruzaban ambos espacios.

La corrección correcta, propuesta en `docs/proposals/new-scientific-maintenance.md` v0.1
(borrador), es **separar físicamente las dos búsquedas en dos cadenas de fases especializadas**:

- **Cadena de causa (01–08):** método científico sobre el espacio de hipótesis de causa. Sin
  cambios estructurales. Bucle de refutación interna (Bucle A) preserva el comportamiento v1.0.
- **Cadena de solución (11–16):** segundo método científico, especializado y físicamente
  separado, sobre el espacio de hipótesis de solución. Cada fase tiene su propio `SKILL.md`,
  su propio artefacto, su propio contrato. Cero modos internos. Bucle de refutación interna
  de solución (Bucle B) opera solo sobre 12–16.
- **Cierre global (17–18):** conclusión y comunicación únicas al final, con datos de ambas
  cadenas. Las antiguas 09 y 10 se renumeran a 17 y 18.
- **Re-apertura post "no resuelto" (Bucle C):** caso en estado `pausado`; el orquestador
  ofrece re-ejecutar 03–08 con nuevo contexto, conservando 01–02.

El contrato `phase-policy-schema.md` no cambia; el `case_mode` no cambia; el `CHANGELOG.md`
derivado no cambia. Lo que cambia es la cantidad de entries en `phase_policy matrix` (de 10 a
18) y los archivos del sistema `sm-*` (6 skills nuevas + 1 orquestador modificado + 4 perfiles
ampliados + 2 skills renumeradas + plantillas y referencias actualizadas). La implementación
se materializará en un plan de migración aparte, **solo cuando el usuario apruebe el diseño**
del nuevo documento. Hasta entonces, el sistema v1.0 sigue siendo el contrato vigente.