## Context

### Estado actual

| Componente | Comportamiento |
|------------|----------------|
| `scripting/router-status.ts` | Tabla 3 solo si `authMethod === 'oauth'` y `ctx.rate_limits` tiene `five_hour` o `seven_day` |
| Claude Code stdin | Inyecta `rate_limits` únicamente en suscripción Anthropic OAuth |
| `routing/providers/minimax/` | `AUTH_METHOD: bearer`; sin bloque de cuota |
| Proxy `src/` | Persiste `session-metrics.json` tras hops facturables; **no** lee `routing/providers/` |
| Minimax API | `GET https://api.minimax.io/v1/token_plan/remains` responde 200 con `model_remains[]`; counts en 0 pero `*_remaining_percent` y `remains_time` utilizables (spike 2026-06-11) |

### Arquitectura objetivo (B + C)

```
persistBillableStepMetricsIfNeeded (post-hop)
  └── SubscriptionQuotaService.refreshIfNeeded(sessionDir)
        ├── ProviderRoutingResolver → providerName + config.SUBSCRIPTION_QUOTA
        ├── TTL check (subscription-quota.json fetched_at)
        ├── HTTP GET remains (adapter minimax)
        └── writeJsonAtomic → sessions/<dir>/subscription-quota.json

router-status.ts (cada invocación Claude Code)
  └── resolveQuotaSource()
        ├── anthropic + oauth + ctx.rate_limits → normalizar stdin
        ├── provider SUBSCRIPTION_QUOTA.enabled + archivo válido → leer disco
        └── null → sin Tabla 3
  └── renderRateLimitTable({ rate_limits: quota })  // UI sin cambios estructurales
```

## Goals / Non-Goals

**Goals:**

- Mostrar Tabla 3 homóloga para Minimax Token Plan con el mismo título y layout side-by-side que Anthropic OAuth.
- Centralizar fetch y TTL en el proxy; el statusline solo hace `readFileSync` (sin red).
- Declarar capacidad de cuota por proveedor en `config.json` (`SUBSCRIPTION_QUOTA`).
- Mapear Minimax con `remaining_percent` cuando `total_count === 0`.
- Degradar celdas no calculables a `"-"` (no `N/A`, no barra al 0% por defecto).

**Non-Goals:**

- HTTP en `router-status.ts`.
- Cuota en `SessionStart` antes del primer hop.
- Unificar `resolveActiveProvider` entre `scripting/` y `src/` en un paquete compartido (aceptar duplicación mínima documentada si PKA lo impide).
- Soporte del endpoint legacy `/coding_plan/remains`.
- Invalidar caché de Tabla 2 (live refresh) por cambios en `subscription-quota.json`.

## Decisions

### D1 — Nombre y ubicación del artefacto de sesión

**Elección:** `sessions/<sessionDir>/subscription-quota.json` en la raíz de la sesión (mismo nivel que `session-metrics.json`).

**Schema canónico:**

```json
{
  "fetched_at": "2026-06-11T20:00:00.000Z",
  "provider": "minimax",
  "adapter": "minimax_token_plan_remains",
  "five_hour": {
    "used_percentage": 14,
    "resets_at": 1781222400
  },
  "seven_day": {
    "used_percentage": 80,
    "resets_at": 1781481600
  }
}
```

- `used_percentage`: entero 0–100 (porcentaje **consumido**, coherente con Anthropic stdin).
- `resets_at`: epoch en **segundos** (coherente con `ctx.rate_limits`).
- Campos de ventana ausentes o no calculables: omitir la clave o persistir `null` en el mapper; el statusline interpreta como fila con `"-"`.

**Alternativa descartada:** ampliar `session-metrics.json` — mezcla métricas de hops con cuota de billing; viola separación de responsabilidades.

### D2 — Bloque `SUBSCRIPTION_QUOTA` en `config.json`

**Elección:** objeto anidado en `routing/providers/<name>/config.json`:

