# statusline-runtime Specification (delta)

## ADDED Requirements

### Requirement: Resolución multi-fuente de cuota para Tabla 3

`router-status.ts` SHALL determinar si renderiza la Tabla 3 («Límites de uso por suscripción») mediante `resolveQuotaSource()`, **no** mediante `authMethod === 'oauth'` exclusivamente.

Orden de resolución:

1. Si `resolveAuthMethodFromEnv(settingsEnv) === 'oauth'` y `ctx.rate_limits` incluye al menos `five_hour` o `seven_day` con datos utilizables → usar stdin (Anthropic OAuth, comportamiento existente).
2. Else si el proveedor activo (`resolveActiveProvider`) tiene `SUBSCRIPTION_QUOTA.enabled === true` en su `config.json` y existe `sessions/<sessionDir>/subscription-quota.json` legible con al menos una ventana (`five_hour` o `seven_day`) → usar el archivo.
3. Else → no renderizar Tabla 3.

El shape normalizado para `renderRateLimitTable` SHALL ser:

```typescript
{
  five_hour?: { used_percentage?: number | null; resets_at?: number | null };
  seven_day?: { used_percentage?: number | null; resets_at?: number | null };
}
```

#### Scenario: Anthropic OAuth con stdin sigue funcionando

- **GIVEN** `settingsEnv` sin `ANTHROPIC_API_KEY` ni `ANTHROPIC_AUTH_TOKEN` (oauth)
- **AND** stdin incluye `rate_limits.five_hour.used_percentage: 60`
- **WHEN** `buildStatuslineOutput` ejecuta
- **THEN** el output SHALL contener «Límites de uso por suscripción»
- **AND** SHALL contener «Cuota actual (5h)»

#### Scenario: Minimax bearer con subscription-quota.json

- **GIVEN** proveedor activo `minimax` con `SUBSCRIPTION_QUOTA.enabled`
- **AND** `settingsEnv.ANTHROPIC_AUTH_TOKEN` presente (bearer)
- **AND** `sessions/<sessionId>/subscription-quota.json` contiene `five_hour.used_percentage: 14`
- **WHEN** `buildStatuslineOutput` ejecuta con ese `session_id`
- **THEN** el output SHALL contener «Límites de uso por suscripción»
- **AND** SHALL NOT depender de `ctx.rate_limits` en stdin

#### Scenario: Bearer sin SUBSCRIPTION_QUOTA no muestra Tabla 3

- **GIVEN** proveedor activo sin `SUBSCRIPTION_QUOTA` (p. ej. OpenRouter)
- **AND** `settingsEnv.ANTHROPIC_AUTH_TOKEN` presente
- **AND** stdin incluye `rate_limits` (ignorado)
- **WHEN** `buildStatuslineOutput` ejecuta
- **THEN** el output SHALL NOT contener «Límites de uso por suscripción»

#### Scenario: Minimax sin archivo de cuota aún

- **GIVEN** proveedor Minimax activo con `SUBSCRIPTION_QUOTA.enabled`
- **AND** no existe `subscription-quota.json` en el `sessionDir`
- **WHEN** `buildStatuslineOutput` ejecuta
- **THEN** el output SHALL NOT contener Tabla 3
- **AND** Tabla 1 SHALL renderizarse sola (layout sin side-by-side de cuota)

### Requirement: Tabla 3 — título y layout invariantes

La Tabla 3 SHALL mantener el título exacto `Límites de uso por suscripción` para todas las fuentes (stdin OAuth y archivo de proveedor). SHALL renderizarse side-by-side con Tabla 1 cuando hay datos de cuota, con el mismo `renderSideBySide` y reglas de ancho de referencia existentes.

#### Scenario: Título idéntico para Minimax

- **GIVEN** cuota resuelta desde `subscription-quota.json`
- **WHEN** se renderiza Tabla 3
- **THEN** la primera línea SHALL contener `╭─ Límites de uso por suscripción`

#### Scenario: Layout side-by-side con archivo de cuota

- **GIVEN** cuota válida desde archivo
- **WHEN** `buildStatuslineOutput` renderiza la fila superior
- **THEN** Tabla 1 y Tabla 3 SHALL aparecer en la misma fila con gap de 2 espacios

### Requirement: Tabla 3 — fallback con guión para datos no calculables

En las celdas de barra + porcentaje y de tiempo de reinicio de la Tabla 3, `router-status.ts` SHALL mostrar el literal `"-"` (con estilos ANSI aplicables) cuando:

