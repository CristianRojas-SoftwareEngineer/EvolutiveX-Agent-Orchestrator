# Tasks: statusline-subscription-quota-providers

> **Alcance:** cache de cuota en proxy (B) + dispatch multi-fuente en statusline (C). Primera integración: Minimax Token Plan. Ver `design.md` para decisiones D1–D8.

## 1. Configuración de proveedor

- [x] 1.1 Añadir bloque `SUBSCRIPTION_QUOTA` en `routing/providers/minimax/config.json` según `design.md` D2 (`enabled`, `adapter`, `endpoint`, `auth_credential`, `model_filter: "general"`, `refresh_interval_seconds: 60`).
- [x] 1.2 Extender `scripting/shared/provider-config.ts`: definir tipo `SubscriptionQuotaConfig`; preservar `SUBSCRIPTION_QUOTA` como objeto al parsear `config.json` (no flatten a string); exportar helper `readSubscriptionQuotaFromProviderDir(providerDir)` si simplifica tests.
- [x] 1.3 Verificar que `loadProviderConfig('minimax')` sigue resolviendo modelos y secrets sin regresión (`npm run test:quick`).

## 2. Dominio y tipos (capa 1)

- [x] 2.1 Crear `src/1-domain/types/subscription-quota.types.ts` con `SubscriptionQuotaWindow`, `SubscriptionQuotaFile`, `SubscriptionQuotaProviderConfig` alineados al schema de `design.md` D1.
- [x] 2.2 Crear función pura exportable para mapeo Minimax (p. ej. `mapMinimaxTokenPlanRemains`) en `src/1-domain/services/` o `src/2-services/subscription-quota/` según convención del repo — **SHALL** implementar reglas normativas de `specs/subscription-quota-cache/spec.md` (adapter).
- [x] 2.3 Escribir `tests/2-services/minimax-token-plan-remains.adapter.test.ts` con fixture del spike (counts 0/0, `remaining_percent` 86/20, `remains_time` positivo) — verificar `used_percentage` 14/80 y `resets_at` derivado.

## 3. Servicios proxy (capa 2)

- [x] 3.1 Crear `src/2-services/provider-routing-resolver.service.ts`: leer `configs/.env` + escanear `routing/providers/*/config.json`; emparejar `ANTHROPIC_BASE_URL === UPSTREAM_ORIGIN`; mergear `secrets.json`; retornar `null` si no hay match.
- [x] 3.2 Crear `src/2-services/subscription-quota.service.ts` con métodos `refreshIfNeeded(sessionDir: string): Promise<void>`: comprobar TTL vía `fetched_at`; invocar adapter registrado; `writeJsonAtomic` a `subscription-quota.json`; capturar errores con `logger.warn` sin throw.
- [x] 3.3 Registrar adapter `minimax_token_plan_remains` en el servicio (mapa `adapter id → fetch+map`).
- [x] 3.4 Escribir `tests/2-services/provider-routing-resolver.service.test.ts` con directorio temporal de providers mock.
- [x] 3.5 Escribir `tests/2-services/subscription-quota.service.test.ts`: TTL skip, escritura exitosa con fetch mock, error de red preserva archivo previo, credencial ausente omite fetch.

## 4. Enganche en operations (capa 3)

- [x] 4.1 Ampliar `persistBillableStepMetricsIfNeeded` en `src/3-operations/persist-billable-step-metrics.util.ts` para aceptar `subscriptionQuota?: SubscriptionQuotaService` opcional y llamar `void subscriptionQuota.refreshIfNeeded(sessionDir)` **después** de `updateFromStep` exitoso.
- [x] 4.2 Pasar `subscriptionQuota` desde `AuditSseResponseHandler` y `AuditStandardResponseHandler` al util (constructor o campo inyectado).
- [x] 4.3 Instanciar `ProviderRoutingResolverService` y `SubscriptionQuotaService` en `src/4-api/composition-root.ts`; exponer en deps si hace falta para tests de integración.

## 5. Statusline — dispatch y render (capa C)

- [x] 5.1 Crear `resolveQuotaSource(ctx, paths, settingsEnv, sessionPath?)` en `scripting/router-status.ts` con orden de resolución de `specs/statusline-runtime/spec.md` (stdin oauth → archivo → null).
- [x] 5.2 Implementar lectura de `subscription-quota.json` y carga de `SUBSCRIPTION_QUOTA` del proveedor activo bajo `projectRoot`.
- [x] 5.3 Reemplazar `const table3 = authMethod === 'oauth' ? ...` por flujo con `resolveQuotaSource`; eliminar variable `authMethod` local si queda sin uso.
- [x] 5.4 Modificar `buildRateLimitTableData`: distinguir `used_percentage` no calculable → celda `"-"` sin barra; no usar `?? 0`.
- [x] 5.5 Modificar `formatTimeRemaining` para Tabla 3: inválido → `"-"`; válido expirado → `"Ahora"`; eliminar `"N/A"` en rutas de Tabla 3.
- [x] 5.6 Actualizar comentario de cabecera del archivo (`Tabla 3: cuota de suscripción vía resolveQuotaSource`).
- [x] 5.7 Reescribir test `no muestra rate limits con bearer aunque ctx traiga rate_limits` en `tests/scripting/router-status-output.test.ts`: caso OpenRouter/bearer sin config sigue oculto.
- [x] 5.8 Añadir test Minimax: `projectRoot` + `configs/.env` + `routing/providers/minimax/config.json` mock + `subscription-quota.json` en sesión → output contiene «Límites de uso por suscripción» con bearer token en settings.
- [x] 5.9 Añadir test fallback `"-"`: archivo con ventana sin `used_percentage` calculable → celda muestra guión.
- [x] 5.10 Verificar tests oauth existentes (`muestra rate limits con oauth y rate_limits en ctx`) sin regresión.

## 6. Documentación

- [x] 6.1 Actualizar `docs/router-statusline.md` §3.3: dispatch multi-fuente; fuente `subscription-quota.json`; eliminar exclusividad oauth-only; tabla de fuentes de datos; fallback `"-"`; comportamiento Minimax bearer.
- [x] 6.2 Actualizar `docs/router-statusline.md` §4 dispatch diagram y §4.2 condición side-by-side.
- [x] 6.3 Añadir sección en `docs/session-metrics-system.md` documentando `subscription-quota.json` (escritura proxy, lectura statusline, TTL, relación con `session-metrics.json`).
- [x] 6.4 Actualizar tabla «Comportamiento ante entradas inválidas» en router-statusline: bearer con cuota en disco; archivo corrupto.

## 7. Limpieza de código legacy

- [x] 7.1 Eliminar gate `authMethod === 'oauth'` y comentarios §3.3 obsoletos en `router-status.ts`.
- [x] 7.2 Buscar referencias a «Tabla 3 solo OAuth» en comentarios de tests y alinear con nuevo contrato.
- [x] 7.3 Confirmar que `resolveAuthMethodFromEnv` sigue exportada (tests propios) aunque ya no gatee Tabla 3.

## 8. Verificación

- [x] 8.1 Ejecutar `npm run test:quick` — lint + typecheck + unit deben pasar.
- [x] 8.2 Ejecutar `npm run test` completo antes de cerrar el change.
- [x] 8.3 Validación manual: proxy activo con Minimax, un hop facturable, comprobar que `sessions/<id>/subscription-quota.json` se crea con `five_hour`/`seven_day`.
- [x] 8.4 Validación manual: invocar `router-status.ts` con `session_id` de esa sesión y bearer en settings — Tabla 3 visible junto a Tabla 1.
