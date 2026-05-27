# statusline-runtime Specification

## Purpose

Comportamiento de `router-status.ts` al resolver `sessions/`, `routing/providers` y `configs/.env` desde `env.SMART_CODE_PROXY_ROOT` en settings global, con fallback a `process.cwd()`, para que las métricas de sesión sean correctas aunque Claude Code ejecute el subprocess en otro workspace.
## Requirements
### Requirement: Resolución de projectRoot desde settings

`router-status.ts` SHALL resolver `projectRoot` leyendo `SMART_CODE_PROXY_ROOT` desde el bloque `env` de `~/.claude/settings.json` (misma fuente que auth y modelos por nivel), no desde variables de entorno del shell del proceso.

#### Scenario: ROOT configurado y válido

- **GIVEN** `settings.env.SMART_CODE_PROXY_ROOT` es una ruta absoluta que contiene `routing/providers`
- **WHEN** `router-status` construye rutas a `sessions/`, `routing/providers` y `configs/.env`
- **THEN** todas SHALL estar bajo esa raíz, independientemente de `process.cwd()` del subprocess

#### Scenario: ROOT ausente

- **GIVEN** `settings.env` no define `SMART_CODE_PROXY_ROOT` o está vacío
- **WHEN** `router-status` resuelve `projectRoot`
- **THEN** SHALL usar `path.resolve(process.cwd())` como comportamiento compatible con instalaciones previas

#### Scenario: ROOT inválido

- **GIVEN** `SMART_CODE_PROXY_ROOT` apunta a un directorio sin `routing/providers`
- **WHEN** `router-status` resuelve `projectRoot`
- **THEN** SHALL hacer fallback a `process.cwd()` sin lanzar error fatal

### Requirement: Lectura de settings sin dependencia de configure-provider

La resolución de `projectRoot` SHALL ocurrir en cada invocación del statusline leyendo el archivo `settings.json`, de modo que reinstalar o mover el repo y volver a ejecutar el instalador sea suficiente para actualizar rutas sin reiniciar el proxy.

#### Scenario: ROOT actualizado tras reinstalar

- **GIVEN** el usuario movió el clon del repositorio y ejecutó de nuevo el instalador
- **WHEN** Claude Code invoca el statusline en la siguiente sesión
- **THEN** `router-status` SHALL leer el nuevo `SMART_CODE_PROXY_ROOT` del archivo

### Requirement: Compatibilidad con opciones de test

`router-status` SHALL seguir aceptando `projectRoot` y `sessionsRoot` inyectados vía `StatuslineBuildOptions` para tests, con prioridad sobre `SMART_CODE_PROXY_ROOT` y sobre `process.cwd()`.

#### Scenario: Test con projectRoot inyectado

- **GIVEN** un test pasa `projectRoot` en `StatuslineBuildOptions`
- **WHEN** se llama a `buildStatuslineOutput`
- **THEN** las rutas resueltas SHALL usar el valor inyectado

### Requirement: Métricas de sesión bajo ROOT correcto

Cuando `ctx.session_id` tiene carpeta coincidente bajo `<projectRoot>/sessions/`, la Tabla 2 SHALL agregar desde `<projectRoot>/sessions/<dir>/session-metrics.json` según el diseño en [`docs/router-statusline.md`](../../../docs/router-statusline.md).

#### Scenario: Workspace distinto al repo del proxy

- **GIVEN** `SMART_CODE_PROXY_ROOT` apunta al repo del proxy
- **AND** `process.cwd()` del subprocess es otro proyecto
- **AND** existe `sessions/<sessionId>/session-metrics.json` bajo la raíz del proxy
- **WHEN** Claude Code invoca el statusline con ese `session_id` en stdin
- **THEN** la Tabla 2 SHALL mostrar métricas distintas de cero para niveles con actividad

