## Context

El hook `SessionEnd` no entrega su `POST /hooks` al cerrar una sesión interactiva, por
lo que nunca aparece el toast «Sesión finalizada». La causa raíz está confirmada
empíricamente (ver `proposal.md`): el comando actual
`npx --prefix … tsx … detached-session-end-relay.ts` con `"async": true` tarda
~1471 ms en ejecutar su primera línea por el cold-start de `npx`+`tsx`; como `async`
es fire-and-forget (Claude Code no espera) y `SessionEnd` no puede bloquear, Claude
derriba el subárbol del hook antes de que el relay alcance el `spawn` detached, así que
el hijo detached nunca nace.

Estado actual relevante:
- `configs/hooks.json`: plantilla canónica; 12 eventos usan `post-hook-event.ts`,
  `SessionEnd` usa `detached-session-end-relay.ts` con `"async": true`.
- `scripting/detached-session-end-relay.ts` + `tests/scripting/detached-session-end-relay.test.ts`: el relay a retirar.
- `scripting/features/hooks.ts`: instalador. `validateScpRoot` exige hoy
  `detached-session-end-relay.ts`; `isScpManagedCommand` reconoce comandos SCP por
  substrings (`post-hook-event`, `detached-session-end-relay`, root path).
- `scripting/post-hook-event.ts`: contrato reutilizable; solo `node:` builtins.
- El entorno corre Node 24 (type-stripping nativo de TypeScript disponible).

Restricción dura del usuario: la solución debe permanecer en **TypeScript** (no una
solución ad-hoc en JavaScript) y ser **multiplataforma** (sin acoplamiento a Windows).

## Goals / Non-Goals

**Goals:**
- Entregar `POST /hooks` de `SessionEnd` de forma fiable dentro de la ventana de
  teardown de Claude Code.
- Eliminar el cold-start de la ruta crítica del hook.
- Mantener la implementación en TypeScript, autocontenida y multiplataforma.
- Simplificar: retirar el relay detached y el modo async ahora innecesarios.

**Non-Goals:**
- No cambiar el contrato `POST /hooks` ni el gateway (`AuditHookEventHandler`).
- No tocar el comando de los otros 12 eventos (siguen en `post-hook-event.ts`).
- No introducir un paso de build para el hook (no compilar a `dist/`).
- No compartir código con `post-hook-event.ts` (cliente independiente por diseño).

## Decisions

### D1 — Invocación `node` directa sobre `.ts` (type-stripping nativo)

El comando de `SessionEnd` pasa a
`node "${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/hooks/session-end-hook.ts"`.
Node ≥ 22.18 / 23.6 ejecuta `.ts` directamente vía type-stripping nativo (sintaxis
borrable), sin `npx`, sin `tsx`, sin paso de build.

- **Por qué no `npx … tsx`**: el cold-start de ~1471 ms es la causa raíz; es justo lo
  que hay que eliminar.
- **Por qué no compilar a `dist/`**: `dist/` está gitignored y tsup solo compila
  `src/index.ts`; versionar un artefacto compilado o añadir un build-step para un solo
  hook es complejidad innecesaria y contradice la restricción «mantener TS».
- **Alternativa descartada**: script `.mjs` en JavaScript plano — rechazado
  explícitamente por el usuario (todo el proyecto es TypeScript).

Medido: ~212 ms wall-clock, `POST` en ~38 ms (~7× más rápido que el comando previo).

### D2 — Cliente HTTP delgado, autocontenido e independiente

`scripting/hooks/session-end-hook.ts` lee el payload de stdin y hace un único
`POST /hooks` (URL vía `ANTHROPIC_BASE_URL`). Importa **solo** `node:` builtins y usa
`fetch` global; no importa `post-hook-event.ts` ni ningún módulo relativo del repo.

