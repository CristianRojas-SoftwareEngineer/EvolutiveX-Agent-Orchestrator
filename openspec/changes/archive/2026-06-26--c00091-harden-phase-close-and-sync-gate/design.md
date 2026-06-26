## Context

El pipeline specification-delta tiene 10 etapas. Las etapas 1–6 (planner) y 7–8 (implementer) tienen gates deterministas que validan cada artefacto antes de avanzar. La etapa 9 (`synchronize`) mergeea las specs del delta en `openspec/specs/` y actualiza los docs; la etapa 10 (`archive`) cierra el change. Sin embargo, no existe ningún gate entre synchronize y archive: el closer invoca ambas secuencialmente sin validación intermedia. Adicionalmente, los efectos de cierre de fase (writePhaseMarker, escritura del timings sidecar, limpieza de workbench para el closer) están codificados como bloques `node -e` inline improvisados en cada definición de subagente, lo que produjo el defecto observado en c00090 (`writtenAt` en vez de `completedAt`). Un bug de tipo aislado (durationMs como string) subsiste en el explorer, y cuatro contradicciones de doc en el agente orquestador dificultan el mantenimiento.

**Defectos de timings observados en producción (c00091):**
- El sidecar `explorer.timings.json` registró `startedAt == completedAt` y `durationMs: 0` siendo que la fase tomó ~2m 55s reales (harness `duration_ms = 174 911`). El subagente rellenó el placeholder con valor sintético cero.
- El sidecar `planner.timings.json` registró incrementos redondos sintéticos (10s/20s/30s/60s/180s, total exacto 300 000 ms) en vez de la duración real (~9m 25s, 565 294 ms). El subagente inventó los valores inline.
- Consecuencia: el orquestador no puede presentar duraciones reales en la plantilla D6 porque los sidecars no son fiables.
- Causa raíz: cada subagente es responsable de calcular su propia duración, lo cual es estructuralmente imposible — el subagente no puede medir el tiempo que el harness tardó en ejecutarlo. La **fuente autoritativa de duración** es el orquestador, que recibe `duration_ms` en el `tool_result.usage` del Agent tool. El sidecar es un artefacto secundario/derivado que el subagente escribe con el valor que el orquestador le pasa.

**Estado actual relevante:**
- `scripting/openspec/verify-stage-completion.ts:10` — `ARTIFACT_ORDER = ['proposal','specs','design','tasks']`. El tipo `Artifact` deriva de este array; la función `readArtifactStatus` llama a `openspec status --json` que solo conoce estos cuatro artefactos.
- `scripting/openspec/read-phase-marker.ts` — exporta `writePhaseMarker(phase, change)` con escritura atómica (tmp + rename). Ya existe; ningún subagente debe re-implementarla.
- Las cuatro definiciones de subagente (explorer, planner, implementer, closer) tienen bloques `node -e` o código inline para escribir timings y el marcador.

## Goals / Non-Goals

**Goals:**
- Añadir un gate determinista post-synchronize (`--through synchronized`) que bloquee archive si synchronize no completó correctamente.
- Definir criterios verificables de "done" para el estado `synchronized`.
- Centralizar los efectos de cierre de fase en `scripting/openspec/close-phase.ts` y migrar las cuatro definiciones de subagente a invocarlo.
- Eliminar el bug de tipo `durationMs` (string → número) en el explorer como consecuencia de la migración.
- Reconciliar las cuatro contradicciones de doc en `orchestrate-specification-delta.md`.

**Non-Goals:**
- Cambiar la lógica funcional de `synchronize` o `archive`.
- Modificar el schema de timings en `openspec/specs/orchestrator-stage-timings/spec.md`.
- Modificar `enforce-auto-pipeline.mts` (backstop, cerrado en c00090).
- Añadir nuevos tests de integración.

## Decisions

### Decisión A — Gate post-synchronize: extender ARTIFACT_ORDER con `'synchronized'`

**Elegida:** extender `ARTIFACT_ORDER` en `scripting/openspec/verify-stage-completion.ts` añadiendo el nivel `'synchronized'` como quinto elemento.

