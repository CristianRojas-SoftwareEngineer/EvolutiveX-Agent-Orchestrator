## 1. Nuevo hook autocontenido

- [x] 1.1 Crear `scripting/hooks/session-end-hook.ts`: cliente HTTP autocontenido (solo `node:` builtins + `fetch` global), sintaxis erasable-only, sin imports relativos.
- [x] 1.2 Implementar lectura del payload JSON de stdin y un único `POST /hooks` síncrono con URL resuelta vía `ANTHROPIC_BASE_URL` (sin host:puerto literal); exit code 0 en éxito, distinto de 0 en fallo.

## 2. Plantilla canónica de hooks

- [x] 2.1 Modificar la entrada `SessionEnd` de `configs/hooks.json` a `node "${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}/scripting/hooks/session-end-hook.ts"`.
- [x] 2.2 Quitar `"async": true` y toda referencia a `npx`/`tsx`/`detached-session-end-relay.ts` de la entrada `SessionEnd`.

## 3. Instalador (scripting/features/hooks.ts)

- [x] 3.1 Actualizar `validateScpRoot` para exigir `scripting/hooks/session-end-hook.ts` en vez de `scripting/detached-session-end-relay.ts`.
- [x] 3.2 Renombrar/reapuntar la constante `DETACHED_SESSION_END_RELAY_SEGMENT` al segmento del nuevo hook (`scripting/hooks/session-end-hook.ts`).
- [x] 3.3 Conservar el substring `detached-session-end-relay` en `isScpManagedCommand` (junto a `session-end-hook`) para reconocer y limpiar instalaciones previas en la reinstalación/uninstall.

## 4. Retirada del legacy

- [x] 4.1 Eliminar `scripting/detached-session-end-relay.ts`.
- [x] 4.2 Eliminar `tests/scripting/detached-session-end-relay.test.ts`.
- [x] 4.3 Eliminar imports/símbolos huérfanos que queden tras la retirada (verificar referencias al relay en todo el repo).

## 5. Tests

- [x] 5.1 Añadir test del nuevo hook: lectura de stdin + `POST /hooks` y resolución de URL vía `ANTHROPIC_BASE_URL`.
- [x] 5.2 Ajustar tests de `scripting/features/hooks.ts`: `validateScpRoot` exige el nuevo archivo; `isScpManagedCommand` reconoce `session-end-hook` y aún reconoce `detached-session-end-relay` (para limpieza).
- [x] 5.3 Verificar que ningún test residual referencia el relay eliminado.

## 6. Documentación

- [x] 6.1 Actualizar `README.md`: comando de `SessionEnd` (node-directo síncrono) y requisito de Node con type-stripping nativo (≥ 22.18 / 23.6).

## 7. Verificación

- [x] 7.1 Ejecutar typecheck (`tsc --noEmit`) y lint sin errores.
- [x] 7.2 Ejecutar la suite de tests completa en verde.
- [x] 7.3 Smoke manual: `node scripting/hooks/session-end-hook.ts` con payload de prueba en stdin entrega `POST /hooks` (gateway recibe el evento).
- [ ] 7.4 Manual gate (pendiente, fuera de CI): `/exit` interactivo real confirma el toast «Sesión finalizada»; si falla, aplicar fallback a `async` sobre el mismo script.
