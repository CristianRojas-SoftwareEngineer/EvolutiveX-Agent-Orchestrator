# Statusline de Smart Code Proxy

## Descripción general

El statusline es un script TypeScript (`scripting/router-status.ts`, ~900 líneas) que se ejecuta como proceso hijo de Claude Code. Renderiza 2-3 tablas Unicode con bordes redondeados en la línea de estado de la terminal, mostrando información de la sesión activa, métricas de interacciones por nivel de razonamiento y rate limits (solo OAuth).

- **Ubicación:** `scripting/router-status.ts`
- **Tecnología:** TypeScript puro, sin dependencias externas (sin `chalk`)
- **Integración:** `settings.json → statusLine.command`
- **Entrada:** JSON por stdin con el contexto de Claude Code (`$ctx`)

---

## Tabla 1: Sesión y proveedor activo

Se renderiza siempre. Muestra información de la sesión actual y el proveedor activo.

```
╭─ Sesión actual «9b4510c9-90ca-4439-9dc2-a5d62bf0b308» ─────────────╮
│  Proveedor  │ Modelo activo  │ Contexto (tks) │ Porcentaje de uso │
├─────────────┼────────────────┼─────────────────────┼───────────────────┤
│  Anthropic  │ claude-opus-4-7│       200K          │ ████████░░ 45%   │
╰─────────────┴────────────────┴─────────────────────┴───────────────────╯
```

**Columnas (4, todas centradas):**

| Columna | Fuente | Formato |
|---|---|---|
| Proveedor | cruce `UPSTREAM_ORIGIN` vs `routing/providers/*/config.json` | capitalizado |
| Modelo activo | `ctx.model.display_name` → `metadata.json → displayName` | nombre de display |
| Contexto (tks) | `ctx.context_window.context_window_size` | `NNNk` / `NNNm` |
| Porcentaje de uso | `ctx.context_window.used_percentage` | barra 8 bloques + `XX%` |

### Resolución de proveedor

1. Leer `UPSTREAM_ORIGIN` de `configs/.env`
2. Escanear `routing/providers/*/config.json`
3. Buscar cuya `ANTHROPIC_BASE_URL` coincida con `UPSTREAM_ORIGIN`
4. Si no hay match: `"Desconocido"`

### Resolución de modelo

1. Obtener `ctx.model.display_name` del stdin
2. Buscar en `routing/providers/*/models/*/metadata.json` cuyo `modelId` coincida
3. Si hay `displayName`: usarlo. Si no: usar el `modelId` directamente

### Barra de progreso

- 8 bloques usando `█` (lleno) y `░` (vacío)
- Color dinámico por rango de porcentaje:
  - Verde (`#2ecc71`): 0–39%
  - Naranja (`#f39c12`): 40–69%
  - Rojo (`#e74c3c`): 70–100%
- Vacío: gris (`\x1B[90m`)
- Persistencia: el estado del statusline (porcentaje de uso del contexto y snapshot de métricas) se persiste en `sessions/<uuid>/.statusline-state.json` (caché por sesión) entre renders para evitar parpadeos cuando Claude Code no provee el dato en un frame dado y para detectar cambios en los valores. Cada sesión mantiene su propio caché, aislada de las demás

---

## Tabla 2: Métricas de interacciones

Se renderiza siempre, junto a la Tabla 1 en layout side-by-side. Muestra el consumo de tokens por nivel de razonamiento.

```
╭─ Interacciones por nivel de razonamiento ─────────────────────────────╮
│ Nivel     │ Modelo         │ # Interacciones │ Input │ Cache │ Output │
├───────────┼────────────────┼─────────────────┼───────┼───────┼────────┤
│ Lite      │ MiMo 2 Omni    │              12 │ 45230 │ 12000 │   8500 │
│ Standard  │ MiMo 2.5       │              35 │189400 │ 67000 │  42100 │
│ Reasoning │ MiMo 2.5 Pro   │               8 │312000 │ 95000 │  78000 │
├───────────┴────────────────┼─────────────────┼───────┼───────┼────────┤
│ Totales de sesión          │              55 │546630 │174000 │ 128600 │
╰────────────────────────────┴─────────────────┴───────┴───────┴────────╯
```

**Columnas (6):** izq/izq/der/der/der/der

