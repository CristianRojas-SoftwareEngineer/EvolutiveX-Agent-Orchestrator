## Why

El backstop determinista `scripting/openspec/enforce-auto-pipeline.mts` tiene dos agujeros que lo dejan inoperante en escenarios críticos: (1) rechaza el centinela cuando `change` es null/placeholder durante la fase explorer —antes de que el id sea minteado—, desactivando toda protección en esa fase; y (2) tras disparar un halt el centinela no se borra, de modo que el caso `haltPresent → allow effect:none` permite cada turno subsiguiente indefinidamente, dejando el backstop apagado de forma permanente tras el primer disparo.

## What Changes

- `readSentinel` (~línea 159) deja de rechazar el centinela cuando `change` es `null` y `mode === 'auto'` siempre que `phase` y `stage` sean válidos; `change` solo se exige desde la fase 2 en adelante.
- `applyEffect` case `writeHalt` borra el centinela tras escribir el halt, forzando que el siguiente turno caiga en la rama de centinela ausente y el backstop se rearme cuando el orquestador reescriba el centinela.
- Se añaden tests en `tests/scripting/openspec/enforce-auto-pipeline.test.ts` para ambos escenarios: (a) centinela con `change: null` en fase explorer es aceptado; (b) tras `writeHalt` el centinela queda ausente y el siguiente turno no genera halt permanente.

## Capabilities

### Modified Capabilities

- `pipeline-auto-continuation`: los requisitos de `readSentinel` (aceptar `change: null` en fase explorer) y de `applyEffect writeHalt` (borrar el centinela tras el halt para rearme) son modificaciones de comportamiento canónico ya definido en `openspec/specs/pipeline-auto-continuation/spec.md`.

## Impact

- `scripting/openspec/enforce-auto-pipeline.mts`: dos cambios quirúrgicos (readSentinel + applyEffect).
- `tests/scripting/openspec/enforce-auto-pipeline.test.ts`: dos nuevos casos de test.
- Sin impacto en otras capabilities, APIs, o dependencias externas.
