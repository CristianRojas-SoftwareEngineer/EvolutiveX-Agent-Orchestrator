# router-status.ts — Propuesta de rediseño del statusline

## 1. Contexto y motivación

El statusline legacy (`~/.claude/router-status.ps1`) fue diseñado para dos modos excluyentes:

- `ANTHROPIC_BASE_URL` presente → Claude Code Router activo → `router-mode-status.ps1`
- `ANTHROPIC_BASE_URL` ausente → API Anthropic oficial → `official-mode-status.ps1`

Con Smart Code Proxy como intermediario universal, **`ANTHROPIC_BASE_URL` siempre apunta a `http://127.0.0.1:<PORT>`**, independientemente del proveedor upstream. El dispatch original siempre activa `router-mode-status.ps1`, que lee artefactos de Claude Code Router que ya no existen (`~/.claude-code-router/config.json`, `router-requests.jsonl`, etc.). El statusline muestra datos vacíos o incorrectos en todos los modos.

El rediseño reemplaza los tres `.ps1` con un único `scripting/router-status.ts`:
- Sin dependencia de PowerShell ni de archivos rc de shell
- Dispatch basado en `UPSTREAM_ORIGIN` + método de autenticación activo
- Lectura de sesión activa desde `sessions/` del proxy para métricas por nivel de razonamiento

---

## 2. Fuentes de datos

| Dato | Fuente | Campo |
|---|---|---|
| Session ID | stdin (`$ctx`) | `ctx.session_id` |
| Modelo activo (nombre de display) | stdin (`$ctx`) | `ctx.model.display_name` |
| Ventana de contexto (tamaño) | stdin (`$ctx`) | `ctx.context_window.context_window_size` |
| Porcentaje de uso de contexto | stdin (`$ctx`) | `ctx.context_window.used_percentage` |
| Rate limits (solo OAuth) | stdin (`$ctx`) | `ctx.rate_limits.five_hour`, `ctx.rate_limits.seven_day` |
| Provider upstream activo | `configs/.env` | `UPSTREAM_ORIGIN` |
| Nombre del proveedor | cruce `UPSTREAM_ORIGIN` vs `routing/providers/*/config.json` | `config.ANTHROPIC_BASE_URL` |
| Método de auth | `process.env` (heredado de Claude Code) | `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` |
| Modelos por nivel | `process.env` (heredado de Claude Code) | `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| Display name de modelo por nivel | `routing/providers/<p>/models/<m>/metadata.json` | `displayName` (campo a añadir) |
| Interacciones de la sesión actual | `sessions/<session>/interactions/*/meta.json` | `interactionType`, `totals` |
| Modelo por interacción | `sessions/<session>/interactions/*/request/body.json` | `model` |

### Variables de entorno en `process.env`

Dado que el statusline es un proceso hijo de Claude Code, hereda el entorno completo de Claude Code. Las variables configuradas vía `settings.json → env` (por `configure-provider.ts`) están disponibles en `process.env` sin necesidad de leer el registro de Windows ni archivos rc de shell.

---

## 3. Layout general

El statusline consta de **dos o tres tablas apiladas verticalmente** según el método de autenticación. La Tabla 1 y la Tabla 2 son comunes a todos los proveedores. La Tabla 3 aparece únicamente para `authMethod === 'oauth'`.

### 3.1 Tabla 1 — Información de sesión y proveedor (común)

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│                        Sesión actual «9b4510c9-90ca-4439-9dc2-a5d62bf0b308»                                         │
├────────────────────┬──────────────┬─────────────────────┬────────────────────┬──────────────────────┬──────┬─────────────────────┬─────────────────┤
│ Proveedor          │ <Nombre>     │ Modelo activo        │ <display_name>     │ Ventana de contexto  │ <N>K │ Porcentaje de uso   │ ████░░░░░ XX%   │
╰────────────────────┴──────────────┴─────────────────────┴────────────────────┴──────────────────────┴──────┴─────────────────────┴─────────────────╯
```

**Columnas (8 celdas en pares label–valor):**

| Celda | Contenido | Fuente |
|---|---|---|
| Proveedor (label) | texto fijo `"Proveedor"` | — |
| Proveedor (valor) | nombre del proveedor resuelto | cruce `UPSTREAM_ORIGIN` vs `config.json` |
| Modelo activo (label) | texto fijo `"Modelo activo"` | — |
| Modelo activo (valor) | `ctx.model.display_name` | stdin |
| Ventana de contexto (label) | texto fijo `"Ventana de contexto"` | — |
| Ventana de contexto (valor) | `ctx.context_window.context_window_size` formateado como `NNNk` / `NNNm` | stdin |
| Porcentaje de uso (label) | texto fijo `"Porcentaje de uso"` | — |
| Porcentaje de uso (valor) | barra de progreso coloreada + `XX%` | stdin |

