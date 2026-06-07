---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 04-hypothesis
version: v1.0
timestamp: 2026-06-07T21:10:00Z
status: in_progress
inputs: [case.md, 02-problem-definition.md, 03-research.md]
produces: 04-hypothesis.md
links: { previous: "03-research.md", next: }
---

# 04 — Hypothesis — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | most probable, cheapest-to-test root cause |
| reasoning_effort | medium |
| evidence | — |
| acceptance | falsifiable root-cause hypothesis |
| risk_controls | — |

## Prioritized hypotheses

### H1 — `fixEPERM` silently gives up, rimraf exits 0 con borrado incompleto (prioridad alta)

**Descripción**: `fixEPERM` en `rimraf/dist/esm/fix-eperm.js` intenta hacer `chmod(path, 0o666)` cuando recibe un error `EPERM`. Si el chmod falla, la función retorna sin error (`return;`). Esto significa que rimraf termina con código 0 pero `node_modules/` no se borró completamente. El archivo quedó locked por un proceso con handle abierto, chmod falló, y rimraf silently gave up.

**Predicción**: Si ejecuto `npm run clean:modules` con procesos hijos de npm (`concurrently`, `npm run start`) aún activos o con handles abiertos, rimraf recibe `EPERM` en archivos locked, chmod falla, y el directorio queda parcialmente borrado. El exit code será 0.

**Refutación**: Si el exit code de rimraf es 1 (error propagado), entonces `fixEPERM` no es la causa. Si los archivos se borran completamente incluso con procesos activos, el retry de rimraf es suficiente.

**Costo de test**: Bajo. Solo requiere monitorear el exit code y el estado de `node_modules/` tras ejecutar el script con procesos activos.

---

### H2 — Retry insuficiente: 10 retries no alcanzan con múltiples procesos con handles (prioridad alta)

**Descripción**: `retryBusy` en `rimraf/dist/esm/retry-busy.js` tiene `MAXRETRIES = 10` con backoff máximo de 200ms por intento. Cuando hay múltiples procesos (esbuild, node watchers, vitest) con handles abiertos sobre archivos distintos, cada archivo puede requerir hasta 10 retries. Si los procesos se reinician rápidamente, los handles se reacquiring antes de que rimraf pueda borrarlos. Con 10 retries máximo, rimraf puede agotar los intentos antes de que los handles se liberen.

**Predicción**: Si incremento `maxRetries` a un valor más alto (ej. 20) y ejecuto `clean:modules` con procesos activos, la eliminación será más confiable. Si el problema persiste incluso con `maxRetries` alto, la causa no es el count de retries.

**Refutación**: Si incluso con `maxRetries=20` rimraf falla, el problema no es la cantidad de retries sino que los handles se mantienen abiertos más allá del tiempo de vida del retry (posiblemente porque algún proceso reinicia los handles activamente).

**Costo de test**: Medio. Requiere crear un script que modifique el comportamiento de rimraf o usar la flag `--impl=native` que tiene diferente retry behavior.

---

### H3 — Fallback `rimrafMoveRemove` no se activa o falla silenciosamente (prioridad media)

**Descripción**: El fallback `rimrafMoveRemove` (move→remove) es la estrategia más robusta de rimraf en Windows — renombra archivos a `$TEMP` antes de borrarlos, evitando el lock. Este fallback solo se activa cuando `rmdir` falla con `ENOTEMPTY`. Si el lock persistente genera un error diferente (ej. `EPERM` no recoverable por chmod), el fallback no se activa.

**Predicción**: Si ejecuto `npm run clean:modules` con la flag `--impl=move-remove` (si rimraf la soporta), o si simulo la situación donde el directorio tiene archivos locked, el move-remove debería completarse exitosamente.

**Refutación**: Si `rimrafMoveRemove` también falla con archivos locked, entonces la causa es más profunda (el handle se mantiene a nivel de proceso, no de filesystem).

**Costo de test**: Alto. Requiere investigar si rimraf CLI soporta la flag `--impl` directamente o si hay que pasar opciones programáticamente.

---

### H4 — Implementación `native` de Node.js `fs.rm` funciona mejor que la manual en Windows (prioridad baja)

**Descripción**: `use-native.js` muestra que en Windows, rimraf NO usa la implementación nativa de Node.js (`fs.rm`) sino la manual. Esto es intencional porque la implementación nativa de Node.js tiene menos features en Windows. Sin embargo, `fs.rm` con `force: true` y `recursive: true` podría comportarse diferente ante locks.

**Predicción**: Si ejecuto rimraf con `--impl=native` (flag disponible en rimraf v6+), la eliminación podría comportarse diferente. Esto es poco probable que resuelva el problema dado que rimraf explícitamente evita el native en Windows por diseño.

**Refutación**: Si el comportamiento con `--impl=native` es igual o peor, entonces la implementación native no es la solución.

**Costo de test**: Bajo (solo agregar `--impl=native` al comando).

---

## Recomendación

**Prioridad de test**: H1 → H2 → H4 → H3.

H1 es la hipótesis más probable basándose en el código: `fixEPERM` returning silently cuando chmod falla es un camino directo a "rimraf exit 0 con directorio incompleto". Es también la más barata de testear.

La estrategia de fix más probable: un script dedicado para `clean:modules` que en Windows primero mate procesos con handles abiertos (`node`, `esbuild`, `vitest`) y luego ejecute rimraf, con logging del estado antes y después para detectar el silent failure.