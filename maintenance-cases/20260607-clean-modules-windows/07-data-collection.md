---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 07-data-collection
version: v1.0
timestamp: 2026-06-07T21:30:00Z
status: in_progress
inputs: [case.md, 06-experiment-execution.md]
produces: 07-data-collection.md
links: { previous: "06-experiment-execution.md", next: }
---

# 07 — Data Collection — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | red→green + regression suite |
| reasoning_effort | medium |
| evidence | test_results |
| acceptance | repro test passes, suite green |
| risk_controls | — |

## Normalized data

### Experimento H1 — Rimraf con archivo bloqueado

| Métrica | Valor | Condiciones |
|---|---|---|
| Lock activo | Archivo en `node_modules/.bin/test-lock-file.txt` abierto por proceso PowerShell detached | Proceso Windows manteniendo handle ReadWrite sin cerrar |
| rimraf exit code | **1** (capturado como excepción) | Comando: `npm run clean:modules` |
| node_modules/残留 | **350 items** (incompleto) | Estado tras rimraf fallido |
| node_modules/ eliminado | ~650 items (de ~1000 originales estimados) | rimraf borró parcialmente antes de fallar |
| Verificación post-fallo | `existsSync(node_modules)` = **true** | El directorio persiste |
| Restauración | `npm install` ejecutado correctamente | 432 packages, exit 0 |

### Detalle del exit code

El resultado contradice parcialmente H1:

- **Predicción H1**: rimraf exit 0 con borrado incompleto (silent failure via `fixEPERM`).
- **Resultado real**: rimraf exit **1** con borrado incompleto.

Esto indica que `fixEPERM` **no** silently gave up en este caso — rimraf sí propagó el error. Sin embargo, el error propagado no revertió el borrado parcial ya realizado.

### Métricas adicionales

| Métrica | Antes | Después |
|---|---|---|
| `node_modules/` completo | ~1000 items | 350 items |
| Archivos eliminados por rimraf | 0 | ~650 |
| Exit code de rimraf | — | 1 (error) |
| Proceso con handle activo | — | PowerShell (lock sobre 1 archivo) |

## Before / After

### Before (pre-experimento)

- `node_modules/` completo, todos los bins operativos.
- `node_modules/.bin/tsx` existe.
- `@anthropic-ai/sdk/index.js` existe.

### After (post-experimento, pre-restauración)

- `node_modules/` incompleto (350 items).
- `node_modules/.bin/` vacío o casi vacío.
- rimraf exit 1, directorio en estado parcial.

### After (post-restauración con `npm install`)

- `node_modules/` completo (432 packages instalados).
- `node_modules/.bin/tsx` operativo.
- `@anthropic-ai/sdk/index.js` presente.

## Raw experiment data

Archivo de reproducción guardado en:
`maintenance-cases/20260607-clean-modules-windows/experiments/hypothesis-1/repro-script.ts`

## Interpretation (deferred to phase 08)

El dato clave: rimraf propagó error (exit 1) pero dejó el directorio en estado parcial. Esto sugiere que la implementación Windows de rimraf no es atómica — si falla a mitad del borrado, no revierte lo ya borrado. El exit code 1 indica que el error sí se propagó, contradiciendo la versión "silent failure" de H1.