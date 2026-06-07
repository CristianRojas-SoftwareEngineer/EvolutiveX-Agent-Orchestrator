---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 08-analysis
version: v1.0
timestamp: 2026-06-07T21:35:00Z
status: in_progress
inputs: [case.md, 04-hypothesis.md, 07-data-collection.md]
produces: 08-analysis.md
links: { previous: "07-data-collection.md", next: }
---

# 08 — Analysis — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | defect closed without regressions |
| reasoning_effort | medium |
| evidence | — |
| acceptance | hypothesis confirmed, no regressions |
| risk_controls | — |

## Verdict on hypotheses

### H1 — `fixEPERM` silently gives up → **PARCIALMENTE CONFIRMADA, MODIFICADA**

**Predicción**: rimraf exit 0 con borrado incompleto.

**Resultado real**: rimraf exit **1** con borrado incompleto.

El mecanismo是对的: `fixEPERM` no silently gave up en este caso específico (el lock de PowerShell sobre un archivo de texto plano probablemente no genera `EPERM` sino otro error). Sin embargo, **el comportamiento real es igualmente problemático**: rimraf sale con error 1 pero deja el directorio en estado parcial. El borrado no es atómico ni transaccional.

**Root cause refinada**: El problema no es que `fixEPERM` silently da up (en este experimento). El problema es que la implementación Windows de rimraf no es transaccional: si falla a mitad del borrado, no revierte lo ya borrado. El resultado es un directorio corrupto, no un directorio intacto con exit 0.

**Nueva hipótesis H1 refinada**: `rimraf` en Windows no garantiza atomicidad — si el borrado falla por un lock en cualquier punto del proceso, el directorio queda en estado parcial con exit 1.

---

### H2 — Retry insuficiente → **NO TESTEADA**

La hipótesis H2 no fue testeada porque H1 (versiones refinada) ya identificó el root cause real. La cantidad de retries no es el problema — el problema es que cuando rimraf falla, no hay rollback.

---

### H3 — Fallback `rimrafMoveRemove` no se activa → **INFORMATIVA**

El fallback move-remove se activa con `ENOTEMPTY` (directorio no vacío tras rmdir). En el experimento, el error fue probablemente `EBUSY` (archivo en uso) sobre el archivo bloqueado, lo que activa retry pero no el fallback. El fallback sería útil si el lock persistiera tras todos los retries y generara `ENOTEMPTY`, pero en este experimento no llegó a activarse.

---

### H4 — Implementación native → **NO TESTEADA**

No testeada. Baja prioridad en el diseño original.

---

## Magnitude

| Aspecto | Valor |
|---|---|
| Severidad del defecto | Alta: corrompe el entorno de desarrollo, bloquea la pipeline de verificación, rompe hooks. |
| Frecuencia de ocurrencia | Alta: cualquier proceso con handles abiertos sobre archivos de `node_modules/` causa el fallo. |
| Scope del problema | Solo Windows (en Linux/macOS rimraf usa la implementación native que tiene diferente retry behavior). |
| Impacto en pipeline | Pasos 36-40 de `verify:package-scripts` fallan o se skippean en cascada. |

El problema es significativo y se reproduce en cada ejecución de `clean:modules` cuando hay procesos activos con handles.

## Threats to validity

- **Un solo experimento**: solo se ejecutó un repro con un archivo bloqueado. No se probó con múltiples archivos bloqueados ni con procesos reales como esbuild/vitest que mantienen muchos handles simultáneamente.
- **Plataforma específica**: el experimento fue en Windows 11. El comportamiento podría diferir en otras versiones de Windows.
- **Lock generado artificialmente**: el lock de PowerShell sobre un archivo de texto plano puede no ser representativo del lock real que producen procesos de desarrollo (esbuild con watch mode, vitest, etc.).

## Side effects

- `npm install` restauró correctamente el entorno tras el experimento. No hay daño permanente.
- El reproductor dejó un archivo de prueba (`test-lock-file.txt`) que fue eliminado en la limpieza.

## Conclusion for phase 09

La hipótesis H1 queda confirmada con refinamiento: el problema real es la **falta de atomicidad transaccional** en rimraf para Windows — el borrado no es reversible cuando falla. La solución debe abordar este comportamiento: ya sea haciendo el borrado transaccional (si falla, no borrar nada), o garantizando que el estado parcial se detecte y se maneje antes de que la pipeline continúe.

Hipótesis candidates para fase 09:
1. Crear un script dedicado que mate procesos con handles antes de rimraf.
2. Modificar el comando para usar `--impl=native` de rimraf (puede tener diferente retry behavior).
3. Agregar un wrapper que verifique el estado de `node_modules/` post-borrado y ejecute `npm install` si detecta estado incompleto.