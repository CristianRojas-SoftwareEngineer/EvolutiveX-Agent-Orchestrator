# subscription-quota-cache Specification

## Purpose

Cache de cuota de suscripción por sesión en el proxy: fetch TTL desde APIs de proveedor (p. ej. Minimax Token Plan), persistencia en `subscription-quota.json`, y lectura por el statusline sin HTTP en `router-status.ts`.

## Requirements

### Requirement: Configuración declarativa SUBSCRIPTION_QUOTA por proveedor

Cada proveedor que exponga cuota de suscripción consultable SHALL declarar un objeto `SUBSCRIPTION_QUOTA` en `routing/providers/<name>/config.json`. El proxy y el statusline SHALL interpretar únicamente proveedores con `SUBSCRIPTION_QUOTA.enabled === true`.

Los campos SHALL cumplir:

| Campo | Obligatorio | Semántica |
|-------|-------------|-----------|
| `enabled` | sí | Activa fetch (proxy) y lectura (statusline) |
| `adapter` | sí | Identificador del mapper (`minimax_token_plan_remains` para Minimax) |
| `endpoint` | sí | URL HTTP GET de la API de cuota |
| `auth_credential` | sí | Nombre de clave en `secrets.json` (p. ej. `ANTHROPIC_AUTH_TOKEN`) |
| `model_filter` | no | Valor de `model_name` a seleccionar en la respuesta (default `"general"`) |
| `refresh_interval_seconds` | no | TTL mínimo entre fetches por sesión (default `60`) |

#### Scenario: Minimax habilitado en config

- **GIVEN** `routing/providers/minimax/config.json` contiene `SUBSCRIPTION_QUOTA.enabled: true` y `adapter: minimax_token_plan_remains`
- **WHEN** el proxy resuelve el proveedor activo con `UPSTREAM_ORIGIN` apuntando a `https://api.minimax.io/anthropic`
- **THEN** SHALL tratar Minimax como proveedor con cuota de suscripción cacheable

#### Scenario: Proveedor bearer sin SUBSCRIPTION_QUOTA

- **GIVEN** `routing/providers/openrouter/config.json` sin bloque `SUBSCRIPTION_QUOTA`
- **WHEN** el proxy procesa un hop facturable con upstream OpenRouter
- **THEN** SHALL NOT invocar fetch de cuota de suscripción
- **AND** SHALL NOT escribir `subscription-quota.json`

### Requirement: Resolución de proveedor activo desde UPSTREAM_ORIGIN

El proxy SHALL resolver el nombre de proveedor cruzando `configs/.env → UPSTREAM_ORIGIN` con `routing/providers/*/config.json → ANTHROPIC_BASE_URL`, con la misma semántica que `resolveActiveProvider` en `scripting/router-status.ts`.

#### Scenario: UPSTREAM_ORIGIN coincide con un config.json

- **GIVEN** `UPSTREAM_ORIGIN` es `https://api.minimax.io/anthropic`
- **AND** existe `routing/providers/minimax/config.json` con ese `ANTHROPIC_BASE_URL`
- **WHEN** `ProviderRoutingResolverService` resuelve el proveedor
- **THEN** SHALL retornar `providerName: "minimax"` y la configuración mergeada con `secrets.json`

#### Scenario: UPSTREAM_ORIGIN sin match

- **GIVEN** `UPSTREAM_ORIGIN` no coincide con ningún `ANTHROPIC_BASE_URL` en `routing/providers/`
- **WHEN** se intenta refresh de cuota
- **THEN** SHALL omitir el fetch sin error fatal al hop

### Requirement: Persistencia de subscription-quota.json por sesión

Tras un hop facturable en workflow `main` o `subagent` con `usage` disponible, el proxy SHALL intentar actualizar `sessions/<sessionDir>/subscription-quota.json` cuando el proveedor activo tenga `SUBSCRIPTION_QUOTA.enabled`.

El archivo SHALL escribirse con `writeJsonAtomic` (mismo patrón que `session-metrics.json`).

Schema mínimo:

```json
{
  "fetched_at": "<ISO-8601>",
  "provider": "<providerName>",
  "adapter": "<adapter id>",
  "five_hour": { "used_percentage": <int>, "resets_at": <epoch seconds> },
  "seven_day": { "used_percentage": <int>, "resets_at": <epoch seconds> }
}
```

Las claves `five_hour` y `seven_day` son opcionales si la ventana no es calculable.

#### Scenario: Escritura tras hop facturable con TTL expirado