- `used_percentage` es `null`, `undefined`, o no es un número finito en [0, 100].
- `resets_at` es `null`, `undefined`, o no es un número finito positivo.

SHALL NOT usar `N/A` en Tabla 3. SHALL NOT sustituir ausencia de dato por `used_percentage ?? 0` ni renderizar barra al 0% por defecto.

Cuando `resets_at` es válido y ya expiró (`resets_at * 1000 <= Date.now()`), SHALL mostrar `Ahora` (comportamiento existente de `formatTimeRemaining` para reinicio inminente).

#### Scenario: Porcentaje no calculable muestra guión

- **GIVEN** `five_hour` presente sin `used_percentage` calculable
- **WHEN** se renderiza la fila «Cuota actual (5h)»
- **THEN** la celda de barra + % SHALL ser `"-"` sin barra de progreso

#### Scenario: Tiempo de reinicio no calculable muestra guión

- **GIVEN** `seven_day.used_percentage` válido pero `seven_day.resets_at` ausente
- **WHEN** se renderiza la fila «Cuota semanal (7d)»
- **THEN** la celda de tiempo SHALL ser `"-"`

#### Scenario: Porcentaje cero válido no es guión

- **GIVEN** `five_hour.used_percentage: 0` explícito y finito (cuota intacta)
- **WHEN** se renderiza la fila 5h
- **THEN** la celda SHALL mostrar barra al 0% y el texto `0%`
- **AND** SHALL NOT mostrar `"-"`

### Requirement: Lectura de SUBSCRIPTION_QUOTA en statusline

`router-status.ts` SHALL leer `SUBSCRIPTION_QUOTA` del `config.json` del proveedor activo bajo `<projectRoot>/routing/providers/<name>/config.json`. SHALL NOT realizar peticiones HTTP para obtener cuota.

#### Scenario: projectRoot desde SMART_CODE_PROXY_ROOT

- **GIVEN** `settings.env.SMART_CODE_PROXY_ROOT` apunta al repo del proxy
- **AND** `configs/.env` bajo esa raíz define `UPSTREAM_ORIGIN` de Minimax
- **WHEN** `resolveQuotaSource` evalúa configuración
- **THEN** SHALL cargar `SUBSCRIPTION_QUOTA` desde `routing/providers/minimax/config.json` bajo esa raíz

## MODIFIED Requirements

### Requirement: Visibilidad condicional de la Tabla 2

`buildStatuslineOutput` SHALL renderizar la Tabla 2 ("Steps y consumo de tokens por
nivel") únicamente cuando `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS`
tenga el valor exacto `on` (case-insensitive, trim). En cualquier otro caso (valor
ausente, `off`, o cualquier otro string) la Tabla 2 SHALL omitirse por completo del
output: no se calcula `targetWidth`, no se llama a `renderTokenTable`, no se escribe
el cache de métricas y el string de salida NO incluye ninguna línea de dicha tabla.

#### Scenario: Variable en on — Tabla 2 visible

- **WHEN** `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **THEN** `buildStatuslineOutput` SHALL incluir la Tabla 2 en el output devuelto
- **AND** el bloque superior (Tabla 1 y, si aplica, Tabla 3) SHALL renderizarse con normalidad

#### Scenario: Variable ausente — Tabla 2 oculta

- **WHEN** `settingsEnv` no contiene la clave `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS`
- **THEN** el output SHALL NOT contener la Tabla 2
- **AND** el bloque superior SHALL estar presente e intacto

#### Scenario: Variable en off — Tabla 2 oculta

- **WHEN** `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` es `"off"`
- **THEN** el output SHALL NOT contener la Tabla 2
- **AND** el bloque superior SHALL estar presente e intacto

#### Scenario: Variable con valor desconocido — Tabla 2 oculta

- **WHEN** `settingsEnv.SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` tiene un valor distinto de `"on"` (p. ej. `"1"`, `"true"`, `"yes"`)
- **THEN** el output SHALL NOT contener la Tabla 2

#### Scenario: Tabla 2 oculta — bloque superior sin alteraciones

- **GIVEN** `SMART_CODE_PROXY__STATUSLINE_ROUTER_DETAILS` no es `"on"`
- **WHEN** hay cuota de suscripción disponible (stdin OAuth **o** `subscription-quota.json` con ventana válida)
- **THEN** el output SHALL contener Tabla 1 y Tabla 3 renderizadas side-by-side, igual que si Tabla 2 estuviera visible
