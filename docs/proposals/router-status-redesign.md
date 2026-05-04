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
| Contexto (tks) (tamaño) | stdin (`$ctx`) | `ctx.context_window.context_window_size` |
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

El statusline consta de **dos o tres tablas** según el método de autenticación. La Tabla 1 y la Tabla 2 se renderizan **side-by-side** (lado a lado). La Tabla 3 aparece debajo, únicamente para `authMethod === 'oauth'`.

### 3.1 Tabla 1 — Información de sesión y proveedor (común)

```
╭─ Sesión actual «9b4510c9-90ca-4439-9dc2-a5d62bf0b308» ─────────────────────────────────────────────────────╮
│        Proveedor         │     Modelo activo     │ Contexto (tks) │    Porcentaje de uso     │
├──────────────────────────┼───────────────────────┼─────────────────────┼──────────────────────────┤
│        Anthropic         │   claude-opus-4-7     │        200K         │  ████████░░░░ 45%        │
╰──────────────────────────┴───────────────────────┴─────────────────────┴──────────────────────────╯
```

**Columnas (4 columnas planas):**

| Columna | Contenido | Fuente | Alineación |
|---|---|---|---|
| Proveedor | nombre del proveedor resuelto (capitalizado) | cruce `UPSTREAM_ORIGIN` vs `config.json` | centrada |
| Modelo activo | display name del modelo activo (`metadata.json → displayName`) | stdin (`ctx.model.display_name`) + resolución en `metadata.json` | centrada |
| Contexto (tks) | tamaño de ventana formateado como `NNNk` / `NNNm` | stdin (`ctx.context_window.context_window_size`) | centrada |
| Porcentaje de uso | barra de progreso + porcentaje | stdin (`ctx.context_window.used_percentage`) | centrada |

**Barra de progreso:** 8 bloques, usando `█` (lleno) y `░` (vacío). Color dinámico por rango de porcentaje: verde (`#2ecc71`) 0–39%, naranja (`#f39c12`) 40–69%, rojo (`#e74c3c`) 70–100%. Vacío: gris (`\x1B[90m`).

---

### 3.2 Tabla 2 — Interacciones y consumo de tokens (común a todos los proveedores)

Presente siempre, independientemente del método de autenticación. Permite al usuario conocer cuántos tokens consume por nivel de razonamiento en la sesión actual, tanto para providers con facturación por token (bearer) como para suscripciones (OAuth).

```
╭─ Interacciones por nivel de razonamiento ──────────────────────────────────────────────────────────────────────╮
│ Nivel      │ Modelo          │ # Interacciones │  Input (tks) │ Cache In (tks) │ Output (tks) │
├────────────┼─────────────────┼─────────────────┼──────────────┼────────────────┼──────────────┤
│ Lite       │ MiMo 2 Omni     │              12 │       45,230 │         12,000 │        8,500 │
│ Standard   │ MiMo 2.5        │              35 │      189,400 │         67,000 │       42,100 │
│ Reasoning  │ MiMo 2.5 Pro    │               8 │      312,000 │         95,000 │       78,000 │
├────────────┴─────────────────┼─────────────────┼──────────────┼────────────────┼──────────────┤
│ Totales de sesión            │              55 │      546,630 │        174,000 │      128,600 │
╰──────────────────────────────┴─────────────────┴──────────────┴────────────────┴──────────────╯
```

**Columnas (6):**

| Columna | Contenido | Fuente | Alineación |
|---|---|---|---|
| Nivel | `Lite` / `Standard` / `Reasoning` | texto fijo por slot | izquierda |
| Modelo | display name del modelo del nivel | `metadata.json → displayName` (o `modelId` como fallback) | izquierda |
| # Interacciones | cantidad de turnos del nivel en la sesión | conteo de `meta.json` por modelo | derecha |
| Input (tks) | suma de `totals.inputTokens` para el nivel | `meta.json → totals.inputTokens` | derecha |
| Cache In (tks) | suma de `totals.cacheReadInputTokens` para el nivel | `meta.json → totals.cacheReadInputTokens` | derecha |
| Output (tks) | suma de `totals.outputTokens` para el nivel | `meta.json → totals.outputTokens` | derecha |

**Fila de totales:** celdas fusionadas en columnas 0+1 (texto `"Totales de sesión"`), suma de las tres filas de nivel para las columnas numéricas. Los separadores horizontales usan `┴` en la posición de la columna fusionada.

**Formato de números:** entero con separador de miles (p. ej. `1,234,567`). Si el valor es `0`, muestra `-`.

**Headers simples:** cada columna tiene su propio header (sin celdas fusionadas en la fila de headers).

---

### 3.3 Tabla 3 — Rate Limits (solo OAuth)

Se renderiza **únicamente** cuando `authMethod === 'oauth'`. Aplica al proveedor `anthropic` con suscripción PRO/Max.

