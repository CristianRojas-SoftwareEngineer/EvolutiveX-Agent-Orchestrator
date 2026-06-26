## Context

El script `scripting/openspec/enforce-auto-pipeline.mts` implementa el backstop determinista del pipeline AUTO: un hook `Stop` que bloquea la cesión del turno al usuario mientras hay un pipeline en vuelo. El script tiene dos capas: la función pura `decideAutoPipeline` (lógica de decisión sin I/O) y el envoltorio `main` (efectos de filesystem). El sentinel `openspec/.workbench/auto-pipeline.json` es el canal de estado entre el orquestador, los subagentes y el hook.

**Agujero 1 — readSentinel rechaza sentinel con `change: null`**: La función `readSentinel` (o la validación del sentinel en la capa de efectos) considera inválido el sentinel cuando el campo `change` no es un string. Durante la fase explorer (stage 1), el id del change aún no ha sido minteado, por lo que el orquestador escribe `change: null` o lo omite. Resultado: `readSentinel` retorna null → la rama (a) "sin sentinel" se activa → el backstop está inoperante durante toda la fase explorer.

**Agujero 2 — writeHalt no borra el sentinel**: Al disparar la rama (d) del loop-guard, el envoltorio escribe `auto-pipeline.halt.json` pero deja `auto-pipeline.json` intacto. El siguiente turno del hook lee el sentinel (válido), detecta el halt (rama b) y retorna `{block:false, effect:'none'}` — correcto. Pero si el orquestador resuelve el halt (borra `halt.json`) sin reescribir el sentinel, el hook vuelve a la rama (e) con un sentinel congelado y el loop-guard vuelve a disparar inmediatamente, sin oportunidad de rearme limpio. En la práctica el sentinel viejo acumula un `stuckCount` elevado y el backstop queda permanentemente en modo halt tras cada ciclo.

## Goals / Non-Goals

**Goals:**

- Que `readSentinel` acepte `change: null` cuando `mode === 'auto'` y el sentinel contiene `phase` y `stage` válidos (fase explorer).
- Que `applyEffect` en el case `writeHalt` borre el sentinel (`auto-pipeline.json`) después de escribir el halt (`auto-pipeline.halt.json`), permitiendo el rearme limpio del backstop.
- Añadir tests para ambos escenarios en `tests/scripting/openspec/enforce-auto-pipeline.test.ts`.

**Non-Goals:**

- No se modifica la función pura `decideAutoPipeline` ni su firma.
- No se cambia la lógica de ninguna otra rama (a, b, c, e).
- No se modifican scripts de orquestador, subagentes u hooks distintos al envoltorio de `enforce-auto-pipeline.mts`.

## Decisions

### Decisión 1: readSentinel — validación condicional de `change`

**Elegida**: la validación de `change` pasa de obligatoria-siempre a condicional por fase:
- Si `phase === 'explorer'` (o el equivalente de stage 1), `change` puede ser `null` o ausente.
- Para cualquier otra fase (stage ≥ 2), `change` debe ser un string no vacío.

**Alternativa descartada — aceptar `change: null` en todas las fases**: demasiado permisivo; un sentinel sin change en fase planner o posterior indica corrupción.

**Alternativa descartada — hacer que el orquestador escriba un placeholder de change**: requiere cambiar el orquestador y rompe la invariante de que el change solo se minta en la fase create. El fix en readSentinel es más quirúrgico y aislado.

### Decisión 2: writeHalt — borrar sentinel tras escribir halt

**Elegida**: en `applyEffect` case `writeHalt`, tras escribir `auto-pipeline.halt.json`, el envoltorio borra `auto-pipeline.json` usando `fs.rmSync` (o `unlinkSync`) con `{force: true}`. El borrado es fire-and-forget; si falla (el archivo ya no existe), se ignora silenciosamente.

**Alternativa descartada — modificar la función pura para retornar un efecto compuesto `writeHaltAndDeleteSentinel`**: rompe la simetría de `DecisionEffect` y complica el tipo. Mantener la lógica de borrado en el envoltorio (que ya tiene acceso a fs) es más limpio.

**Alternativa descartada — dejar el sentinel y confiar en que el orquestador lo reescriba**: el orquestador no tiene garantía de reescribir el sentinel con un `stuckCount` limpio; el agujero persiste.

## Risks / Trade-offs

- **Risk: borrado del sentinel en writeHalt puede interferir si el orquestador actúa en paralelo** → Mitigation: el hook `Stop` se ejecuta sincrónicamente después de que el turno termina; no hay concurrencia real con el orquestador en ese instante. El borrado con `force:true` es seguro aunque el archivo ya no exista.

- **Risk: `readSentinel` con `change: null` podría aceptar sentinels corruptos en fases posteriores** → Mitigation: la condición es estricta: se requiere `phase === 'explorer'` (o equivalente de stage 1) para permitir `change: null`; cualquier otra fase continúa requiriendo `change` como string.

## Migration Plan

No hay migración de datos ni despliegue especial. Los dos cambios son in-place en `enforce-auto-pipeline.mts`:

1. Localizar la validación de `change` en `readSentinel` (o el bloque de validación del sentinel en el envoltorio) y añadir la condición de fase.
2. Localizar el case `writeHalt` en `applyEffect` y añadir la llamada a `fs.rmSync(sentinelPath, { force: true })` tras escribir el halt.
3. Añadir los dos casos de test en `enforce-auto-pipeline.test.ts`.
4. Verificar que los tests existentes siguen pasando (`npm test` o el comando equivalente del proyecto).

Rollback: revertir los dos cambios en `enforce-auto-pipeline.mts`. No hay estado persistente que limpiar.

## Open Questions

Ninguna. Ambos fixes son quirúrgicos y las decisiones de diseño están resueltas.