**Rationale:** DRY — el closer ya usa `npm run openspec:verify-stage-completion -- --through tasks`; reutilizar el mismo comando con `--through synchronized` no requiere aprender un nuevo punto de entrada. La alternativa (script separado) duplicaría la infraestructura de gate.

**Trade-offs aceptados:** el tipo `Artifact` queda acoplado a un nivel que no es un artefacto de planificación sino un estado post-synchronize. Se mitiga documentando en el código que `'synchronized'` es el único nivel "post-plan" del array.

**Criterios de "done" para `synchronized` (verificables en disco):**

El gate `--through synchronized` pasa (exit 0) si y solo si se cumplen TODOS los siguientes predicados:

1. **Specs mergeadas**: para cada capability listada en el delta-spec (behavioral) o para cada item del record (non-canonical), existe el archivo `openspec/specs/<capability>/spec.md` en disco y no está vacío. Para deltas behavioral: el archivo contiene los requisitos integrados (las operaciones ADDED/MODIFIED/REMOVED del delta están reflejadas). Para deltas non-canonical: el record no-canonical existe en `openspec/specs/<area>/spec.md` si y solo si synchronize lo creó (para non-canonical, synchronize crea el archivo en el canon solo si así lo prescribe su lógica; el gate verifica al menos que el directorio `openspec/changes/<name>/` tiene su `.openspec.yaml` con `status: synchronized`).
2. **Status del change**: `openspec status --change <name> --json` devuelve `isComplete: true` o el campo `status` en `.openspec.yaml` es `synchronized`.

**Implementación práctica del gate `synchronized`:** dado que `openspec status --json` no expone un artefacto `synchronized`, el gate lo implementa comprobando directamente el campo `status` del `.openspec.yaml` del change (leído desde disco) en vez de llamar a `readArtifactStatus`. Si `status !== 'synchronized'` (u otro valor canónico que indique synchronize completado), el gate falla con un mensaje diagnóstico.

**Invocación por el closer:**
```bash
npm run openspec:verify-stage-completion -- --change "<change>" --through synchronized
```

### Decisión B — API de `close-phase.ts`: parámetro `--phase`

**Elegida:** parámetro `--phase <explorer|planner|implementer|closer>`. La lógica interna determina si aplica limpieza de workbench (solo cuando `--phase=closer`).

**Rationale:** la firma es explícita y auditable; el agente pasa su propio nombre sin razonar sobre flags booleanos. Fácil de extender si otra fase necesita comportamiento diferencial.

**Trade-offs aceptados:** el script tiene una rama interna acoplada al nombre de fase. Si se añade una quinta fase en el futuro, hay que actualizar el script. Se acepta porque el número de fases es estable.

**Firma del script:**
```bash
npm run openspec:close-phase -- \
  --phase <explorer|planner|implementer|closer> \
  --change <c00091-slug> \
  --duration-ms <n>
```

El parámetro `--duration-ms <n>` recibe la duración real medida por el harness (campo `duration_ms` del `tool_result.usage` del Agent tool, pasado por el orquestador al invocar el subagente). El subagente NO calcula ni inventa esta duración: la recibe del orquestador como parte del contexto de invocación y la pasa directamente a `close-phase.ts`.

**Reglas de validación de `--duration-ms`:**
- Debe ser un número entero finito ≥ 0.
- Si el valor pasado es 0 y la fase tuvo duración real no nula (lo cual `close-phase.ts` no puede detectar directamente), el script lo escribe tal cual pero emite una advertencia a stderr. La responsabilidad de pasar el valor correcto es del subagente/orquestador.
- Si el valor no es un número finito (NaN, Infinity, string no numérico), `close-phase.ts` falla con exit 1 y no escribe el sidecar.

**Cómo construye el orquestador la duración:**
El orquestador pasa `duration_ms` del `tool_result.usage` (del Agent tool que invocó el subagente de fase) al campo de contexto de invocación del subagente. Cada definición de subagente documenta cómo recuperar ese valor y pasarlo a `close-phase.ts`. El sidecar es secundario/derivado; si el sidecar es inválido, el orquestador cae al valor real del harness para presentar duraciones al usuario.

