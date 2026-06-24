# orchestrator-stage-timings

## Goal

Persistir metricas de duracion por fase y por etapa en sidecars `.timings.json` y presentarlas en la plantilla D6, sin alterar el comportamiento funcional del pipeline specification-delta.

## Schema

El sidecar `openspec/.workbench/<phase>.timings.json` tiene el siguiente schema:

```json
{
  "change": "c00083-orchestrator-stage-timings",
  "stages": [
    {
      "stage": 1,
      "slug": "explore-specification-delta",
      "startedAt": "2026-06-24T10:00:00.000Z",
      "completedAt": "2026-06-24T10:00:45.000Z",
      "durationMs": 45000
    }
  ]
}
```

Los campos `phaseStartedAt`, `phaseCompletedAt` y `phaseDurationMs` **no** son obligatorios en el sidecar; el orquestador los calcula al recibir el handoff.

Para stages[7] (apply) y stages[8] (verify), la entrada de `stages[]` incluye `iterations[]`:

```json
{
  "stage": 7,
  "slug": "apply-specification-delta",
  "startedAt": "2026-06-24T10:02:00.000Z",
  "completedAt": "2026-06-24T10:03:00.000Z",
  "durationMs": 60000,
  "iterations": [
    {
      "applyMs": 60000,
      "verifyMs": 120000,
      "passed": true
    }
  ]
}
```

El campo `iterations` esta presente incluso cuando el array es vacio: `"iterations": []`.

## Requirements

### Requirement: Escritura atomica del sidecar por cada subagente de fase

Cada subagente de fase SHALL escribir su sidecar `openspec/.workbench/<phase>.timings.json` atomicamente (writeFileSync a `.tmp` + renameSync) antes de retornar al orquestador.

#### Scenario: Subagente retorna exitosamente

**WHEN** el subagente completa su ejecucion
**THEN** escribe el sidecar con todos los stages completados y retorna

#### Scenario: Subagente retorna sin escribir sidecar (crash)

**WHEN** el subagente completa sin escribir el sidecar
**THEN** la plantilla D6 muestra "—" para esa fase (fail-open)

---

### Requirement: Schema del sidecar

El schema del sidecar SHALL incluir `change` (string) y `stages[]` (array) donde cada elemento contiene `stage` (number), `slug` (string), `startedAt` (string ISO 8601), `completedAt` (string ISO 8601), y `durationMs` (number). Para stages 7 y 8, SHALL incluir `iterations[]`.

#### Scenario: Sidecar valido y completo

**WHEN** el orquestador lee un sidecar con todos los campos requeridos
**THEN** el parsing es exitoso y todos los campos estan disponibles

#### Scenario: Sidecar con campos desconocidos

**WHEN** el sidecar contiene campos adicionales no definidos en el schema
**THEN** el reader ignora los campos desconocidos y el parsing es exitoso (backward compatibility)

---

### Requirement: Iterations para apply y verify

El sidecar del implementer SHALL incluir `iterations[]` en la entrada de `stages[7]` (apply) y `stages[8]` (verify), donde cada iteracion contiene `applyMs`, `verifyMs` y `passed`.

#### Scenario: Una iteracion completa del loop apply/verify

**WHEN** el implementer ejecuta una iteracion de apply seguida de verify exitoso
**THEN** `iterations[0]` contiene `applyMs`, `verifyMs` y `passed: true`

#### Scenario: Ninguna iteracion ejecutada aun

**WHEN** el implementer escribe el sidecar antes de ejecutar ninguna iteracion
**THEN** el campo `iterations` esta presente como array vacio `[]`

---

### Requirement: Lectura en modo open y calculo de phaseDurationMs

El orquestador SHALL leer el sidecar en modo open al cerrar cada fase y SHALL calcular `phaseStartedAt`, `phaseCompletedAt` y `phaseDurationMs` a partir de los datos del sidecar y del harness del Agent tool:

