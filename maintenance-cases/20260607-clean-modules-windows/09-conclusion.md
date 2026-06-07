---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 09-conclusion
version: v1.0
timestamp: 2026-06-07T21:40:00Z
status: in_progress
inputs: [case.md, 08-analysis.md]
produces: 09-conclusion.md
links: { previous: "08-analysis.md", next: }
---

# 09 — Conclusion — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | apply fix + add covering test to CI |
| reasoning_effort: medium |
| evidence | — |
| acceptance | actionable verdict |
| risk_controls | — |

## Verdict

**CONFIRMADA** — la hipótesis H1 (refinada en fase 08) es la causa raíz.

**Root cause**: `rimraf` en Windows 11 no garantiza atomicidad transaccional. Cuando el borrado de `node_modules/` falla por un lock en cualquier punto del proceso, el directorio queda en estado parcial con exit 1. rimraf no revierte lo ya borrado — el directorio corrupto persiste.

**Evidence**: experimento con archivo bloqueado por proceso PowerShell — 350 items restantes de ~1000, exit code 1, no rollback.

## Spec (validated, integration doc §4.3)

### Problema

En Windows 11, el comando `npm run clean:modules` (`rimraf node_modules`) deja `node_modules/` en estado parcial cuando encuentra archivos bloqueados por procesos con handles abiertos. rimraf sale con código 1 pero no revierte el borrado parcial — el directorio corrupto persiste y bloquea la pipeline de verificación.

### Comportamiento esperado

`clean:modules` debe dejar `node_modules/` eliminado completamente o intacto (transaccional). Si el borrado falla por locks, el directorio debe mantenerse en su estado original y el comando debe fallar con código de error.

### Acceptance criteria

1. `npm run clean:modules` elimina `node_modules/` completamente cuando no hay procesos con handles.
2. Si el borrado falla por locks, `node_modules/` se mantiene intacto.
3. `npm run verify:package-scripts` completa pasos 36–40 sin skip en cascada.
4. `npm run typecheck` no falla por `@types/*` ausentes tras `clean:modules`.
5. Los hooks de Claude Code pueden importar `@anthropic-ai/sdk` sin error tras `clean:modules`.
6. **No regresión**: `clean:modules` sigue funcionando en Linux/macOS sin cambios.

### Decisiones de implementación

1. **Crear un script dedicado**: `scripting/clean-modules.ts` que primero mate procesos con handles abiertos (`node`, `esbuild`, `vitest`) antes de ejecutar rimraf.
2. **Verificación post-borrado**: después de rimraf, verificar que `node_modules/` fue eliminado completamente. Si persiste con items restantes, ejecutar `npm install` automáticamente para restaurar el entorno.
3. **Detección de estado corrupto**: si `node_modules/` existe tras `clean:modules` y tiene menos items que antes (estado parcial), tratar como fallo y ofrecer recuperación.

### Experimental evidence

- Fase 06 (experiment-execution): H1 confirmada con experimento reproduciendo el lock.
- Fase 07 (data-collection): exit code 1, 350 items restantes, no rollback.
- Fase 08 (analysis): root cause refinada a falta de atomicidad transaccional.

## Recommendation

**Implementar**: crear `scripting/clean-modules.ts` como script dedicado que:
1. En Windows: matar procesos `node`, `esbuild`, `vitest` antes de rimraf.
2. Ejecutar rimraf.
3. Verificar estado post-borrado.
4. Si estado parcial: ejecutar `npm install` y reportar.
5. En otros entornos: delegar directamente a rimraf.

El fix es minimal, localizado, y cubre el caso de uso sin cambiar el comportamiento en entornos limpios.