- **Por qué no reutilizar `post-hook-event.ts`**: si el `.ts` importara módulos del
  repo, `node` tendría que resolver y type-strippear esa cadena de imports, añadiendo
  latencia y acoplamiento en la ruta crítica de fiabilidad. Un cliente autocontenido
  de una API estable (`/hooks`) no es duplicación de lógica de negocio: es un cliente
  delgado de un contrato versionado, con blast radius cero.
- **Sintaxis erasable-only obligatoria**: el type-stripping nativo no transforma
  enums, namespaces ni parámetros con modificadores de acceso; el script debe limitarse
  a anotaciones de tipo borrables.

### D3 — Ejecución síncrona (sin `async`, sin detached)

La entrada deja de declarar `"async": true` y deja de usar el relay detached. Con el
arranque rápido, el `POST` síncrono cabe dentro de la ventana de teardown, que es el
comportamiento más simple y fiable si Claude espera el hook.

- **Fallback documentado**: si el manual gate (ver Open Questions) demuestra que Claude
  cancela el hook síncrono de `SessionEnd` antes de completarse, se reintroduce
  `"async": true` **sobre el mismo script rápido** (sin reintroducir el relay detached).
  El arranque rápido hace que async fire-and-forget también baste.

### D4 — Retirada del legacy (threading desde el define)

Para los dos requirements REMOVED del delta-spec:
- Eliminar `scripting/detached-session-end-relay.ts` y
  `tests/scripting/detached-session-end-relay.test.ts`.
- En `scripting/features/hooks.ts`: `validateScpRoot` pasa a exigir
  `scripting/hooks/session-end-hook.ts` (reemplazando el requisito de
  `detached-session-end-relay.ts`); renombrar/reapuntar la constante de segmento
  (`DETACHED_SESSION_END_RELAY_SEGMENT` → segmento del nuevo hook).
- **Conservar** el substring `detached-session-end-relay` en `isScpManagedCommand`:
  permite que la reinstalación/uninstall reconozca y limpie instalaciones previas en
  `~/.claude/settings.json` que aún apunten al relay viejo.

### D5 — Multiplataforma

Solo API de Node (`node:process`/`fetch`), sin shell, sin rutas ni utilidades
específicas de SO. El placeholder `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` lo resuelve
el instalador como hoy.

## Risks / Trade-offs

- **El hook síncrono podría ser cancelado en el teardown** → Mitigación: fallback D3 a
  `async` sobre el mismo script rápido; no requiere reintroducir el relay detached.
- **Dependencia de Node ≥ 22.18 / 23.6 (type-stripping nativo)** → Mitigación:
  documentar el requisito de versión en README e impacto del proposal; el entorno usa
  Node 24.
- **Sintaxis no-erasable rompería la ejecución `node`-directa** → Mitigación: mantener
  el script en anotaciones borrables; el test de humo de arranque lo detecta.
- **Instalaciones previas con el relay detached quedarían huérfanas** → Mitigación: D4
  conserva el reconocimiento del substring para limpiarlas en la reinstalación.

## Migration Plan

1. Crear `scripting/hooks/session-end-hook.ts` (cliente autocontenido, erasable-only).
2. Modificar la entrada `SessionEnd` de `configs/hooks.json` a `node`-directo síncrono.
3. Actualizar `scripting/features/hooks.ts` (`validateScpRoot` + constante de segmento;
   conservar substring detached en `isScpManagedCommand`).
4. Eliminar `scripting/detached-session-end-relay.ts` y su test.
5. Actualizar spec canónica `hooks-lifecycle-correlation` y README.
6. Post-merge: `npm run setup:install -- --hooks` + reiniciar Claude Code para
   repropagar `~/.claude/settings.json`.

**Rollback**: revertir el commit del delta restaura el comando previo; como el
instalador reconoce ambos substrings, una reinstalación tras el rollback recompone la
entrada anterior.

## Open Questions

- **Manual gate del `/exit` interactivo**: confirmar en una sesión real que el hook
  síncrono gana la carrera del teardown (no automatizable: requiere TTY). Si falla,
  aplicar el fallback D3 (async sobre el mismo script).
