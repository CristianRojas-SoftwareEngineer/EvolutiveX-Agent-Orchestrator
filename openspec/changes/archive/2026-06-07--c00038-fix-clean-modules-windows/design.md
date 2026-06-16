## Context

El comando `clean:modules` en `package.json` está definido como `"clean:modules": "rimraf node_modules"`. No existe un script dedicado — rimraf se ejecuta directamente.

En Windows 11, rimraf v6.1.3 usa la implementación `manual` (no native) con retry para `EBUSY`/`EMFILE`/`ENFILE` (hasta 10 intentos con backoff exponencial). Sin embargo, cuando todos los retries se agotan y el lock persiste, rimraf propaga el error (exit 1) pero **no revierte el borrado parcial ya realizado**. El resultado es un directorio corrupto con items restantes (~350 de ~1000 en el experimento).

La solución debe ser minimal y localizada: un script dedicado que no reemplace rimraf sino que lo envuelva con pre-limpieza y verificación post-borrado.

## Goals / Non-Goals

**Goals:**
- Eliminar `node_modules/` completamente cuando no hay procesos con handles abiertos.
- Detectar estado corrupto (directorio presente con items restantes) y auto-recuperar con `npm install`.
- No cambiar el comportamiento en Linux/macOS (delegación directa a rimraf).
- Mantener el verificador `path-absent-node-modules` en `verify-config.ts` funcional.

**Non-Goals:**
- Modificar la implementación interna de rimraf.
- Reemplazar rimraf por otro tool de eliminación.
- Crear rollback transaccional completo (atomicidad perfecta) — el fix se limita al caso Windows con procesos activos.
- Modificar `clean:all` (que incluye `clean:modules`) — solo el script individual.
- Agregar configuración o flags adicionales — comportamiento default suffices.

## Decisions

### D1 — Script dedicado en lugar de modificar package.json directamente

**Opción elegida**: crear `scripting/clean-modules.ts` y actualizar `package.json` para apuntar a `tsx scripting/clean-modules.ts`.

**Alternativa descartada**: usar un wrapper inline en `package.json` como `"clean:modules": "powershell -Command ..."`. La lógica de pre-limpieza y verificación post-borrado requiere más de una línea; un script dedicado es más mantenible y testeable.

**Alternativa descartada**: modificar rimraf internamente (fork o patch). Rimraf ya tiene retry y fallback — el problema no es ausencia de lógica sino la falta de rollback cuando el retry se agota.

---

### D2 — Pre-limpieza de procesos solo en Windows

**Decisión**: en Windows, antes de ejecutar rimraf, matar procesos que típicamente mantienen handles (`node`, `esbuild`, `vitest`). En otros entornos, delegar directamente a rimraf.

**Justificación**: el problema ocurre exclusivamente cuando hay procesos de desarrollo activos (esbuild con watch mode, vitest con --watch, node con watchers). Matar estos procesos antes de rimraf elimina la causa raíz del lock. En entornos limpios (CI/CD, producción), no hay procesos activos y rimraf funciona correctamente.

**Procesos a matar**: `node`, `esbuild`, `vitest` — solo en Windows. No matar `npm` ni otros procesos del sistema.

---

### D3 — Verificación post-borrado + auto-recuperación

**Decisión**: después de ejecutar rimraf, verificar si `node_modules/` fue eliminado completamente. Si persiste con más de 0 items, ejecutar `npm install` y terminar con exit 1.

**Justificación**: el experimento mostró que cuando rimraf falla, deja ~350 items. Si después de rimraf `node_modules/` existe con cualquier contenido, el estado es corrupto y la única recuperación confiable es `npm install`. Esto garantiza que el entorno queda en un estado conocido (completo o vacío, no corrupto).

**Threshold de detección**: cualquier contenido > 0 items en `node_modules/` post-rimraf se considera estado corrupto. No se usa un threshold porcentual.

---

### D4 — Fallback: si pre-limpieza + rimraf falla, auto-recuperar

**Decisión**: si después de rimraf `node_modules/` persiste, ejecutar `npm install` para restaurar el entorno, reportar el fallo, y terminar con exit 1.

**Justificación**: el objetivo del script no es solo borrar `node_modules/` sino garantizar que el entorno queda en un estado funcional. Si el borrado falla por cualquier motivo, la auto-recuperación es el mecanismo de fallback. El exit 1 indica a la pipeline que hubo un fallo, pero el entorno queda restaurado.

---

### D5 — No modificar `clean:all`

**Decisión**: `clean:all` sigue ejecutando `"clean:dist"`, `"clean:modules"`, `"clean:sessions"`, `"clean:logs"` via `concurrently`. El nuevo script `clean:modules.ts` se invoca a través de `npm run clean:modules`, que `clean:all` ejecuta.

**Justificación**: `clean:all` usa `concurrently` para ejecutar los scripts en paralelo. Si alguno falla, `concurrently` termina con error. El nuevo script debe terminar con exit 0 si el borrado fue exitoso, o con exit 1 si falló (incluyendo auto-recuperación). Esto es compatible con el comportamiento de `concurrently`.

## Risks / Trade-offs