**Barra de progreso:** 10 bloques, usando `█` (lleno) y `░` (vacío). Color: verde ≤39 %, ámbar 40–69 %, rojo ≥70 %.

---

### 3.2 Tabla 2 — Interacciones y consumo de tokens (común a todos los proveedores)

Presente siempre, independientemente del método de autenticación. Permite al usuario conocer cuántos tokens consume por nivel de razonamiento en la sesión actual, tanto para providers con facturación por token (bearer) como para suscripciones (OAuth).

```
╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│           Interacciones por niveles de razonamiento             │                            Consumo de Tokens                                    │
├────────────────┬──────────────────────┬──────────────────────┬─────────────────────┬────────────────────────────┬─────────────────────┤
│ Nivel          │ Modelo               │ N.º Interacciones    │ Tokens de Input     │ Tokens de Input Cacheado   │ Tokens de Output    │
├────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼────────────────────────────┼─────────────────────┤
│ Lite           │ <modelo haiku>       │ <n>                  │ <n>                 │ <n>                        │ <n>                 │
├────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼────────────────────────────┼─────────────────────┤
│ Standard       │ <modelo sonnet>      │ <n>                  │ <n>                 │ <n>                        │ <n>                 │
├────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼────────────────────────────┼─────────────────────┤
│ Reasoning      │ <modelo opus>        │ <n>                  │ <n>                 │ <n>                        │ <n>                 │
├────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼────────────────────────────┼─────────────────────┤
│ Sesión actual  │ Total                │ <n>                  │ <n>                 │ <n>                        │ <n>                 │
╰────────────────┴──────────────────────┴──────────────────────┴─────────────────────┴────────────────────────────┴─────────────────────╯
```

**Columnas (6):**

| Columna | Contenido | Fuente |
|---|---|---|
| Nivel | `Lite` / `Standard` / `Reasoning` | texto fijo por slot |
| Modelo | display name del modelo del nivel | `metadata.json → displayName` (o `modelId` como fallback) |
| N.º Interacciones | cantidad de turnos agénticos del nivel en la sesión | conteo de `meta.json` por modelo |
| Tokens de Input | suma de `totals.inputTokens` para el nivel | `meta.json → totals.inputTokens` |
| Tokens de Input Cacheado | suma de `totals.cacheReadInputTokens` para el nivel | `meta.json → totals.cacheReadInputTokens` |
| Tokens de Output | suma de `totals.outputTokens` para el nivel | `meta.json → totals.outputTokens` |

**Fila de totales:** suma de las tres filas de nivel para las columnas numéricas. La celda de modelo muestra `"Total"`.

**Formato de números:** entero con separador de miles (p. ej. `1,234,567`). Si el valor es `0` o `null`, muestra `0`.

**Header de sección:** la fila superior contiene dos celdas mergeadas: `"Interacciones por niveles de razonamiento"` (columnas 1–3) y `"Consumo de Tokens"` (columnas 4–6).

---

### 3.3 Tabla 3 — Límites de cuota de suscripción (solo OAuth)

Se renderiza **únicamente** cuando `authMethod === 'oauth'`. Aplica al proveedor `anthropic` con suscripción PRO/Max.

```
╭──────────────────────────────────────────────────────────────────────────────────────────────╮
│                          Límites de uso por suscripción «Claude PRO»                         │
├────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ Cuota actual (5h)          │ ████████████░░░░░░░░ 59%        │ ↻ Reinicio en 1h 43m           │
├────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ Cuota semanal (7d)         │ █████░░░░░░░░░░░░░░░ 28%        │ ↻ Reinicio en 4d 7h            │
╰────────────────────────────┴────────────────────────────────┴────────────────────────────────╯
```

**Columnas (3):**

| Columna | Contenido | Fuente |
|---|---|---|
| Label | `"Cuota actual (5h)"` / `"Cuota semanal (7d)"` | texto fijo |
| Barra de uso | barra coloreada + porcentaje | `ctx.rate_limits.five_hour.used_percentage` / `ctx.rate_limits.seven_day.used_percentage` |
| Reinicio | `"↻ Reinicio en Xh Ym"` / `"Xd Yh"` o `"Sin ventana activa"` | `ctx.rate_limits.*.resets_at` (epoch segundos) |

---

## 4. Dispatch por tipo de proveedor