| Columna | Fuente |
|---|---|
| Nivel | `Lite` / `Standard` / `Reasoning` (texto fijo) |
| Modelo | display name del modelo del nivel (`metadata.json → displayName`) |
| # Interacciones | conteo de steps (llamadas API) por modelo en `session-metrics.json` |
| Input (tks) | suma de `totals.inputTokens` |
| Cache In (tks) | suma de `totals.cacheReadInputTokens` |
| Output (tks) | suma de `totals.outputTokens` |

### Clasificación de modelos

El script usa `includes()` + heurísticas por nombre:

1. **Matching contra env vars** (parcial):
   - `modelId.includes(ANTHROPIC_DEFAULT_HAIKU_MODEL)` → Lite
   - `modelId.includes(ANTHROPIC_DEFAULT_OPUS_MODEL)` → Reasoning
   - `modelId.includes(ANTHROPIC_DEFAULT_SONNET_MODEL)` → Standard

2. **Heurísticas por nombre** (fallback):
   - Contiene `haiku`, `flash`, `mini` → Lite
   - Contiene `opus`, `pro`, `reasoning` → Reasoning
   - Por defecto → Standard

### Fila de totales

- Celdas fusionadas en columnas 0+1 (texto `"Totales de sesión"`)
- Suma de las tres filas de nivel para columnas numéricas
- Separadores horizontales usan `┴` en la posición de la columna fusionada
- Formato: entero con separador de miles; `0` → `-`

### Filtro de interacciones

Se cuentan interacciones con:
- `interactionType === 'agentic'` **o**
- `interactionType === 'side-request'`
- Y `totals !== null`

---

## Tabla 3: Rate Limits (solo OAuth)

Se renderiza **únicamente** cuando `authMethod === 'oauth'`. Aparece debajo de las tablas 1+2.

```
╭─ Límites de uso por suscripción ─────────────────────────────────────────────────────╮
│ Cuota actual (5h)  │ ████████████░░░░░░░░ 60% │ Reinicio en │          1h 43m       │
│ Cuota semanal (7d) │ █████░░░░░░░░░░░░░░░ 15% │ Reinicio en │          4d 7h        │
╰────────────────────┴─────────────────────────┴─────────────┴────────────────────────╯
```

**Condición de visibilidad:** `authMethod === 'oauth'` (no hay `ANTHROPIC_API_KEY` ni `ANTHROPIC_AUTH_TOKEN`).

**Cuotas (4 columnas: izq, izq, izq, der):**
- **Cuota actual (5h):** `ctx.rate_limits.five_hour` (`used_percentage`, `resets_at`)
- **Cuota semanal (7d):** `ctx.rate_limits.seven_day` (`used_percentage`, `resets_at`)

---

## Layout side-by-side

La Tabla 1 y la Tabla 2 se renderizan lado a lado usando `renderSideBySide()`:

- Gap de 2 espacios entre tablas
- Si la Tabla 2 tiene más líneas que la Tabla 1, las sobrantes se renderizan debajo con indentación (usando ZWSP para evitar recorte de terminal)
- La Tabla 3 se renderiza debajo con línea vacía de separación

---

## Colores ANSI

El script usa códigos ANSI raw sin dependencias externas:

| Elemento | Color | Código |
|---|---|---|
| Cabeceras y títulos | Azul `#253ecc` | `\x1B[38;2;37;62;204m` |
| Valores | Blanco | `\x1B[37m` |
| Nivel Lite | Gris | `\x1B[90m` |
| Barra lleno (0–39%) | Verde `#2ecc71` | `\x1B[38;2;46;204;113m` |
| Barra lleno (40–69%) | Naranja `#f39c12` | `\x1B[38;2;243;156;18m` |
| Barra lleno (70–100%) | Rojo `#e74c3c` | `\x1B[38;2;231;76;60m` |
| Barra vacío | Gris | `\x1B[90m` |
| Bordes | Gris | `\x1B[90m` |

---

## Configuración en settings.json

```json
"statusLine": {
  "type": "command",
  "command": "npx tsx 'C:/Users/Cristian/Desktop/Proyectos/Smart Code Proxy/scripting/router-status.ts'",
  "padding": 0
}
```

Las variables de entorno (proveedor, auth, modelos) se configuran en `~/.claude/settings.json → env` por `configure-provider.ts` y están disponibles en `process.env` del statusline.
