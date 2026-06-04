# Statusline de Claude Code (router-status.ts)

Especificación del statusline de Smart Code Proxy: diseño visual, fuentes de datos, dispatch e integración con Claude Code.

## Implementación

| Artefacto | Ruta |
| --------- | ---- |
| Script principal | [`scripting/router-status.ts`](../scripting/router-status.ts) |
| Instalador | [`scripting/install-statusline.ts`](../scripting/install-statusline.ts) |
| Lectura/escritura de settings | [`scripting/shared/claude-settings.ts`](../scripting/shared/claude-settings.ts) |
| Tests | `tests/scripting/router-status-*.test.ts` |

---

## 1. Resumen

El statusline es el comando que Claude Code invoca en cada actualización de la barra de estado. Smart Code Proxy proporciona [`scripting/router-status.ts`](../scripting/router-status.ts), que renderiza tablas Unicode con información de sesión, proveedor upstream, consumo de tokens por nivel de razonamiento y, cuando aplica, límites de suscripción OAuth.

Claude Code envía el contexto de la sesión actual por **stdin** (JSON, `$ctx`). El script combina esos datos con la configuración en `~/.claude/settings.json → env` y con artefactos del repositorio del proxy (`configs/.env`, `routing/providers/`, `sessions/`).

Con el proxy activo, **`ANTHROPIC_BASE_URL` en Claude Code apunta al proxy local** (`http://127.0.0.1:<PORT>`). El proveedor upstream real se resuelve cruzando `UPSTREAM_ORIGIN` (en `configs/.env`) con `routing/providers/*/config.json`.

**Capacidades:**

- Dos o tres tablas según el método de autenticación (`api_key`, `bearer`, `oauth`).
- Tablas 1 y 2 siempre en layout side-by-side; métricas de Tabla 2 desde `session-metrics.json` por sesión.
- Tabla 3 (rate limits) solo con OAuth y datos de cuota en stdin.
- Caché ligera por sesión (`.statusline-state.json`) para porcentaje de contexto y resaltado de métricas.
- Ejecución multiplataforma con Node.js estándar (`fs`, `path`, `process.stdin`); sin dependencia de shell scripts externos.