```
╭─ Límites de uso por suscripción ─────────────────────────────────────────────────────╮
│ Cuota actual (5h)  │ ████████████░░░░░░░░ 60% │ Reinicio en │          1h 43m       │
│ Cuota semanal (7d) │ █████░░░░░░░░░░░░░░░ 15% │ Reinicio en │          4d 7h        │
╰────────────────────┴─────────────────────────┴─────────────┴────────────────────────╯
```

**Columnas (4):**

| Columna | Contenido | Fuente | Alineación |
|---|---|---|---|
| Cuota | `"Cuota actual (5h)"` / `"Cuota semanal (7d)"` | texto fijo | izquierda |
| Barra + % | barra de progreso + porcentaje (`XX%`) | `ctx.rate_limits.five_hour.used_percentage` / `seven_day.used_percentage` | izquierda |
| Etiqueta reinicio | texto fijo `"Reinicio en"` | — | izquierda |
| Tiempo restante | `"Xh Ym"` / `"Xd Yh"` | `ctx.rate_limits.five_hour.resets_at` / `seven_day.resets_at` (epoch segundos) | derecha |

**Barra de progreso:** colores dinámicos según porcentaje (verde/naranja/rojo), misma lógica que la Tabla 1.

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
  ├── Tabla 1 + Tabla 2: Side-by-side (siempre)
  └── Tabla 3: Rate Limits (solo authMethod === 'oauth', debajo)
```

---

## 4.1 Colores ANSI

El script usa códigos ANSI raw sin dependencias externas:

| Elemento | Color | Código ANSI |
|---|---|---|
| Cabeceras y títulos | Azul `#253ecc` | `\x1B[38;2;37;62;204m` |
| Valores de celdas | Blanco | `\x1B[37m` |
| Nivel Lite | Gris | `\x1B[90m` |
| Nivel Standard | Blanco | `\x1B[37m` |
| Nivel Reasoning | Blanco bold | `\x1B[1;37m` |
| Barra de progreso (lleno) | Blanco | `\x1B[37m` |
| Barra de progreso (vacío) | Gris | `\x1B[90m` |
| Bordes de tabla | Gris | `\x1B[90m` |

---

## 4.2 Layout side-by-side

La Tabla 1 y la Tabla 2 se renderizan lado a lado usando `renderSideBySide()`, con un gap de 2 espacios entre ellas. Si la Tabla 2 tiene más líneas que la Tabla 1, las líneas sobrantes se renderizan debajo con indentación.

---

## 4.3 Alineaciones por tabla

**Tabla 1 (4 columnas):** todas centradas (`center`).

**Tabla 2 (6 columnas):** izquierda, izquierda, derecha, derecha, derecha, derecha (`left, left, right, right, right, right`).

**Tabla 3 (4 columnas):** izquierda, izquierda, izquierda, derecha (`left, left, left, right`).

---

## 5. Mapeo de niveles de razonamiento

Los niveles se derivan de las variables de entorno que Claude Code establece al enrutar:

| Nivel | Variable de entorno | Slot en la API |
|---|---|---|
| Lite | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku (menor costo, mayor velocidad) |
| Standard | `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet (uso general) |
| Reasoning | `ANTHROPIC_DEFAULT_OPUS_MODEL` | opus (razonamiento complejo) |

Para clasificar una interacción en un nivel, el script lee el campo `model` de `request/body.json` y aplica un algoritmo de matching con `includes()` + heurísticas por nombre:

```
1. Matching contra env vars (parcial con includes):
   modelId.includes(ANTHROPIC_DEFAULT_HAIKU_MODEL)   → Lite
   modelId.includes(ANTHROPIC_DEFAULT_OPUS_MODEL)     → Reasoning
   modelId.includes(ANTHROPIC_DEFAULT_SONNET_MODEL)   → Standard

2. Heurísticas por nombre (fallback si no matchea env var):
   modelo contiene 'haiku', 'flash', 'mini'          → Lite
   modelo contiene 'opus', 'pro', 'reasoning'        → Reasoning
   por defecto                                        → Standard
```

Se cuentan interacciones con `interactionType === 'agentic-turn'` o `'side-request'` y `totals !== null`.

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
| Colores | ANSI crudo con secuencias RGB (`\x1B[38;2;R;G;Bm`) | todas |
| Bordes de tabla | Caracteres Unicode box-drawing (`╭╮╰╯─│├┤`) | todas |
| Resolver rutas | `path.join`, `import.meta.dirname` | todas |

No se usa `chalk`, `execSync`, `powershell.exe`, ni archivos rc de shell. Los colores se implementan con códigos ANSI raw, incluyendo soporte RGB para el azul `#253ecc` (`\x1B[38;2;37;62;204m`).

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