- `phaseStartedAt = stages[0].startedAt` si existe; si no, usa `startedAt` del harness del `Agent(...)` si esta disponible; si no, `null`.
- `phaseCompletedAt = stages[stages.length-1].completedAt` si existe; si no, `null`.
- `phaseDurationMs = phaseCompletedAt - phaseStartedAt` si ambos estan disponibles; si no, usa `duration_ms` del harness del `Agent(...)`.

#### Scenario: Sidecar presente con todas las entradas

**WHEN** el sidecar existe y todas las entradas de `stages[]` tienen `startedAt` y `completedAt`
**THEN** `phaseDurationMs` se calcula como la diferencia entre `stages[0].startedAt` y `stages[last].completedAt`

#### Scenario: Sidecar ausente

**WHEN** el sidecar no existe
**THEN** `phaseDurationMs` se calcula desde `duration_ms` del harness del `Agent(...)`

#### Scenario: Sidecar corrupto

**WHEN** el sidecar existe pero tiene JSON invalido
**THEN** `phaseDurationMs` se calcula desde `duration_ms` del harness del `Agent(...)`

---

### Requirement: Inyeccion en plantilla D6

El orquestador SHALL inyectar las duraciones en la plantilla D6 mostrando "—" si el sidecar esta ausente o corrupto.

#### Scenario: Sidecar valido

**WHEN** el sidecar existe y es valido
**THEN** la plantilla D6 muestra las duraciones de fase y etapa actual

#### Scenario: Sidecar ausente o corrupto

**WHEN** el sidecar no existe o el parsing falla
**THEN** la plantilla D6 muestra "—" para las duraciones

---

### Requirement: Cleanup en freeze del closer

El closer SHALL eliminar los sidecars `*.timings.json` de los 4 phases durante el freeze, junto con los marcadores `.done` y el sentinel AUTO.

#### Scenario: Freeze ejecuta exitosamente

**WHEN** el closer ejecuta el freeze
**THEN** todos los archivos `*.timings.json` son eliminados del workbench

---

### Requirement: Reader soporta modo closed y open

`readPhaseSidecar` SHALL soportar `mode: 'closed'` (lanza excepcion en MarkerAbsent/MarkerCorrupt/MarkerEmpty) y `mode: 'open'` (retorna `null` en esos casos).

#### Scenario: Modo open con archivo ausente

**WHEN** `readPhaseSidecar(phase, '.timings.json', 'open')` se invoca con archivo ausente
**THEN** retorna `null`

#### Scenario: Modo closed con archivo ausente

**WHEN** `readPhaseSidecar(phase, '.done', 'closed')` se invoca con archivo ausente
**THEN** lanza `MarkerAbsent`

#### Scenario: Modo open con JSON corrupto

**WHEN** `readPhaseSidecar(phase, '.timings.json', 'open')` se invoca con JSON invalido
**THEN** retorna `null`

#### Scenario: Modo closed con JSON corrupto

**WHEN** `readPhaseSidecar(phase, '.done', 'closed')` se invoca con JSON invalido
**THEN** lanza `MarkerCorrupt`

## Verification

1. Suite de tests `tests/scripting/openspec/orchestrator-stage-timings.test.ts` cubre: sidecar valido (T1), ausente (T2), corrupto (T3), vacio (T4), `durationMs` negativo (T5), `durationMs` > 24h (T6), valores NaN (T7), iteraciones con 1 iteracion (T8), iteraciones vacias (T9), iteraciones con valores absurdos (T10), modo closed sobre `.done` (T11), delegacion de `readPhaseMarker` (T12).
2. `npm test` del proyecto completo: 0 regresiones.
3. `npm run openspec:verify-stage-completion -- --change "c00083-orchestrator-stage-timings" --through specs` sale con 0.
4. `npm run openspec:verify-stage-completion -- --change "c00083-orchestrator-stage-timings" --through design` sale con 0.
5. `npm run openspec:verify-stage-completion -- --change "c00083-orchestrator-stage-timings" --through tasks` sale con 0.