**[Risk] Matar procesos de desarrollo activos puede interrumpir trabajo no guardado**

→ **Mitigation**: La pre-limpieza solo ocurre cuando `clean:modules` se ejecuta intencionalmente. El usuario que ejecuta `npm run clean:modules` sabe que está borrando `node_modules/` y puede guardar su trabajo antes. No hay automatic trigger en background.

**[Risk] Matar `node` puede matar procesos no relacionados**

→ **Mitigation**: Se usan patrones de nombre específicos (`node`, `esbuild`, `vitest`) y se mata solo por nombre, no por PID genérico. En la práctica, los únicos procesos `node` activos durante desarrollo son los del entorno local (vite, esbuild, vitest). Procesos de producción no deberían existir en el entorno de desarrollo.

**[Risk] `npm install` post-fallo puede ser lento**

→ **Mitigation**: El tiempo de `npm install` es proporcional al tamaño del proyecto. En este repo (~435 packages) toma ~11s. Aceptable como fallback para un caso que debería ser excepcional (procesos con handles activos).

**[Trade-off] Complejidad del script vs. simplicidad de rimraf directo**

→ El script dedicado añade ~100 líneas de lógica. A cambio, elimina el caso corrupto de forma robusta. Sin el script, el bug se reproduce cada vez que hay procesos activos.

## Open Questions

**Q1**: ¿Debería el script intentar retry adicional después de la pre-limpieza, o un solo intento con pre-limpieza es suficiente?

**A1 (decisión)**: Un solo intento con pre-limpieza es suficiente. Si después de matar procesos y ejecutar rimraf el directorio persiste, el estado corrupto se resuelve con `npm install`. No hay necesidad de múltiples retries — la pre-limpieza debería eliminar la causa del lock.

**Q2**: ¿Qué pasa si `npm install` falla durante la auto-recuperación?

**A2 (decisión)**: Si `npm install` falla, el script termina con exit 1 y reporta el error. El entorno queda en el estado corrupto que dejó rimraf. Esto es detectable por el verificador `path-absent-node-modules` en la siguiente ejecución de la pipeline. El caso es excepcional y requiere intervención manual.

**Q3**: ¿Se debe actualizar el contador de pasos en `verify-config.ts`?

**A3 (decisión)**: No. El step `clean-modules` sigue existiendo con el mismo `id` y `verifier`. Solo cambia el script al que apunta en `package.json`. El verificador `path-absent-node-modules` funciona igual — detecta si `node_modules/` existe o no.

---

## Divergencias documentadas

Las siguientes decisiones de diseño fueron ajustadas durante la implementación,
manteniendo trazabilidad entre lo planificado y lo construido.

### D1 — Procesos a matar en pre-limpieza Windows

| | Original (D2) | Implementado |
|--|---|---|
| Procesos | `node`, `esbuild`, `vitest` | `esbuild`, `vitest` (solo) |

**Justificación de la divergencia**: `taskkill /T` mata el árbol de procesos completo (padre + hijos). Matar `node` con `/T` cascada al proceso padre (bash, npm, gateway de Claude Code). Si el gateway se mata a sí mismo, el proceso queda colgado sin posibilidad de recuperación. Los procesos `node` que mantienen handles sobre `node_modules/` son hijos de los procesos de desarrollo (esbuild, vitest), no el inverso — matar los hijos es suficiente y no afecta al padre.

### D2 — Mecanismo de auto-recuperación

| | Original (D3/D4) | Implementado |
|--|---|---|
| Método | `execSync('npm install', { stdio: 'inherit' })` — bloqueante | `spawn('npm', ['install'], { detached: true })` — no bloqueante |
| Comportamiento del padre | Bloqueado ~20s esperando npm install | Termina inmediatamente con exit 1 |

**Justificación de la divergencia**: `execSync` con `stdio: 'inherit'` bloquea el proceso padre hasta que `npm install` termina completamente (~20s). Esto impide que el verificador de la pipeline reciba un exit code oportuno. Con `spawn` + `detached: true`, el proceso hijo corre en background y el padre termina inmediatamente con código 1, permitiendo que la pipeline detecte el fallo y el auto-recovery se ejecuten en paralelo.

### D3 — Comportamiento transaccional (contradicción interna en artefactos)

| Fuente | Comportamiento especificado |
|---|---|
| `09-conclusion.md` §40 | "si el borrado falla, `node_modules/` debe mantenerse intacto" |
| `design.md` D3/D4 | Threshold: cualquier contenido > 0 items post-rimraf = corrupto; auto-recuperación con `npm install` |

**Resolución**: la implementación siguió D3/D4 (auto-recuperación), no §40 de la spec. La spec §40 era contradictoria con el diseño D4. El comportamiento final es: si `node_modules/` persiste post-rimraf con items, se ejecuta `npm install` para restaurar y se termina con exit 1. El directorio queda restaurado, no intacto.

### Nota sobre lesson learned

Esta divergencia fue identificada durante la fase de experimentación del caso SM
`20260607-clean-modules-windows`. La lesson fue registrada en
`maintenance-cases/20260607-clean-modules-windows/09-conclusion.md` y
`.claude/memory/` como referencia para casos similares.