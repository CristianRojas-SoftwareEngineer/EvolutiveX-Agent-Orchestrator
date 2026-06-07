---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 03-research
version: v1.0
timestamp: 2026-06-07T21:05:00Z
status: in_progress
inputs: [case.md, 02-problem-definition.md, MEMORY.md]
produces: 03-research.md
links: { previous: "02-problem-definition.md", next: }
---

# 03 — Research — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | recent changes / regressions in the area |
| reasoning_effort | medium |
| evidence | related_commits, code_refs |
| acceptance | suspected change(s) localized |
| risk_controls | — |

## Recalled lessons

MEMORY.md no contiene lecciones para el par `(scripting/clean-modules, Windows file-lock)`. La búsqueda por `component: scripting` y `defect-class: file-lock` retornó vacío. No hay prior art en la base de conocimiento para este caso.

## Findings

### F1 — rimraf versión y estrategia por defecto en Windows

Fuente: `node_modules/rimraf/package.json` (v6.1.3) y `node_modules/rimraf/dist/esm/use-native.js`.

```javascript
// use-native.js líneas 12-15
export const useNative = !hasNative || process.platform === 'win32' ?
    () => false
    : opt => !opt?.signal && !opt?.filter;
```

En Windows 11, `rimraf` usa la implementación `manual` (no la nativa de Node.js `fs.rm`). La implementación `manual` es `rimraf-windows.js` — específica para Windows con retry de `EBUSY`/`EMFILE`/`ENFILE`.

### F2 — Estrategia Windows: two-pass + retry + fallback

Fuente: `node_modules/rimraf/dist/esm/rimraf-windows.js`.

La implementación `manual` para Windows ejecuta dos pasadas:

1. **Primera pasada**: elimina todos los archivos (no directorios) usando `rimrafWindowsFile = retryBusy(fixEPERM(unlink))`.
2. **Segunda pasada**: elimina todos los directorios usando `rimrafWindowsDirRetry = retryBusy(fixEPERM(rmdir))`.
3. **Fallback**: si `rmdir` falla con `ENOTEMPTY`, cae a `rimrafMoveRemove` (estrategia move→remove que evita el lock de Windows al renombrar antes de borrar).

```javascript
// rimraf-windows.js: rimrafWindowsDirMoveRemoveFallback
if (errorCode(er) === 'ENOTEMPTY') {
    return rimrafMoveRemove(path, opt);
}
```

### F3 — Retry con exponential backoff para EBUSY

Fuente: `node_modules/rimraf/dist/esm/retry-busy.js`.

`retryBusy` reintenta hasta 10 veces con backoff exponencial para `EBUSY`, `EMFILE`, `ENFILE`:

```javascript
const MAXBACKOFF = 200;
const RATE = 1.2;
const MAXRETRIES = 10;
const codes = new Set(['EMFILE', 'ENFILE', 'EBUSY']);
```

Si después de todos los retries el lock persiste, el error se propaga.

### F4 — `fixEPERM` para errores de permiso

Fuente: `node_modules/rimraf/dist/esm/fix-eperm.js`.

```javascript
export const fixEPERM = (fn) => async (path) => {
    try { return void (await ignoreENOENT(fn(path))); }
    catch (er) {
        if (errorCode(er) === 'EPERM') {
            if (!(await ignoreENOENT(chmod(path, 0o666).then(() => true), er))) {
                return;  // silently gives up
            }
            return void (await fn(path));
        }
        throw er;
    }
};
```

Si `chmod` falla, la función retorna sin error (`return;`). Esto puede causar que archivos con lock no se eliminen sin que rimraf lo reporte.

### F5 — Exit code del CLI

Fuente: `node_modules/rimraf/dist/esm/bin.mjs`.

```javascript
main(...process.argv.slice(2)).then(code => process.exit(code), er => {
    console.error(er);
    process.exit(1);
});
```

Si rimraf lanza un error no manejado, sale con código 1. Si completa (incluso parcialmente), sale 0.

### F6 — Estrategia move-remove (fallback para ENOTEMPTY)

Fuente: `node_modules/rimraf/dist/esm/rimraf-move-remove.js`.

La estrategia move-remove renombra cada archivo a un nombre temporal en `$TEMP` antes de borrarlo, evitando el problema de archivos bloqueados en Windows. Es 2-10× más lenta que la estrategia directa, pero más robusta ante locks.

## Related code

| Archivo | Relevancia |
|---|---|
| `package.json:24` | `"clean:modules": "rimraf node_modules"` — sin script dedicado |
| `node_modules/rimraf/dist/esm/rimraf-windows.js` | Implementación Windows con retry/fallback |
| `node_modules/rimraf/dist/esm/fix-eperm.js` | `fixEPERM` — puede silently give up en lock |
| `node_modules/rimraf/dist/esm/retry-busy.js` | Retry con backoff para EBUSY/EMFILE/ENFILE |
| `node_modules/rimraf/dist/esm/rimraf-move-remove.js` | Fallback robusto pero lento |
| `node_modules/rimraf/dist/esm/use-native.js` | `useNative = false` en Windows |
| `scripting/verify-config.ts:448-462` | Step `clean-modules` + verificador `path-absent-node-modules` |

## Constraints

- `rimraf` ya tiene retry y fallback en Windows — el problema no es ausencia de retry, sino que algún lock persiste más allá de los retries permitidos.
- El comando actual en `package.json` no pasa opciones adicionales a rimraf — no se explota el `--impl` flag.
- No hay script dedicado para `clean:modules` — el comando es directo en `package.json`.
- La solución debe preservar el comportamiento en entornos no-Windows (Linux/macOS) donde `rimraf` funciona correctamente.

## Hipótesis de trabajo para fase 04

1. El lock persiste más allá de los 10 retries de `retryBusy` — podría resolverse aumentando `maxRetries`.
2. `fixEPERM` silently gives up en algunos casos — podría causarse por `chmod` fallando en archivos locked.
3. La implementación `native` de Node.js (`--impl=native`) podría comportarse diferente en Windows.
4. Un script dedicado que mate procesos con handles antes de rimraf podría resolver el problema de raíz.