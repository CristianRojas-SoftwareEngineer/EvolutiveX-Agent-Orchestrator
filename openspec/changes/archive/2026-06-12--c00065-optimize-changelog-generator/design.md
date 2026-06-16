## Context

`scripting/generate-changelog` es un script bash que regenera `CHANGELOG.md` desde cero leyendo el historial git. Fue diseñado originalmente como el artefacto de salida de la fase 10 del subsistema sm-* (ya eliminado). Tiene tres problemas:

1. **Complejidad O(n × t × s)**: invoca `git log` una vez por sección (4) por cada bloque de releases (1 + número de tags), spawneando hasta 4 × (1 + t) procesos.
2. **Código muerto heredado de sm-***: argumentos `--pending`/`--case` y el trailer `%(trailers:key=Case,valueonly)` que nunca se usa en el historial actual.
3. **Sin invocación automática**: tras la eliminación de sm-orchestrator, el script solo puede ejecutarse manualmente. El `CHANGELOG.md` está desactualizado.

El repo usa hooks de Claude Code (en `~/.claude/settings.json`) para eventos de sesión, y un mecanismo de hooks git nativo (`.git/hooks/`) vacío (solo `.sample`).

## Goals / Non-Goals

**Goals:**

- Reducir las invocaciones de `git log` a exactamente una, independiente del número de tags y secciones.
- Eliminar los argumentos y lógica heredados de sm-* (`--pending`, `--case`, trailers).
- Instalar un hook git `post-commit` que invoque el script automáticamente tras cada commit.
- Regenerar `CHANGELOG.md` al estado actual del historial.

**Non-Goals:**

- Soporte de formato Keep a Changelog para tipos adicionales (`chore`, `test`, `build`, `ci`, `style`) — se mantienen descartados por diseño.
- Integración con el sistema de hooks de Claude Code (`~/.claude/settings.json`) — esos hooks son para eventos de sesión del agente, no de git.
- Versionado semántico automático o generación de tags — fuera de alcance.
- Migración a herramientas de terceros (`conventional-changelog`, `semantic-release`) — el script bash propio es suficiente y sin dependencias extra.

## Decisions

### D1 — Una sola pasada con clasificación en memoria

**Decisión**: leer el historial completo en una sola invocación de `git log` con `--pretty="%D %s"` (o formato separado), acumular entradas en variables por sección en memoria, y escribir el archivo al final.

**Alternativa descartada**: mantener múltiples pasadas con rangos distintos por sección. Descartada porque el problema de escalabilidad crece con los tags y el script ya lee el historial entero de todas formas.

**Implementación**: usar `git log` con formato `%H %D %s` para obtener en una pasada el hash, los refs (para detectar tags y construir secciones), y el subject. Procesar con `awk` o lógica bash acumulando en arrays asociativos por tipo (`feat`→Added, `fix`→Fixed, `perf|refactor`→Changed, `docs`→Documentation).

### D2 — Hook git `post-commit` instalado en `.git/hooks/`

**Decisión**: escribir `.git/hooks/post-commit` (script bash que llama a `scripting/generate-changelog && git add CHANGELOG.md && git commit --amend --no-edit --no-verify`) e incluir un script de instalación en `scripting/install-changelog-hook` para que sea reproducible (`.git/` no se versiona).

**Alternativa descartada**: hook en `~/.claude/settings.json`. Los hooks de Claude Code disparan en eventos de sesión del agente, no en eventos git — no hay un evento equivalente a `post-commit`.

**Alternativa descartada**: `npm run changelog` como script manual en `package.json`. No elimina la dependencia de memoria humana.

**Riesgo del amend**: el `--amend --no-edit --no-verify` en `post-commit` modifica el commit recién creado para incluir `CHANGELOG.md`. Esto cambia el SHA del commit, lo que puede confundir a herramientas que ya leyeron el SHA original. Mitigación: documentar que el hook no debe usarse en flujos con `post-commit` hooks que dependan del SHA final (p. ej. firmas GPG automáticas). El `--no-verify` omite pre-commit en el amend para evitar recursión.

### D3 — Eliminar argumentos sm-* sin reemplazo

**Decisión**: `--pending` y `--case` se eliminan. No existe consumidor activo; el único consumidor (sm-phase-conclusion) fue borrado.

**Sin reemplazo**: si en el futuro se quiere prepend de una entrada pendiente, se puede agregar como argumento nuevo con diseño limpio.

## Risks / Trade-offs

- **SHA cambia con amend** → el hook invalida el SHA del commit original. Aceptable en este repo (sin CI que firme commits ni hooks de push que dependan del SHA exacto). Documentar en el instalador.
- **`.git/hooks/` no se versiona** → el hook debe reinstalarse en cada clone. El script `scripting/install-changelog-hook` lo resuelve; se documenta en README.
- **Recursión de hooks** → `post-commit` con `git commit --amend` podría triggear `post-commit` de nuevo. Git no re-dispara `post-commit` en `--amend`, por lo que la recursión no ocurre en versiones estándar de git.
- **CHANGELOG con entradas de commits eliminados lógicamente** → commits de sm-* siguen en el historial; seguirán apareciendo en el CHANGELOG. Esto es correcto: el changelog refleja el historial, no el estado actual del código. Las eliminaciones mismas quedan como entradas `refactor:`/`chore:` según su tipo.

## Migration Plan

1. Reescribir `scripting/generate-changelog` (una sola pasada, sin argumentos sm-*).
2. Crear `scripting/install-changelog-hook` (instala `.git/hooks/post-commit`).
3. Ejecutar `scripting/install-changelog-hook` para instalar el hook localmente.
4. Ejecutar `scripting/generate-changelog` para regenerar `CHANGELOG.md` al estado actual.
5. Commitear `CHANGELOG.md` regenerado y los dos scripts modificados/nuevos.

**Rollback**: revertir el commit. El hook instalado en `.git/hooks/post-commit` debe eliminarse manualmente (`rm .git/hooks/post-commit`) ya que no se versiona.