```json
"SUBSCRIPTION_QUOTA": {
  "enabled": true,
  "adapter": "minimax_token_plan_remains",
  "endpoint": "https://api.minimax.io/v1/token_plan/remains",
  "auth_credential": "ANTHROPIC_AUTH_TOKEN",
  "model_filter": "general",
  "refresh_interval_seconds": 60
}
```

| Campo | Obligatorio | Semántica |
|-------|-------------|-----------|
| `enabled` | sí | Activa fetch en proxy y lectura en statusline |
| `adapter` | sí | Identificador del mapper registrado |
| `endpoint` | sí | URL GET |
| `auth_credential` | sí | Clave en `secrets.json` mergeado (`ANTHROPIC_AUTH_TOKEN` para Minimax) |
| `model_filter` | no (default `"general"`) | `model_name` en `model_remains[]` |
| `refresh_interval_seconds` | no (default `60`) | TTL mínimo entre fetches por sesión |

**Parser:** extender `scripting/shared/provider-config.ts` para preservar `SUBSCRIPTION_QUOTA` como objeto (no flatten a string). El resolver del proxy SHALL leer `config.json` + `secrets.json` con la misma semántica de rutas.

### D3 — TTL y trigger de refresh (proxy)

**Elección:**

- **Trigger:** al final de `persistBillableStepMetricsIfNeeded`, tras `updateFromStep` exitoso.
- **TTL:** `refresh_interval_seconds` (default **60**). Si `subscription-quota.json` existe y `Date.now() - fetched_at < TTL`, **SHALL** omitir el fetch.
- **Errores de red:** log `warn`, no propagar excepción al hop; no borrar archivo previo.
- **Credencial:** leer desde `routing/providers/<provider>/secrets.json` en disco (mismo patrón que `configure-provider`); el proxy corre con CWD = raíz del repo.

**Alternativa descartada:** fetch global por API key fuera de sesión — pierde correlación sesión/uso y complica multi-sesión.

### D4 — Adapter Minimax (`minimax_token_plan_remains`)

**Algoritmo normativo** (función pura en capa 1 o 2):

1. Seleccionar entrada `model_remains` donde `model_name === model_filter` (default `"general"`); si no hay match, usar `model_remains[0]`.
2. Para cada ventana (`interval` → `five_hour`, `weekly` → `seven_day`):
   - Si `total_count > 0` y `usage_count >= 0`: `used_percentage = round((usage_count / total_count) * 100)`.
   - Else si `remaining_percent` es número finito en [0, 100]: `used_percentage = round(100 - remaining_percent)`.
   - Else: `used_percentage = null` (no calculable).
   - Si `remains_time_ms > 0`: `resets_at = floor((now_ms + remains_time_ms) / 1000)`.
   - Else si `end_time` es epoch ms válido: `resets_at = floor(end_time / 1000)`.
   - Else: `resets_at = null`.
3. Retornar objeto con solo ventanas que tengan al menos un campo no null.

**Validado contra spike:** counts `0/0`, `remaining_percent` 86/20, `remains_time` coherente con `end_time`.

### D5 — Dispatch en statusline (capa C)

**Elección:** reemplazar:

```typescript
const table3 = authMethod === 'oauth' ? renderRateLimitTable(ctx) : null;
```

por:

```typescript
const quota = resolveQuotaSource(ctx, paths, settingsEnv, sessionPath);
const table3 = quota ? renderRateLimitTable({ ...ctx, rate_limits: quota }) : null;
```

**Orden de resolución en `resolveQuotaSource`:**

1. Si `resolveAuthMethodFromEnv(settingsEnv) === 'oauth'` y `ctx.rate_limits` tiene `five_hour` o `seven_day` → usar stdin (comportamiento actual Anthropic).
2. Else si proveedor activo (`resolveActiveProvider`) tiene `SUBSCRIPTION_QUOTA.enabled === true` y existe `subscription-quota.json` legible con al menos una ventana válida → usar archivo.
3. Else → `null`.

