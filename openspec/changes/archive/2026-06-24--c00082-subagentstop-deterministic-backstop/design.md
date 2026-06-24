## Context


El pipeline AUTO opera en cuatro fases (explorer, planner, implementer, closer), cada una delegadas a un subagente. El orquestador recibe un handoff JSON al final de cada fase y avanza a la siguiente. Actualmente no existe un gate determinista en esa frontera: el orquestador acepta cualquier handoff bienformado sin verificar que la fase realmente complet su trabajo.

La spec `orchestrator-phase-handoff-gate` define los requisitos para este gate, incluyendo la necesidad de evaluar predicados on-disk. El diseño aqui resuelto elige el **Enfoque A**: marcadores atomicos de completitud por fase.

### Restricciones canonicas vigentes

- `configs/hooks.json` NO se toca.
- `openspec/specs/pipeline-auto-continuation/spec.md` NO se toca.
- La logica de validacion del SubagentStop permanece en el hook; no se replica en el orquestador.
- El gate vive exclusivamente en el orquestador.

## Goals / Non-Goals

**Goals:**
- Que el orquestador valide deterministamente el handoff de cada subagente antes de avanzar de fase.
- Que la senal de completitud de fase sea verificable por el orquestador sin interpretacion.
- Que el rechazo sea hard-stop y con diagnostico legible.

**Non-Goals:**
- Reemplazar o replicar la logica del SubagentStop en el orquestador.
- Modificar `pipeline-auto-continuation/spec.md` o `configs/hooks.json`.
- Implementar Enfoque B (predicados on-disk existentes); esa decision queda diferida.
- Soportar pipelines que no usen el modo AUTO.

## Decisions

### Decision 1: Enfoque A — Marcadores atomicos por fase

**Opcion elegida:** Cada subagente de fase (explorer, planner, implementer) escribe un marcador atomico en `openspec/.workbench/<phase>.done` inmediatamente antes de retornar su handoff JSON al orquestador. El closer NO escribe marcador; su senal de completitud es `isChangeArchived`.

**Alternativa descartada — Enfoque B:** Reutilizar `verify-stage-completion` y `isChangeArchived` como predicados on-disk sin archivos nuevos. Se descarta porque:
- No cubre la fase explorer, ya que explorer no produce artefactos del pipeline (proposal/specs/design/tasks) y por tanto `verify-stage-completion` no le aplica; en cambio el Enfoque A sí cubre explorer, porque cada subagente —incluido explorer— escribe su marcador independiente del output de su fase.
- Acopla la semantica del gate a la implementacion de los scripts existentes.
- Imposibilita el diagnostico granular de que fase fallo.

#### Detalle de implementacion

**Definicion del marcador**

- Ruta: `openspec/.workbench/<phase>.done`
- Contenido: JSON minimo `{ "change": "<id>", "completedAt": "<ISO-8601>" }`
- Fase vs. nombre de archivo:

| Fase      | Archivo de marcador           |
|-----------|-------------------------------|
| explorer  | `openspec/.workbench/explorer.done` |
| planner   | `openspec/.workbench/planner.done`  |
| implementer | `openspec/.workbench/implementer.done` |
| closer    | (ninguno — `isChangeArchived`) |

**Escritura atomica**

Todo subagente DEBE usar el siguiente protocolo para evitar lectores a medio escribir:

```typescript
// 1. Escribir a .tmp
fs.writeFileSync(".workbench/<phase>.done.tmp", JSON.stringify({ change, completedAt }));
// 2. Renombrar atomicamente
fs.renameSync(".workbench/<phase>.done.tmp", ".workbench/<phase>.done");
```

`writeFileSync` + `renameSync` sobre el mismo inode garantiza atomicidad a nivel de SO: hasta el `rename`, el archivo `.done` no existe o contiene el marcador de la ejecucion anterior.

**Protocolo de escritura por fase**

Cada subagente ejecuta la escritura del marcador **justo antes** de retornar al orquestador, tras construir el handoff JSON y antes de la llamada que cede el control.

El closer NO escribe marcador. Su senal de completitud es `isChangeArchived = true` en el archivo `.openspec.yaml` del change.

### Decision 2: Validacion por el orquestador en la frontera inter-fase

**Lectura del marcador**

El orquestador, al recibir el handoff del subagente, ejecuta:

```typescript
const marker = readPhaseMarker(phase); // lanza si EISDIR, ENOENT, corrupto, vacio
if (!marker) throw new PhaseHandoffReject({ phase, reason: "ABSENT" });
if (marker.change !== expectedChange) throw new PhaseHandoffReject({ phase, reason: "WRONG_CHANGE", expected: expectedChange, found: marker.change });
// continuar solo si marker.change === expectedChange
```

**Comportamiento fail-closed (rechazo determinista)**

