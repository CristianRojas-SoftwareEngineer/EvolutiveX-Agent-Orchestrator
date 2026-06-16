## Why

El script `scripting/generate-changelog` invoca `git log` múltiples veces por sección y por tag de versión (O(n × t × s)), no tiene trigger automático tras la eliminación del subsistema sm-* que lo invocaba, y contiene argumentos y lógica heredados de ese experimento (`--pending`, `--case`, trailers `Case:`) que ya son código muerto. El resultado es un `CHANGELOG.md` desactualizado y un mecanismo huérfano que requiere invocación manual.

## What Changes

- **Reescritura del script** `scripting/generate-changelog`: una sola invocación de `git log` sobre todo el historial; clasificación en memoria; eliminación de los argumentos `--pending` y `--case` y del trailer `Case:`; documentación explícita de los tipos descartados (`chore`, `test`, `build`, `ci`, `style`).
- **Hook `post-commit`**: instalación de un hook git `post-commit` en el mecanismo de hooks existente del repo que invoca el script tras cada commit, manteniendo el CHANGELOG siempre sincronizado sin intervención manual.
- **Regeneración del CHANGELOG**: ejecución del script optimizado para actualizar `CHANGELOG.md` al estado actual del historial git.

## Capabilities

### New Capabilities

- `changelog-single-pass`: generación del changelog en una sola pasada de `git log` con clasificación en memoria — O(n) real independiente del número de tags y secciones.
- `changelog-post-commit-hook`: invocación automática del generador tras cada commit mediante hook `post-commit`.

### Modified Capabilities

*(ninguna — no hay specs existentes para el generador de changelog)*

## Impact

- `scripting/generate-changelog`: reescritura completa del script bash.
- `.claude/settings.json` o mecanismo de hooks del repo: registro del hook `post-commit`.
- `CHANGELOG.md`: regenerado al ejecutar el script optimizado.
- Sin impacto en `src/`, `tests/`, ni en ninguna capa PKA (1-domain … 5-user-interfaces): el cambio es puramente de tooling/scripting.
