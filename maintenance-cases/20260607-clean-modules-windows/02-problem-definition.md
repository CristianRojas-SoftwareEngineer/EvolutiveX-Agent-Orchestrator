---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 02-problem-definition
version: v1.0
timestamp: 2026-06-07T20:55:00Z
status: in_progress
inputs: [case.md, 01-observation.md]
produces: 02-problem-definition.md
links: { previous: "01-observation.md", next: }
---

# 02 — Problem Definition — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | defect statement + no-regression criterion |
| reasoning_effort | medium |
| evidence | — |
| acceptance | falsifiable, measurable bug statement |
| risk_controls | — |

## Problem statement

**En Windows 11**, el comando `npm run clean:modules` (ejecutando `rimraf node_modules`) no logra eliminar el directorio `node_modules/` de forma completa y confiable. Cuando rimraf encuentra archivos bloqueados por procesos con handles abiertos, el borrado se interrumpe sin error en la CLI — el comando sale con código 0 — pero deja `node_modules/` en un estado parcial e inconsistente:

- Paquetes con subdirectorios presentes pero archivos principales (`index.js`) ausentes.
- `node_modules/.bin/` vacío, rompiendo todas las herramientas de desarrollo (`tsx`, `tsup`, `eslint`, `vitest`, etc.).
- Paquetes como `@anthropic-ai/sdk` corrupto, rompiendo hooks de Claude Code (`stop-work-summary-notification.ts`).

El problema **se reproduce** cada vez que hay procesos con handles abiertos sobre archivos de `node_modules/` en el momento de la ejecución. La pipeline de verificación (`verify:package-scripts`) tiene pasos que arrancan procesos en background (`start`, `dev`) y aunque estos procesos se matan tras el timeout de 15s, pueden dejar handles residuales que interfieren con rimraf.

## Solved criterion

El fix es correcto cuando se cumplen simultáneamente:

1. `rimraf node_modules` o su equivalente elimina `node_modules/` completamente en Windows 11, incluso con procesos con handles abiertos sobre archivos del directorio.
2. El verificador `path-absent-node-modules` en `scripting/verify-config.ts` pasa (el directorio no existe tras el script).
3. `npm run verify:package-scripts` completa los pasos 36–40 sin skip en cascada.
4. `npm run typecheck` no falla por `@types/*` ausentes tras la ejecución de `clean:modules`.
5. Los hooks de Claude Code (`stop-work-summary-notification.ts`) pueden importar `@anthropic-ai/sdk` sin error después de la ejecución.
6. **No regresión**: `npm run clean:modules` sigue funcionando en otros entornos (Linux, macOS) sin cambios funcionales.

## Limits

- El fix debe abordar exclusivamente el caso de Windows 11 donde rimraf no puede adquirir lock sobre archivos en uso.
- El fix no debe eliminar la capacidad de `clean:modules` de borrar `node_modules/` en entornos limpios (sin procesos con handles abiertos).
- El fix no debe cambiar el comportamiento de `clean:all` (que incluye `clean:modules`) salvo en su componente de eliminación de `node_modules/`.
- La solución debe minimizar cambios: un script dedicado o un wrapper sobre rimraf, no un reemplazo de todo el sistema de build.

## Severity

| Aspecto | Valor |
|---|---|
| Impacto | Alto: bloquea la pipeline de verificación completa (pasos 36–40), corrompe el entorno de desarrollo, rompe hooks de Claude Code. |
| Frecuencia | Cada vez que hay procesos con handles abiertos en `node_modules/` — situación común durante desarrollo activo. |
| Workaround | Restaurar manualmente con `npm install`. Sin embargo, el workaround no es aceptable para CI/CD donde la pipeline de verificación debe ser fully automated. |
| Categoría SM | Defecto correctivo: comportamiento presente que no funciona como diseñado. |

## No-regression criterion

Cualquier modificación debe garantizar que `clean:modules` sigue funcionando correctamente cuando no hay procesos con handles abiertos. La solución no debe romper el caso nominal.