```
resolveActiveProvider()
  ├── leer UPSTREAM_ORIGIN de configs/.env
  ├── cruzar con routing/providers/*/config.json → nombre del proveedor
  ├── leer process.env.ANTHROPIC_AUTH_TOKEN y process.env.ANTHROPIC_API_KEY
  └── determinar authMethod:
        ANTHROPIC_API_KEY presente   → 'api_key'
        ANTHROPIC_AUTH_TOKEN presente → 'bearer'
        ninguno                       → 'oauth'

renderTablas()
  ├── Tabla 1: Información de sesión y proveedor     (siempre)
  ├── Tabla 2: Interacciones y consumo de tokens     (siempre)
  └── Tabla 3: Límites de cuota de suscripción       (solo authMethod === 'oauth')
```

---

## 5. Mapeo de niveles de razonamiento

Los niveles se derivan de las variables de entorno que Claude Code establece al enrutar:

| Nivel | Variable de entorno | Slot en la API |
|---|---|---|
| Lite | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku (menor costo, mayor velocidad) |
| Standard | `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet (uso general) |
| Reasoning | `ANTHROPIC_DEFAULT_OPUS_MODEL` | opus (razonamiento complejo) |

Para clasificar una interacción en un nivel, el script lee el campo `model` de `request/body.json` de la interacción y lo compara contra los tres valores de `process.env`:

```
model en request/body.json === ANTHROPIC_DEFAULT_HAIKU_MODEL  → Lite
model en request/body.json === ANTHROPIC_DEFAULT_SONNET_MODEL → Standard
model en request/body.json === ANTHROPIC_DEFAULT_OPUS_MODEL   → Reasoning
sin match                                                      → ignorar
```

Solo se cuentan interacciones con `interactionType === 'agentic-turn'` y `totals !== null`.

---

## 6. Resolución de sesión activa

La sesión en `sessions/` se resuelve utilizando el `session_id` proporcionado por Claude Code en `$ctx`:

1. Buscar un directorio en `sessions/` cuyo nombre comience con el `session_id` (el proxy puede añadir un sufijo hash).
2. Si no hay coincidencia por prefijo: usar el directorio con fecha de modificación más reciente.
3. Si no hay sesiones: usar `_unknown`.

```
sessionDir = sessions/ → buscar por prefijo de ctx.session_id
interactions = sessions/<sessionDir>/interactions/*/meta.json
```

> **Nota:** `DEFAULT_AUDIT_SESSION` ha sido eliminado del proyecto. La resolución de sesión ahora depende exclusivamente de las cabeceras HTTP (para el proxy) y del `session_id` de `$ctx` (para el statusline).

---

## 7. Resolución del nombre de display de modelo

La columna `Modelo` de la Tabla 2 muestra el nombre de display de cada nivel. Orden de resolución:

1. `routing/providers/<provider>/models/<modelId>/metadata.json → displayName` (campo nuevo, a añadir en sprint futuro)
2. Si `displayName` no existe: usar `modelId` directamente como fallback

> **Mejora futura:** añadir campo `displayName` a `metadata.json` de cada modelo.

---

## 8. Diseño multiplataforma

El script no contiene lógica específica de plataforma:

| Operación | Mecanismo | Plataforma |
|---|---|---|
| Leer stdin | `process.stdin` | todas |
| Leer `configs/.env` | `fs.readFileSync` + regex | todas |
| Leer env vars de auth | `process.env.*` (heredado de Claude Code) | todas |
| Escanear providers | `fs.readdirSync` | todas |
| Leer `meta.json` / `request/body.json` | `fs.readFileSync` + `JSON.parse` | todas |
| Colores y box-drawing | `chalk` | todas |
| Resolver rutas | `path.join`, `import.meta.dirname` | todas |

No se usa `execSync`, `powershell.exe`, ni archivos rc de shell.

---

## 9. Integración

### settings.json

```json
"statusLine": {
  "type": "command",
  "command": "npx tsx 'C:/Users/Cristian/Desktop/Proyectos/Smart Code Proxy/scripting/router-status.ts'",
  "padding": 0
}
```

### configure-provider.ts

`configure-provider.ts` escribe las variables de configuración en `~/.claude/settings.json → env` (un único `ClaudeSettingsEnvManager` cross-platform). El statusline las lee vía `process.env`, sin acceso al registro de Windows ni a archivos rc.

---

## 10. Limitaciones conocidas y mejoras futuras

| Limitación | Causa | Mejora propuesta |
|---|---|---|
| `model` no está en `meta.json` | El proxy no persiste el modelo en TurnMetadata | Añadir campo `model` a `TurnMetadata` (schema change) |
| `displayName` no está en `metadata.json` | Campo no definido en la especificación actual | ✅ Resuelto: añadir `displayName` a `metadata.json` de cada modelo |
| Resolución de sesión es estática | El proxy no expone mapeo `session_id → carpeta` | ✅ Resuelto: resolución dinámica por `session_id` de `$ctx` |
| `cacheReadInputTokens` puede ser `null` | Algunos proveedores no implementan prompt caching | Tratar `null` como `0` en la suma |