- **GIVEN** proveedor Minimax activo con `SUBSCRIPTION_QUOTA.enabled`
- **AND** no existe `subscription-quota.json` o `fetched_at` es anterior a `refresh_interval_seconds`
- **WHEN** `persistBillableStepMetricsIfNeeded` completa `updateFromStep`
- **THEN** SHALL invocar fetch al `endpoint` configurado
- **AND** SHALL escribir `subscription-quota.json` bajo el `sessionDir` del workflow

#### Scenario: TTL no expirado omite fetch

- **GIVEN** `subscription-quota.json` con `fetched_at` hace menos de `refresh_interval_seconds`
- **WHEN** ocurre un nuevo hop facturable
- **THEN** SHALL NOT realizar HTTP GET al endpoint de cuota
- **AND** SHALL dejar el archivo sin modificar

#### Scenario: Error de red no aborta el hop

- **GIVEN** el endpoint de cuota responde error o timeout
- **WHEN** se intenta refresh tras hop facturable
- **THEN** SHALL registrar warning en log
- **AND** SHALL NOT propagar excepción al flujo de auditoría del hop
- **AND** SHALL preservar `subscription-quota.json` previo si existía

### Requirement: Adapter minimax_token_plan_remains

El adapter `minimax_token_plan_remains` SHALL mapear la respuesta de `GET /v1/token_plan/remains` al shape normalizado de `subscription-quota.json`.

Reglas normativas:

1. Seleccionar la entrada de `model_remains[]` cuyo `model_name` coincide con `model_filter` (default `"general"`); si no hay coincidencia, usar el primer elemento.
2. Para la ventana 5h (`five_hour`):
   - Si `current_interval_total_count > 0`: `used_percentage = round((current_interval_usage_count / current_interval_total_count) * 100)`.
   - Else si `current_interval_remaining_percent` es finito en [0, 100]: `used_percentage = round(100 - current_interval_remaining_percent)`.
   - Else: omitir `used_percentage`.
   - Si `remains_time > 0` (ms): `resets_at = floor((now_ms + remains_time) / 1000)`.
   - Else si `end_time` es epoch ms válido: `resets_at = floor(end_time / 1000)`.
3. Para la ventana semanal (`seven_day`): misma lógica con `current_weekly_*`, `current_weekly_remaining_percent`, `weekly_remains_time`, `weekly_end_time` si existe.
4. Autenticación: header `Authorization: Bearer <valor de auth_credential en secrets.json>`.

#### Scenario: Counts en cero con remaining_percent válido (spike validado)

- **GIVEN** respuesta con `current_interval_total_count: 0`, `current_interval_usage_count: 0`, `current_interval_remaining_percent: 86`, `remains_time: 11852894`
- **WHEN** el adapter procesa la ventana 5h
- **THEN** `five_hour.used_percentage` SHALL ser `14`
- **AND** `five_hour.resets_at` SHALL ser aproximadamente `floor((now_ms + 11852894) / 1000)`

#### Scenario: Ventana semanal desde remaining_percent

- **GIVEN** `current_weekly_total_count: 0`, `current_weekly_remaining_percent: 20`, `weekly_remains_time` positivo
- **WHEN** el adapter procesa la ventana semanal
- **THEN** `seven_day.used_percentage` SHALL ser `80`
- **AND** `seven_day.resets_at` SHALL ser derivado de `weekly_remains_time`

#### Scenario: Respuesta sin model_remains utilizable

- **GIVEN** `model_remains` ausente o vacío
- **WHEN** el adapter procesa la respuesta
- **THEN** SHALL NOT escribir ventanas calculadas
- **AND** el servicio SHALL omitir la escritura del archivo o escribir solo metadatos sin ventanas válidas (el statusline no mostrará Tabla 3)

### Requirement: Autenticación desde secrets del proveedor

El fetch de cuota SHALL leer la credencial desde `routing/providers/<providerName>/secrets.json`, clave indicada por `auth_credential`. SHALL NOT loguear el valor de la credencial.

#### Scenario: Credencial presente en secrets.json

- **GIVEN** `secrets.json` contiene `ANTHROPIC_AUTH_TOKEN` no vacío
- **AND** `auth_credential` es `ANTHROPIC_AUTH_TOKEN`
- **WHEN** se ejecuta el fetch
- **THEN** la petición HTTP SHALL incluir `Authorization: Bearer <token>`

#### Scenario: Credencial ausente

- **GIVEN** `secrets.json` no contiene la clave `auth_credential` o está vacía
- **WHEN** se intenta refresh
- **THEN** SHALL omitir fetch
- **AND** SHALL registrar warning sin abortar el hop