**Comportamiento interno de `close-phase.ts`:**

1. Parsea `--phase`, `--change`, `--duration-ms`.
2. Valida que `--duration-ms` sea un número finito; si no, falla con exit 1.
3. Construye el objeto de timings con los campos `change`, `phase`, `durationMs` (número), `completedAt` (ISO derivado de `Date.now()`).
4. Llama a `writePhaseMarker(phase, change)` (importado desde `read-phase-marker.ts`).
5. Escribe atómicamente `openspec/.workbench/<phase>.timings.json` (writeFileSync tmp + renameSync final).
6. **Solo si `--phase=closer`**: elimina o limpia los archivos de workbench relevantes (sentinel `auto-pipeline.json`, archivos `.timings.json`, etc. — el conjunto exacto se define en la implementación).

**Migración de las 4 definiciones de subagente:**

Cada subagente reemplaza su bloque `node -e` inline por un único comando bash que invoca `close-phase.ts` con el valor de `duration_ms` recibido del harness. Las definiciones de subagente documentan explícitamente de dónde viene `duration_ms` (campo `tool_result.usage.duration_ms` que el orquestador pasa en el contexto de invocación). Esto elimina el bug de tipo de durationMs en el explorer porque `close-phase.ts` es el único lugar que serializa el JSON de timings y exige un número finito.

**Orquestador y presentación de duraciones (GAP 4 — reconciliación adicional):**

El orquestador DEBE emitir la línea `Fase duración` en cada transición de fase leyendo el sidecar `<phase>.timings.json`. Si el sidecar es inválido (ausente, malformado, o `durationMs` no finito), el orquestador hace fallback a la duración real del harness (`tool_result.usage.duration_ms`). Esta política de fallback se documenta en la reconciliación de doc del agente orquestador (tarea 5.x).

## Risks / Trade-offs

- **`synchronized` en ARTIFACT_ORDER no es un artefacto planificado** → se mitiga documentando en el código que los primeros 4 elementos son artefactos de planificación y `'synchronized'` es un nivel de estado post-plan. El tipo `Artifact` pasa a llamarse `ArtifactOrLevel` o similar.
- **`close-phase.ts` recibe el JSON de timings como string** → riesgo de errores de escaping en bash. Mitigación: el agente puede escribir el objeto a un archivo temporal y pasar la ruta con `--timings-file`; o usar here-doc. La implementación elige la forma menos propensa a errores de shell.
- **Migración de 4 definiciones de subagente** → si alguna definición de subagente queda sin migrar, el defecto persiste en esa fase. Mitigación: `tasks.md` incluye una tarea por cada subagente, verificable individualmente.
- **Contradicciones de doc (GAP 4)** → el riesgo es bajo (no afecta código); la reconciliación requiere leer el doc completo y editar con cuidado sin introducir nuevas ambigüedades.

## Migration Plan

1. Modificar `scripting/openspec/verify-stage-completion.ts`: añadir `'synchronized'` a `ARTIFACT_ORDER` e implementar la rama de verificación correspondiente.
2. Crear `scripting/openspec/close-phase.ts` con la API acordada.
3. Añadir el npm script `openspec:close-phase` en `package.json`.
4. Migrar `.claude/agents/explorer-specification-delta.md` — reemplazar el bloque `node -e` inline de timings + marcador por invocación a `close-phase.ts`.
5. Migrar `.claude/agents/planner-specification-delta.md` — ídem.
6. Migrar `.claude/agents/implementer-specification-delta.md` — ídem.
7. Migrar `.claude/agents/closer-specification-delta.md` — ídem, con `--phase closer` para que aplique la limpieza de workbench.
8. Actualizar `.claude/agents/closer-specification-delta.md` para añadir la invocación del gate `--through synchronized` entre synchronize y archive.
9. Reconciliar las cuatro contradicciones de doc en `.claude/agents/orchestrate-specification-delta.md`.

No hay rollback especial: los archivos de agente son texto; revertir con git es suficiente. El gate `--through synchronized` es aditivo y no afecta el comportamiento de los gates existentes.

## Open Questions

Ninguna. Las decisiones A y B están cerradas.