Cualquier error de E/S o parsing del marcador produce rechazo, NO avance silencioso:

| Error                     | Resultado                          |
|---------------------------|-------------------------------------|
| `ENOENT` (archivo ausente) | Rechazo — fase no completada        |
| `EISDIR` (es un directorio)| Rechazo — configuracion corrupta    |
| Archivo vacio             | Rechazo — marcador incompleto       |
| JSON corrupto             | Rechazo — parsing fallido          |
| `rename` no atomico (edge case) | Rechazo — posible race condition |

Esta politica fail-closed es intencionalmente distinta de la politica fail-open del hook Stop:

- **Hook Stop (fail-open):** Previene deadlock del orquestador ante un SubagentStop que no dispara; la ausencia de senal se trata como "continuar" porque un SubagentStop que no dispara es una senal implicita de que el pipeline sigue activo.
- **Gate de handoff (fail-closed):** La ausencia o corrupcion de un marcador es una senal explicita de que la fase no completo; avanzar seria un silent data loss. El marcador es una promesa deliberada del subagente, no una senal pasiva.

### Decision 3: Estructura del handoff JSON

El handoff DEBE ser:

```json
{
  "change": "c<NNNNN>-<slug>",
  "apply_ready": true,
  "artifacts": {
    "proposal": "done",
    "specs": "done",
    "design": "done",
    "tasks": "done"
  }
}
```

- `change`: identificador del delta; DEBE coincidir con el marcador.
- `apply_ready`: DEBE ser `true`; cualquier otro valor es rechazo inmediato.
- `artifacts`: cada entrada DEBE tener valor `"done"`; cualquier otra cadena (error, `"pending"`, `null`) es rechazo.

### Decision 4: Limpieza de marcadores

La limpieza de marcadores es responsabilidad del closer (fase 4/4) durante su freeze:

```typescript
// En el freeze del closer
for (const phase of ["explorer", "planner", "implementer"]) {
  const markerPath = `.workbench/${phase}.done`;
  if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
}
```

Concurrentemente, el closer elimina el sentinel AUTO.

**Politica para fallos antes del freeze:** Si el pipeline falla en las fases 1, 2 o 3, los marcadores quedan como huerfanos. La politica acceptada es: huerfanos detectables al inicio del proximo pipeline run (el orquestador puede verificar y rechazar si encuentra marcadores de un change distinto al actual). No se implementa limpieza automatica trans-pipeline.

## Risks / Trade-offs

**[Riesgo: Disco lleno durante el writeFileSync]**
El `writeFileSync` puede fallar con `ENOSPC` antes de que el `.tmp` exista. Si esto ocurre, el subagente no puede escribir el marcador y NO debiera retornar un handoff `apply_ready: true`.
**Mitigacion:** El subagente detecta `ENOSPC` y retorna `apply_ready: false` con un artefacto con error. El orquestador rechaza y el diagnostico indica la causa.

**[Riesgo: Permisos insuficientes para escribir en .workbench]**
`EACCES` durante `writeFileSync` o `renameSync` tiene el mismo tratamiento que `ENOSPC`.
**Mitigacion:** Misma que el riesgo anterior.

**[Riesgo: Rename no atomico en sistemas Windows con ciertos FS]**
Aunque `renameSync` es atomico en la mayoria de sistemas, en Windows con ciertos sistemas de archivos network-mounted puede no garantizar atomicidad absoluta. Este es un riesgo conocido aceptable.
**Mitigacion:** Documentar que el entorno de ejecucion esperado es un FS local; en ambientes network-mounted el comportamiento no esta garantizado.

**[Trade-off: Nuevos vectores de fallo vs. Enfoque B]**
Enfoque A introduce dos vectores que Enfoque B no tiene: `ENOSPC`/`EACCES` en la escritura del marcador, y fallibilidad del protocolo `writeFileSync` + `renameSync`. Enfoque B, al depender de predicados existentes, no crea archivos nuevos y no tiene estos vectores. Se acepta el trade-off a cambio de diagnostico granular y coverage de la fase explorer.

## Migration Plan

No aplica. Este es un cambio nuevo que no reemplaza funcionalidad existente. El gate coexiste con los mecanismos actuales del pipeline.

**Pasos de implementacion (derivados en tasks.md):**
1. Crear script `scripting/openspec/read-phase-marker.ts` (lectura fail-closed del marcador).
2. Instrumentar los tres subagentes (explorer, planner, implementer) para escribir su marcador antes de retornar.
3. Crear suite de tests `tests/scripting/openspec/orchestrator-phase-handoff-gate.test.ts`.
4. Integrar la validacion en el orquestador.

## Open Questions

Ninguna. La decision Enfoque A vs Enfoque B fue resuelta por el usuario en el briefing. La especificacion del marcador (ruta, contenido, protocolo de escritura) queda cerrada en este documento.
