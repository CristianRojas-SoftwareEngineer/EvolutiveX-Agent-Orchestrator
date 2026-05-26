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

`router-status.ts` lee exactamente estas fuentes en el flujo soportado:

| Dato | Fuente | Campo |
| ---- | ------ | ----- |
| Session ID | stdin (`$ctx`) | `ctx.session_id` |
| Modelo activo | stdin (`$ctx`) | `ctx.model.display_name` |
| Tamaño de contexto | stdin (`$ctx`) | `ctx.context_window.context_window_size` |
| Porcentaje de uso de contexto | stdin (`$ctx`) | `ctx.context_window.used_percentage` |
| Rate limits (solo OAuth) | stdin (`$ctx`) | `ctx.rate_limits.five_hour`, `ctx.rate_limits.seven_day` |
| Provider upstream activo | `configs/.env` | `UPSTREAM_ORIGIN` |
| Nombre del proveedor | `routing/providers/*/config.json` → cruce con `UPSTREAM_ORIGIN` | `config.ANTHROPIC_BASE_URL` |
| Método de auth | `~/.claude/settings.json → env` | `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` |
| Modelos por nivel | `~/.claude/settings.json → env` | `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| Display name de modelo | `routing/providers/<p>/models/<m>/metadata.json` | `displayName` |
| Métricas acumuladas de sesión | `sessions/<ctx.session_id>/session-metrics.json` | contadores por `modelId` |

### Variables de entorno de Claude Code

`configure-provider.ts` escribe las variables `ANTHROPIC_*` en `~/.claude/settings.json → env` ([fuente oficial de configuración de Claude Code](https://code.claude.com/docs/en/env-vars)) y el upstream real del proxy en `configs/.env → UPSTREAM_ORIGIN`. El statusline lee ambas fuentes directamente. `process.env` no forma parte del contrato de diseño de esta versión.

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

| Columna           | Contenido                                                      | Fuente                                                           | Alineación |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| Proveedor         | nombre del proveedor resuelto (capitalizado)                   | cruce `UPSTREAM_ORIGIN` vs `config.json`                         | centrada   |
| Modelo activo     | display name del modelo activo (`metadata.json → displayName`) | stdin (`ctx.model.display_name`) + resolución en `metadata.json` | centrada   |
| Contexto (tks)    | tamaño de ventana formateado como `NNNk` / `NNNm`              | stdin (`ctx.context_window.context_window_size`)                 | centrada   |
| Porcentaje de uso | barra de progreso + porcentaje                                 | stdin (`ctx.context_window.used_percentage`)                     | centrada   |

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

| Columna         | Contenido                                           | Fuente                                                    | Alineación |
| --------------- | --------------------------------------------------- | --------------------------------------------------------- | ---------- |
| Nivel           | `Lite` / `Standard` / `Reasoning`                   | texto fijo por slot                                    | izquierda  |
| Modelo          | display name del modelo del nivel                   | `metadata.json → displayName` (o `modelId` si falta)  | izquierda  |
| # Interacciones | cantidad de turnos del nivel en la sesión           | `session-metrics.json → models[modelId].count`         | derecha    |
| Input (tks)     | suma de `inputTokens` para el nivel                 | `session-metrics.json → models[modelId].inputTokens`   | derecha    |
| Cache In (tks)  | suma de `cacheReadInputTokens` para el nivel        | `session-metrics.json → models[modelId].cacheReadInputTokens` | derecha    |
| Output (tks)    | suma de `outputTokens` para el nivel                | `session-metrics.json → models[modelId].outputTokens`  | derecha    |

**Fila de totales:** celdas fusionadas en columnas 0+1 (texto `"Totales de sesión"`), suma de las tres filas de nivel para las columnas numéricas. Los separadores horizontales usan `┴` en la posición de la columna fusionada.

> **Semántica:** las columnas Input / Cache In / Output reflejan consumo acumulado de la sesión (tokens facturados), no el tamaño del contexto en un único request. Ver [`session-metrics-system.md`](../session-metrics-system.md).

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

| Columna           | Contenido                                      | Fuente                                                                         | Alineación |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| Cuota             | `"Cuota actual (5h)"` / `"Cuota semanal (7d)"` | texto fijo                                                                     | izquierda  |
| Barra + %         | barra de progreso + porcentaje (`XX%`)         | `ctx.rate_limits.five_hour.used_percentage` / `seven_day.used_percentage`      | izquierda  |
| Etiqueta reinicio | texto fijo `"Reinicio en"`                     | —                                                                              | izquierda  |
| Tiempo restante   | `"Xh Ym"` / `"Xd Yh"`                          | `ctx.rate_limits.five_hour.resets_at` / `seven_day.resets_at` (epoch segundos) | derecha    |

**Barra de progreso:** colores dinámicos según porcentaje (verde/naranja/rojo), misma lógica que la Tabla 1.

---

## 4. Dispatch por tipo de proveedor

```
resolveActiveProvider()
  ├── leer UPSTREAM_ORIGIN de configs/.env
  └── cruzar con routing/providers/*/config.json → nombre del proveedor

resolveAuthMethod()
  ├── leer ANTHROPIC_API_KEY de ~/.claude/settings.json → env
  ├── leer ANTHROPIC_AUTH_TOKEN de ~/.claude/settings.json → env
  └── determinar authMethod:
        ANTHROPIC_API_KEY presente    → 'api_key'
        ANTHROPIC_AUTH_TOKEN presente → 'bearer'
        ninguno                       → 'oauth'

renderTablas()
  ├── Tabla 1 + Tabla 2: Side-by-side (siempre)
  └── Tabla 3: Rate Limits (solo authMethod === 'oauth', debajo)
```

---

## 4.1 Colores ANSI

El script usa códigos ANSI raw sin dependencias externas:

| Elemento                  | Color          | Código ANSI            |
| ------------------------- | -------------- | ---------------------- |
| Cabeceras y títulos       | Azul `#253ecc` | `\x1B[38;2;37;62;204m` |
| Valores de celdas         | Blanco         | `\x1B[37m`             |
| Nivel Lite                | Gris           | `\x1B[90m`             |
| Nivel Standard            | Blanco         | `\x1B[37m`             |
| Nivel Reasoning           | Blanco bold    | `\x1B[1;37m`           |
| Barra de progreso (lleno) | Blanco         | `\x1B[37m`             |
| Barra de progreso (vacío) | Gris           | `\x1B[90m`             |
| Bordes de tabla           | Gris           | `\x1B[90m`             |

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

`configure-provider.ts` configura exactamente tres modelos en `~/.claude/settings.json → env`:

| Nivel | Variable | Slot en la API |
| ----- | -------- | -------------- |
| Lite | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku |
| Standard | `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet |
| Reasoning | `ANTHROPIC_DEFAULT_OPUS_MODEL` | opus |

Para clasificar una interacción en un nivel, el script compara el `modelId` del registro en `session-metrics.json` contra los tres valores configurados:

```
classifyModel(modelId):
  modelId incluye ANTHROPIC_DEFAULT_HAIKU_MODEL  → Lite
  modelId incluye ANTHROPIC_DEFAULT_OPUS_MODEL   → Reasoning
  modelId incluye ANTHROPIC_DEFAULT_SONNET_MODEL → Standard
```

Si `modelId` no coincide con ninguno de los tres modelos configurados, el registro no se suma a ningún nivel.

---

## 6. Resolución de sesión activa

El statusline recibe `ctx.session_id` por stdin. Con ese valor busca el directorio de sesión en `sessions/`:

```
sessionDir = sessions/<directorio cuyo nombre comienza con ctx.session_id>
metrics    = sessions/<sessionDir>/session-metrics.json
```

El proxy puede añadir un sufijo al nombre de la carpeta, por lo que la búsqueda usa coincidencia de prefijo. Si no hay coincidencia, la Tabla 2 se renderiza en cero/sin datos.

Layout de sesiones: [`session-audit-model.md`](../session-audit-model.md).

---

## 7. Resolución del nombre de display de modelo

La columna `Modelo` de la Tabla 2 muestra el `displayName` definido en `routing/providers/<provider>/models/<modelId>/metadata.json`. Si el archivo no existe o no tiene ese campo, se muestra el `modelId` como degradación visual.

---

## 8. Multiplataforma

El script usa únicamente Node.js APIs estándar (`fs`, `path`, `process.stdin`). No depende de PowerShell, archivos rc de shell ni del registro de Windows. Los colores son códigos ANSI raw sin dependencias externas.

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

`configure-provider.ts` escribe las variables `ANTHROPIC_*` en `~/.claude/settings.json → env` mediante `ClaudeSettingsEnvManager`. El statusline lee esa fuente directamente al arrancar.

---

## 10. Validaciones mínimas y fuera de alcance

### Validaciones mínimas v1

| Condición | Comportamiento esperado |
| --------- | ----------------------- |
| `ctx.session_id` sin carpeta coincidente en `sessions/` | Tabla 2 se renderiza en cero/sin datos |
| `session-metrics.json` ausente o malformado | Tabla 2 se renderiza en cero/sin datos |
| `modelId` de un registro no coincide con ningún modelo configurado | El registro no se suma a ningún nivel |
| `cacheReadInputTokens` es `null` | Se trata como `0` en la suma |
| `displayName` ausente en `metadata.json` | Se muestra `modelId` como texto de la columna |

### Fuera de alcance v1

- Configurar auth o modelos por nivel desde `process.env` directamente.
- Escanear `interactions/*/meta.json` para reconstruir métricas (sustituido por `session-metrics.json`).
- Inferir nivel de razonamiento por heurísticas del nombre del modelo.
- Seleccionar una sesión alternativa si `ctx.session_id` no coincide con ninguna carpeta.