Instalación: [`npm run install:statusline`](#9-integración) (véase [how-to-start.md](./how-to-start.md)).

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

`configure-provider.ts` escribe las variables `ANTHROPIC_*` en `~/.claude/settings.json → env` ([fuente oficial de configuración de Claude Code](https://code.claude.com/docs/en/env-vars)) y el upstream real del proxy en `configs/.env → UPSTREAM_ORIGIN`. El statusline lee ambas fuentes directamente. `process.env` no forma parte del contrato de diseño.

---

## 3. Layout general

El statusline consta de **dos o tres tablas** según el método de autenticación. La Tabla 1 y la Tabla 3 se renderizan **side-by-side** (lado a lado) cuando hay OAuth con datos de cuota; si no hay Tabla 3, la Tabla 1 aparece sola en la primera fila. La Tabla 2 siempre aparece debajo.

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
| Modelo activo     | texto de `ctx.model.display_name`, enriquecido con `displayName` si coincide con un `modelId` en `metadata.json` | stdin (`ctx.model.display_name`) + búsqueda en `metadata.json` por `modelId` | centrada   |
| Contexto (tks)    | tamaño de ventana formateado como `NNNk` / `NNNm`              | stdin (`ctx.context_window.context_window_size`)                 | centrada   |
| Porcentaje de uso | barra de progreso + porcentaje                                 | stdin (`ctx.context_window.used_percentage`) con fallback a caché (véase abajo) | centrada   |

**Barra de progreso:** 8 bloques, usando `█` (lleno) y `░` (vacío). Color dinámico por rango de porcentaje: verde (`#2ecc71`) 0–39%, naranja (`#f39c12`) 40–69%, rojo (`#e74c3c`) 70–100%. Vacío: gris (`\x1B[90m`).

**Porcentaje de contexto (prioridad):** (1) si stdin trae `used_percentage` numérico, finito y **mayor que 0**, se usa y se persiste en `.statusline-state.json`; (2) si está ausente, no es finito o es `0`, se usa `contextUsagePercentage` de la caché de sesión; (3) si no hay caché, la barra muestra `0%`. Un `used_percentage === 0` en stdin **no** se muestra tal cual: activa el fallback a caché.

---

### 3.2 Tabla 2 — Interacciones y consumo de tokens (común a todos los proveedores)

Presente siempre, independientemente del método de autenticación. Se renderiza en side-by-side con la Tabla 1 incluso sin `ctx.session_id` ni carpeta en `sessions/` (métricas en cero). Permite al usuario conocer cuántos tokens consume por nivel de razonamiento en la sesión actual, tanto para providers con facturación por token (bearer) como para suscripciones (OAuth).

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

> **Semántica:** las columnas Input / Cache In / Output reflejan consumo acumulado de la sesión (tokens facturados), no el tamaño del contexto en un único request. Ver [`session-metrics-system.md`](./session-metrics-system.md).

**Formato de números:** entero con separador de miles (p. ej. `1,234,567`). Si el valor es `0`, muestra `-`.

**Headers simples:** cada columna tiene su propio header (sin celdas fusionadas en la fila de headers).

---

### 3.3 Tabla 3 — Rate Limits (solo OAuth)

Se renderiza cuando `authMethod === 'oauth'` **y** `ctx.rate_limits` incluye al menos `five_hour` o `seven_day`. Si el método es OAuth pero stdin no trae datos de cuota, no se imprime Tabla 3 (el bloque Tabla 1 + Tabla 2 no cambia). Aplica al proveedor `anthropic` con suscripción PRO/Max.

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

**Barra de progreso:** 8 bloques (`█` / `░`), colores dinámicos según porcentaje (verde/naranja/rojo), misma lógica que la Tabla 1.

---

## 4. Dispatch por tipo de proveedor

```
resolveActiveProvider()
  ├── leer UPSTREAM_ORIGIN de configs/.env
  └── cruzar con routing/providers/*/config.json → nombre del proveedor

resolveAuthMethodFromEnv(settingsEnv)
  ├── leer ANTHROPIC_API_KEY de ~/.claude/settings.json → env
  ├── leer ANTHROPIC_AUTH_TOKEN de ~/.claude/settings.json → env
  └── determinar authMethod:
        ANTHROPIC_API_KEY presente    → 'api_key'
        ANTHROPIC_AUTH_TOKEN presente → 'bearer'
        ninguno                       → 'oauth'

buildStatuslineOutput()
  ├── si hay sessionDir: leer .statusline-state.json (caché, para Tabla 2 y fallback de % en Tabla 1)
  ├── Fila 1: Tabla 1 + Tabla 3 side-by-side (si oauth con cuotas); o solo Tabla 1 (resto de casos)
  ├── si hay sessionDir: escribir .statusline-state.json (caché: metricsSnapshot; % de contexto al renderizar Tabla 1 si stdin aportó valor usable)
  └── Fila 2: Tabla 2 (Steps por nivel de razonamiento, siempre, debajo)
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
| Barra de progreso (lleno, 0–39%) | Verde `#2ecc71` | `\x1B[38;2;46;204;113m` |
| Barra de progreso (lleno, 40–69%) | Naranja `#f39c12` | `\x1B[38;2;243;156;18m` |
| Barra de progreso (lleno, 70–100%) | Rojo `#e74c3c` | `\x1B[38;2;231;76;60m` |
| Barra de progreso (vacío) | Gris           | `\x1B[90m`             |
| Bordes de tabla           | Gris           | `\x1B[90m`             |

Los bloques llenos (`█`) de las barras de contexto (Tabla 1) y de cuotas (Tabla 3) usan la escala dinámica anterior; ver §3.1.

---

## 4.2 Layout side-by-side

La Tabla 1 y la Tabla 3 se renderizan lado a lado usando `renderSideBySide()`, con un gap de 2 espacios entre ellas, cuando `authMethod === 'oauth'` y hay datos de cuota en ctx. Si la Tabla 3 tiene más líneas que la Tabla 1, las líneas sobrantes se renderizan debajo con indentación.

Cuando no hay Tabla 3 (`api_key` o `bearer`, u OAuth sin datos de cuota), la Tabla 1 se imprime sola en la primera fila.

La Tabla 2 (métricas) se imprime siempre **debajo** del bloque de la primera fila.

---

## 4.3 Alineaciones por tabla

**Tabla 1 (4 columnas):** todas centradas (`center`).

**Tabla 2 (6 columnas):** izquierda, izquierda, derecha, derecha, derecha, derecha (`left, left, right, right, right, right`).

**Tabla 3 (4 columnas):** izquierda, izquierda, izquierda, derecha (`left, left, left, right`).

---

## 4.4 Caché por sesión (`.statusline-state.json`)

El statusline persiste estado ligero por sesión para mejorar la lectura entre re-invocaciones de Claude Code. **No** sustituye a `session-metrics.json`.

| Aspecto | Detalle |
| ------- | ------- |
| Ruta | `sessions/<sessionDir>/.statusline-state.json` |
| Lectura | Al renderizar Tabla 1 (fallback de %) y Tabla 2 (diff de celdas), si existe `sessionDir` |
| Escritura | Tras renderizar Tabla 1 (`contextUsagePercentage` si stdin aportó valor usable) y al final de Tabla 2 (`metricsSnapshot`) |

**Campos:**

| Campo | Uso |
| ----- | --- |
| `contextUsagePercentage` | Fallback de la barra de contexto (Tabla 1) cuando stdin no trae `ctx.context_window.used_percentage` **usable** (`number`, `Number.isFinite`, `> 0`) |
| `metricsSnapshot` | Snapshot `{ lite, standard, reasoning }` con `count`, `inputTokens`, `cacheReadInputTokens`, `outputTokens` para atenuar (`dim`) o resaltar (`value`) celdas numéricas en Tabla 2 vía `cellColor` |

**Fuera de alcance de la caché:** reconstruir métricas de sesión si falta o está corrupto `session-metrics.json`; la Tabla 2 sigue dependiendo exclusivamente de ese archivo.

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
classifyModelWithEnv(modelId, settingsEnv):
  modelId incluye ANTHROPIC_DEFAULT_HAIKU_MODEL  → Lite
  modelId incluye ANTHROPIC_DEFAULT_OPUS_MODEL   → Reasoning
  modelId incluye ANTHROPIC_DEFAULT_SONNET_MODEL → Standard
```

Orden de evaluación: haiku → opus → sonnet. Si `modelId` no coincide con ninguno de los tres modelos configurados, el registro no se suma a ningún nivel.

**Fallback heurístico (vars ausentes):** si las tres variables `ANTHROPIC_DEFAULT_*_MODEL` están vacías o ausentes (situación típica con `configure-provider default` / OAuth nativo), la clasificación usa los términos `"haiku"` → Lite, `"opus"` → Reasoning, `"sonnet"` → Standard como substrings del `modelId`. El fallback no se activa si al menos una variable está configurada; en ese caso solo aplica el modo primario.

---

## 6. Resolución de sesión activa

El statusline recibe `ctx.session_id` por stdin. Con ese valor busca el directorio de sesión en `sessions/`:

```
sessionDir = sessions/<directorio cuyo nombre comienza con ctx.session_id>
metrics    = sessions/<sessionDir>/session-metrics.json
```

El proxy puede añadir un sufijo al nombre de la carpeta, por lo que la búsqueda usa coincidencia de prefijo. Si no hay coincidencia, la Tabla 2 se renderiza en cero/sin datos.

Layout de sesiones: [`session-audit-model.md`](./session-audit-model.md).

---

## 7. Resolución del nombre de display de modelo (Tabla 2)

Esta sección aplica a la columna **Modelo** de la **Tabla 2** (métricas por nivel), no a la columna **Modelo activo** de la Tabla 1 (véase §3.1).

Para cada `modelId` agregado desde `session-metrics.json`, se muestra el `displayName` de `routing/providers/<provider>/models/<modelId>/metadata.json`. Si el archivo no existe o no tiene ese campo, se muestra el `modelId` como degradación visual.

---

## 8. Multiplataforma

El script usa únicamente Node.js APIs estándar (`fs`, `path`, `process.stdin`). No depende de PowerShell, archivos rc de shell ni del registro de Windows. Los colores son códigos ANSI raw sin dependencias externas.

---

## 9. Integración

### Instalación recomendada

Desde la raíz del repositorio del proxy, puede instalar el statusline junto con notificaciones y voz en un único paso:

```bash
npm run setup
```

O solo el statusline:

```bash
npm run install:statusline
```

Ambos usan el mismo instalador subyacente ([`scripting/install-statusline.ts`](../scripting/install-statusline.ts)) y escriben en `~/.claude/settings.json`:

- `statusLine` con `type: "command"`, `padding: 0` y un comando generado por `buildNpxTsxCommand`: `npx --prefix "<ROOT>"` + `tsx "<RUTA_ABSOLUTA>/scripting/router-status.ts"` (ruta del script **absoluta**, separadores **`/`**, citada para cmd/PowerShell o shell POSIX según el SO)
- `env.SMART_CODE_PROXY_ROOT` con la ruta absoluta nativa del proxy (para resolver `sessions/`, `routing/` y `configs/.env` aunque Claude Code abra otro workspace)

Reinicie Claude Code tras instalar. Opciones: `--dry-run`, `--force` (sobrescribir un statusLine ajeno), `--uninstall`. Si mueve el clon del repo, vuelva a ejecutar el instalador.

### Configuración manual (alternativa)

Si prefiere editar a mano, el bloque equivalente es:

```json
"statusLine": {
  "type": "command",
  "command": "npx --prefix \"<RUTA_ABSOLUTA_DEL_PROXY>\" tsx \"<RUTA_ABSOLUTA_DEL_PROXY>/scripting/router-status.ts\"",
  "padding": 0
}
```

Use `/` en la ruta del script aunque el proxy esté en Windows (p. ej. `C:/Users/.../Smart Code Proxy/scripting/router-status.ts`). Prefiera `npm run install:statusline` para no citar mal las rutas.

y en `env`: `"SMART_CODE_PROXY_ROOT": "<RUTA_ABSOLUTA_DEL_PROXY>"`.

### Scripts de configuración en `settings.json`

**`configure-provider.ts`** escribe las variables `ANTHROPIC_*` en `~/.claude/settings.json → env` mediante `ClaudeSettingsEnvManager` (auth y modelos por nivel). No modifica `statusLine` ni `SMART_CODE_PROXY_ROOT`.

**`install-statusline.ts`** (véase instalación recomendada arriba) escribe `statusLine` y `env.SMART_CODE_PROXY_ROOT`.

**`router-status.ts`** lee el bloque `env` completo en cada invocación: `ANTHROPIC_*` (dispatch y clasificación), `SMART_CODE_PROXY_ROOT` (rutas a `sessions/`, `routing/` y `configs/.env`).

---

## 10. Comportamiento ante entradas inválidas y límites

### Comportamiento ante entradas inválidas

| Condición | Comportamiento esperado |
| --------- | ----------------------- |
| `ctx.session_id` sin carpeta coincidente en `sessions/` | Tabla 2 se renderiza en cero/sin datos |
| `session-metrics.json` ausente o malformado | Tabla 2 se renderiza en cero/sin datos |
| `modelId` de un registro no coincide con ningún modelo configurado | El registro no se suma a ningún nivel |
| `ANTHROPIC_DEFAULT_*_MODEL` ausentes o vacías | Fallback heurístico por términos `haiku`/`opus`/`sonnet` en el `modelId`; `null` si no hay coincidencia |
| `cacheReadInputTokens` es `null` | Se trata como `0` en la suma (`coerceMetricNumber` en el lector del statusline; mismo criterio para `count`, `inputTokens`, `outputTokens`) |
| `displayName` ausente en `metadata.json` (Tabla 2) | Se muestra `modelId` como texto de la columna Modelo |
| `ctx.context_window.used_percentage` ausente, no finito o `0` | Usar `contextUsagePercentage` de `.statusline-state.json` si existe; si no, barra al `0%` |
| `authMethod === 'oauth'` sin `five_hour` ni `seven_day` en `ctx.rate_limits` | No se muestra Tabla 3 |
| `.statusline-state.json` ausente, corrupto o ilegible | Ignorar caché; Tabla 2 sin diff de celdas; Tabla 1 sin % de contexto cacheado |

### Fuera de alcance

- Configurar auth o modelos por nivel desde `process.env` directamente.
- Escanear `interactions/*/meta.json` para reconstruir métricas (sustituido por `session-metrics.json`).
- Inferir nivel de razonamiento por heurísticas del nombre del modelo.
- Seleccionar una sesión alternativa si `ctx.session_id` no coincide con ninguna carpeta.
