# Precios MTok y esquema `anthropic-model-pricing.json`

Índice: [§5 Doc vs local](#5-precios-documentación-oficial-vs-configuración-local) · [§6 Esquema](#6-esquema-del-archivo-de-precios) · [6.3 Mapeo](#63-mapeo-ecuación--json) · [6.4 Modelo](#64-resolución-de-model--precios)

---

## 5. Precios: documentación oficial vs configuración local

Anthropic publica precios por **MTok** en columnas equivalentes a:

1. Entrada base (`input_tokens`).
2. Escritura caché 5m.
3. Escritura caché 1h.
4. Lectura de caché (hits / refreshes).
5. Salida (`output_tokens`).

En la documentación, los **multiplicadores conceptuales** sobre el precio base de entrada son: escritura 5m **1.25×**, escritura 1h **2×**, lectura **0.1×** (véase [Prompt caching en pricing](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching)). Los **valores absolutos en USD/MTok** para la implementación deben vivir en `config/anthropic-model-pricing.json` del proyecto, no en el código fuente.

---

## 6. Esquema del archivo de precios (`config/anthropic-model-pricing.json`)

Objetivo: **un solo archivo** editable para actualizar costes sin modificar TypeScript/JavaScript del proxy.

### 6.1 Campos en la raíz

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `schemaVersion` | número | Incrementar si cambian claves obligatorias o el significado de los campos. |
| `updatedAt` | string (ISO 8601) | Informativo: última actualización manual del snapshot. |
| `pricingSourceUrl` | string | URL de la página oficial usada al rellenar los valores. |
| `currency` | string | P. ej. `"USD"`. |
| `unit` | string | `"per_million_tokens"` — coherente con la API de facturación Anthropic. |
| `defaultModifiers` | objeto opcional | P. ej. `inferenceGeoUs`: multiplicador documentado para inferencia solo en EE. UU. cuando aplique. |
| `models` | array | Un bloque por modelo (o familia de IDs). |

### 6.2 Cada elemento de `models`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `modelId` | string | Valor exacto del campo `model` en petición/respuesta (p. ej. `claude-haiku-4-5-20251001`). |
| `aliases` | string[] opcional | Otros identificadores que deben resolverse al mismo bloque de costes. |
| `costs.input.base` | número | USD por MTok para `input_tokens`. |
| `costs.input.cacheWrite5m` | número | USD por MTok para `cache_creation.ephemeral_5m_input_tokens`. |
| `costs.input.cacheWrite1h` | número | USD por MTok para `cache_creation.ephemeral_1h_input_tokens`. |
| `costs.input.cacheRead` | número | USD por MTok para `cache_read_input_tokens`. |
| `costs.output` | número | USD por MTok para `output_tokens`. |

### 6.3 Mapeo ecuación ↔ JSON

Cada sumando de la ecuación es **tokens de una categoría** × **un precio por MTok** del JSON correspondiente. No hace falta un único número “input caché vs no caché”: ya está separado en `base`, escrituras 5m/1h y lectura.

### 6.4 Resolución de `model` → precios

Al calcular el coste:

1. Buscar una entrada cuyo `modelId` coincida exactamente con el campo `model` del mensaje o de la petición.
2. Si no hay coincidencia, probar cada lista `aliases` de las entradas.
3. Si no hay entrada aplicable, no inventes precios: marca el coste como **desconocido** o aplica una política explícita (p. ej. modelo por defecto o error), según tu producto.
