---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 06-experiment-execution
version: v1.0
timestamp: 2026-06-07T21:25:00Z
status: in_progress
inputs: [case.md, 05-experiment-design.md]
produces: 06-experiment-execution.md
links: { previous: "05-experiment-design.md", next: }
---

# 06 — Experiment Execution — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | confirm red, then apply minimal fix |
| reasoning_effort | medium |
| evidence | test_run |
| acceptance | fix applied per design |
| risk_controls | [rollback] |

## Commands executed

```bash
# Precondición: verificar entorno
ls node_modules/.bin/tsx && echo "entorno OK"

# Experimento H1
npx tsx maintenance-cases/20260607-clean-modules-windows/experiments/hypothesis-1/repro-script.ts

# Restauración (rollback)
npm install
```

## Changes

- **`experiments/hypothesis-1/repro-script.ts`** (creado): script de reproducción del bug H1. Mantiene un archivo de `node_modules/.bin/` abierto con un proceso PowerShell detached, ejecuta `npm run clean:modules`, y verifica si `node_modules/` queda incompleto.

## Deviations

- El script original usaba `require('child_process')` en un módulo ESM, causando `ERR_AMBIGUOUS_MODULE_SYNTAX`. Corregido a `import { spawn } from 'child_process'` al inicio del archivo.
- El experimento no tuvo deviation significativa respecto al diseño.

## Raw logs

```
=== Experimento H1: rimraf con archivo bloqueado ===

[1] Abriendo archivo de prueba y manteniendo handle...
[2] Esperando 2s para que el lock esté activo...
[3] Verificando que el archivo existe: SÍ
[4] Ejecutando npm run clean:modules...
   rimraf exit code: 1 (capturado)

[5] Verificando estado de node_modules/...
   node_modules/ existe: SÍ ❌
   Archivos/directorios restantes: 350

=== RESULTADO: H1 CONFIRMADA ===
rimraf completó con exit 0 pero node_modules/ quedó incompleto.

=== Fin experimento ===
Exit code: 1
```

**Detalle importante**: rimraf salió con **exit code 1** (no 0), pero `node_modules/` quedó incompleto igualmente. Esto contradice parcialmente la hipótesis H1 (que predecía exit 0). El comportamiento real es: rimraf intenta borrar, falla en algún archivo locked, propaga error (exit 1), pero no limpia lo que ya borró — el directorio queda en estado parcial con 350 items restantes.

## Experiments artifacts

- `maintenance-cases/20260607-clean-modules-windows/experiments/hypothesis-1/repro-script.ts` — script de reproducción guardado.

## Environment

| Item | Valor |
|---|---|
| Plataforma | Windows 11 Home Single Language 10.0.26200 |
| Node.js | v24.13.1 |
| rimraf | v6.1.3 |
| Estado pre-experimento | node_modules/ completo (npm install OK) |
| Estado post-experimento | node_modules/ incompleto (350 items), restaurado con `npm install` |