**SHALL NOT** mostrar Tabla 3 para `bearer` genérico sin config ni archivo.

### D6 — Fallback `"-"` en render

**Elección:** modificar `buildRateLimitTableData` y `formatTimeRemaining` (solo usados por Tabla 3):

| Celda | Mostrar `"-"` cuando |
|-------|----------------------|
| Barra + % | `used_percentage` es `null`, `undefined`, o no finito |
| Tiempo reinicio | `resets_at` es `null`, `undefined`, no finito, o ≤ `now` (usar `"Ahora"` solo si `resets_at` válido y expirado; si inválido → `"-"`) |

**SHALL** renderizar la fila de ventana si la ventana existe en la fuente aunque una celda sea `"-"` (p. ej. weekly sin porcentaje pero con tiempo).

**SHALL NOT** usar `used_percentage ?? 0` en Tabla 3.

**Título:** mantener `╭─ Límites de uso por suscripción ` sin variante por proveedor.

### D7 — Resolución de proveedor en el proxy

**Elección:** crear `ProviderRoutingResolverService` en `src/2-services/` que:

1. Lea `configs/.env` → `UPSTREAM_ORIGIN` (misma fuente que statusline vía `readDotEnv`).
2. Escanee `routing/providers/*/config.json` y empareje `ANTHROPIC_BASE_URL === UPSTREAM_ORIGIN`.
3. Retorne `{ providerName, config, secrets }` o `null`.

**Ruta base:** `path.join(process.cwd(), 'routing', 'providers')` — misma suposición que el proxy y `configure-provider`.

**Alternativa descartada:** añadir `ACTIVE_PROVIDER=minimax` a `configs/.env` — duplica verdad; `UPSTREAM_ORIGIN` ya es la fuente canónica.

### D8 — Cableado en composition root

**Elección:** instanciar `SubscriptionQuotaService` con dependencias:

- `ProviderRoutingResolverService`
- `providersBasePath` (default `routing/providers` bajo CWD)
- `fetch` inyectable (tests)

Pasar `subscriptionQuota` a handlers vía ampliación de `persistBillableStepMetricsIfNeeded` o parámetro opcional en handlers SSE/standard.

**SHALL** mantener `persistBillableStepMetricsIfNeeded` como punto único de enganche para no duplicar en dos handlers.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Semántica invertida de `usage_count` en futuras versiones Minimax | Priorizar `remaining_percent` cuando `total_count === 0`; tests con fixture del spike |
| Proxy CWD ≠ raíz del repo | Documentar en `docs/`; mismo riesgo preexistente para `sessions/` |
| Tabla 3 ausente hasta primer hop | Aceptado; documentar en router-statusline |
| Duplicación `resolveActiveProvider` scripting vs src | Comentario cruzado en ambos archivos; unificar en change futuro si molesta |
| Credencial en `secrets.json` usada por proxy para billing | Mismo archivo que ya alimenta upstream; no versionar secrets |
| Fetch cada hop sin TTL | TTL 60s obligatorio en implementación |
| Test bearer «nunca Tabla 3» queda obsoleto | Reescribir: distinguir bearer sin config vs minimax con archivo |

## Migration Plan

1. Desplegar proxy + statusline en el mismo release (orden indistinto; sin proxy nuevo el archivo no existe y Tabla 3 sigue oculta para Minimax).
2. Ejecutar `npm run configure:provider minimax` si no está activo (sin cambio de comando).
3. Reiniciar proxy tras actualizar código para cargar nuevo servicio.
4. **Rollback:** revert del commit; borrar `subscription-quota.json` opcional (no rompe nada); Anthropic OAuth sin cambios.

## Open Questions

- Ninguna bloqueante tras spike Minimax. Si en producción `remaining_percent` deja de actualizarse (bug Minimax #48), la UI mostrará `"-"` en barra — comportamiento aceptable.
