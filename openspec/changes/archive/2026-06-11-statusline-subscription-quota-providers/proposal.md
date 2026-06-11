## Why

La Tabla 3 del statusline («Límites de uso por suscripción») muestra cuota 5h y semanal con barra de progreso y tiempo hasta reinicio. Hoy solo aparece con autenticación OAuth de Anthropic porque Claude Code inyecta `ctx.rate_limits` en stdin. Los proveedores con suscripción por API key — en particular **Minimax Token Plan** (`AUTH_METHOD: bearer`) — no reciben esos datos en stdin, aunque Minimax expone un endpoint dedicado (`GET /v1/token_plan/remains`) con ventanas 5h y semanal validado en este repositorio.

El usuario que enruta Claude Code vía Smart Code Proxy hacia Minimax no ve cuota de suscripción en el statusline mientras sí la ve con Anthropic OAuth. Se necesita un mecanismo homólogo sin duplicar la UI: reutilizar `renderRateLimitTable` alimentándolo desde una fuente por proveedor.

## What Changes

- Añadir bloque declarativo `SUBSCRIPTION_QUOTA` en `routing/providers/*/config.json` para proveedores con API de cuota de suscripción.
- Implementar en el **proxy** (capa B) fetch con TTL, normalización y escritura atómica de `sessions/<sessionDir>/subscription-quota.json` tras hops facturables.
- Implementar adapter `minimax_token_plan_remains` que mapee `current_interval_remaining_percent`, `remains_time`, `current_weekly_remaining_percent` y `weekly_remains_time` al shape `{ five_hour, seven_day }` (los campos `*_count` en 0 no son fiables; usar `remaining_percent` como fuente primaria).
- Ampliar el **dispatch** del statusline (capa C): sustituir el gate `authMethod === 'oauth'` por `resolveQuotaSource()` con dos ramas — stdin OAuth Anthropic **o** lectura de `subscription-quota.json` cuando el proveedor activo tiene `SUBSCRIPTION_QUOTA.enabled`.
- Mantener el título de Tabla 3: «Límites de uso por suscripción».
- Mostrar `"-"` en celdas de barra/% o tiempo de reinicio cuando el dato no sea calculable, esté vacío o sea inválido (no usar `N/A` ni `?? 0` que enmascaren ausencia de datos).
- Actualizar `docs/router-statusline.md`, `docs/session-metrics-system.md` y specs OpenSpec afectadas.
- **BREAKING (contrato documentado, no API HTTP):** la Tabla 3 deja de ser exclusiva de `oauth`; un proveedor `bearer` con `SUBSCRIPTION_QUOTA` y archivo de cuota válido **SHALL** mostrar Tabla 3.

## Capabilities

### New Capabilities

- `subscription-quota-cache`: el proxy SHALL resolver el proveedor activo desde `UPSTREAM_ORIGIN` + `routing/providers/`, consultar la API de cuota configurada con TTL, y persistir `subscription-quota.json` por sesión.

### Modified Capabilities

- `statusline-runtime`: el statusline SHALL resolver cuota de suscripción desde stdin (OAuth Anthropic) **o** desde `subscription-quota.json`; SHALL renderizar Tabla 3 con fallback `"-"` para datos no calculables; SHALL NOT depender exclusivamente de `authMethod === 'oauth'`.

## No objetivos

- Mostrar cuota RPM/TPM transitoria (~1 min) de Minimax; solo ventanas de suscripción 5h/7d.
- Fetch HTTP desde `router-status.ts` (el statusline solo lee disco).
- Soporte pay-as-you-go Anthropic (`api_key`) ni proveedores bearer sin bloque `SUBSCRIPTION_QUOTA` (OpenRouter, Ollama, Xiaomi).
- Refresh de cuota en hook `SessionStart` (opcional futuro; fuera de este change).
- Migración retroactiva de sesiones antiguas sin `subscription-quota.json`.

## Impact

- **Capas PKA afectadas:** `1-domain` (tipos), `2-services` (fetch, mapper, resolver de routing), `3-operations` (hook post-hop), `4-api` (composition root), scripting/statusline (lectura + dispatch).
- **Directorios clave:**
  - `routing/providers/minimax/config.json` — bloque `SUBSCRIPTION_QUOTA`
  - `src/2-services/` — servicios nuevos de cuota y resolución de proveedor
  - `src/3-operations/persist-billable-step-metrics.util.ts` — disparo de refresh
  - `scripting/router-status.ts` — `resolveQuotaSource`, fallback `"-"`
  - `scripting/shared/provider-config.ts` — parseo de `SUBSCRIPTION_QUOTA`
  - `sessions/<id>/subscription-quota.json` — artefacto nuevo por sesión
  - `docs/router-statusline.md`, `docs/session-metrics-system.md`
- **Tests nuevos/modificados:**
  - `tests/2-services/subscription-quota*.test.ts`
  - `tests/scripting/router-status-output.test.ts` (ajustar test bearer; añadir minimax con archivo)
- **Dependencias nuevas:** ninguna (fetch nativo Node).
- **Riesgo transversal:** el proxy hoy no lee `routing/providers/`; este change introduce ese puente (hoy solo existe en `scripting/router-status.ts`).
- **Verificación:** `npm run test:quick` tras cada grupo de tareas; `npm run test` antes de cerrar el change.
