## 1. Dominio — tipos y función pura

- [x] 1.1 Añadir `'fifo-pending'` a la unión `CorrelationMethod` en `src/1-domain/types/audit.types.ts` (:265) y actualizar el JSDoc de la unión (:256-264) documentando el nuevo valor y su posición en la jerarquía de autoridad (§21). Criterio: `npm run test:quick` verde sin cambios adicionales.
- [x] 1.2 Crear `src/1-domain/services/join-tool-use-to-subagent.service.ts` con la función pura `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)` implementando la tabla de política §23 (8 filas). Sin I/O; sin importar de capas 2–5. Criterio: el archivo compila sin errores de typecheck.
- [x] 1.3 Crear `tests/1-domain/join-tool-use-to-subagent.test.ts` con los 4 escenarios de la spec (1-pending-headers, N-pendings-headers-prompt-match, N-pendings-sin-cabeceras-sin-match-FIFO, 0-pendings-headers). Criterio: `npm run test:quick` verde con los 4 tests pasando.

## 2. Operations — refactorización del handler

- [x] 2.1 Refactorizar `handleSubagent` en `src/3-operations/audit-interaction.handler.ts` (:332-477) para que ambas ramas (con y sin cabeceras) deleguen en `joinToolUseToSubagent`. La rama con-cabeceras obtiene los pendings del store, llama a `joinToolUseToSubagent` y usa el resultado. El comentario `@deprecated-fallback` se mantiene sobre la llamada de la rama sin-cabeceras. Criterio: `npm run test:quick` verde.
- [x] 2.2 Eliminar el método privado `resolvePendingByPrompt` (:299-324) del handler. Verificar que no queden imports huérfanos ni referencias al método eliminado. Criterio: `npm run lint` sin errores; `npm run test:quick` verde.
- [x] 2.3 Ampliar `tests/3-operations/audit-interaction.handler.test.ts` con escenarios de N-pendings: (a) con cabeceras + 2 pendings → resuelve por prompt-match con `correlationMethod: 'agent-headers'`; (b) sin cabeceras + 2 pendings sin match → resuelve por FIFO con `correlationMethod: 'fifo-pending'`. Criterio: `npm run test:quick` verde incluyendo los nuevos escenarios.

## 3. UI/E2E — test de integración fallback legacy

- [x] 3.1 Ampliar o crear test E2E en `tests/5-user-interfaces/` que ejercite la ruta legacy (sin cabeceras) con 2 pendings paralelos registrados: verificar que la request de subagente resuelve `triggeringToolUseId` por FIFO y que `correlationMethod` es `'fifo-pending'`. Criterio: `npm run test:quick` verde (gate DoD bloque C: "fallback legacy E2E").

## 4. Gate de validación incremental

- [x] 4.1 Ejecutar `npm run test:quick` (lint + typecheck + Vitest completo, incluidos E2E Fastify) y confirmar resultado verde. Criterio: salida sin errores ni tests en rojo.

## 5. Documentación

- [x] 5.1 Actualizar `docs/session-audit-model.md`: añadir `'fifo-pending'` a la tabla de `CorrelationMethod`, describir el join plano B y la política unique/prompt/fifo/diferido. No reescribir secciones no afectadas. Criterio: revisión manual — la tabla refleja los 5 valores y sus semánticas.

## 6. Limpieza de legacy

- [x] 6.1 Confirmar que `resolvePendingByPrompt` no existe en ningún archivo (búsqueda en `src/` y `tests/`). Ejecutar `npm run lint` para verificar que no hay imports huérfanos. Criterio: `grep -r 'resolvePendingByPrompt' src/ tests/` devuelve vacío; `npm run lint` sin errores.

## 7. Gobernanza OpenSpec

- [x] 7.1 Ejecutar `openspec validate --changes gateway-c2-sse-subagent-join` y confirmar que pasa sin errores.
- [x] 7.2 Ejecutar `migration-phase-gate` para la fase C2: verificar trazabilidad, DoD del orquestador y dependencia C1 satisfecha (archivada).
- [x] 7.3 Actualizar el estado de la fase C2 a `validada` en la tabla de `openspec/changes/gateway-migration/design.md`.
- [x] 7.4 Ejecutar `openspec-sync` para sincronizar los deltas de `specs/wire-agent-correlation/spec.md` sobre la spec maestra en `openspec/specs/wire-agent-correlation/spec.md`.
- [x] 7.5 Ejecutar `openspec-archive` para archivar el change `gateway-c2-sse-subagent-join`.
