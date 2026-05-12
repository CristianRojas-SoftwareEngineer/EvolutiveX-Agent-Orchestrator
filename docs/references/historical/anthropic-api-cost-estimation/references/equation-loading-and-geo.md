# Carga del JSON, modificador geo y ecuación (Messages)

Alineado con `docs/how-to-calculate-anthropic-api-costs.md` §7–8 del repositorio del proxy (misma semántica; lectura canónica en el doc del repo).

Índice: [§7 Carga](#7-estrategia-de-carga-diseño) · [§7.1 inference_geo](#71-modificador-inference_geo-opcional) · [§8 Ecuación](#8-ecuación-del-coste-por-interacción-messages)

---

## 7. Estrategia de carga (diseño)

| Aspecto | Recomendación |
|---------|----------------|
| **Lectura inicial** | *Lazy loading:* al primer cálculo de coste, leer el JSON desde disco, validar `schemaVersion` y construir un mapa `modelId → costs` (incluyendo `aliases`). |
| **Caché en memoria** | Mantener ese mapa en el proceso para no releer el archivo en cada petición. |
| **Reinicio** | Al reiniciar el servidor, la caché se pierde y el archivo se puede volver a cargar en el próximo uso (o en el arranque si se prefiere carga *eager*). |
| **Recarga sin reinicio** | Posible extensión futura: señal al proceso o endpoint administrativo para invalidar la caché. |

No implementar el loader en el servidor Express puede ser aceptable según el proyecto; la restricción es de **diseño** para que el código futuro siga este contrato.

### 7.1 Modificador inference_geo (opcional)

La documentación de [precios (Data residency)](https://platform.claude.com/docs/en/about-claude/pricing#data-residency-pricing) indica que, en la **Claude API en primera persona (1P)** y para **modelos donde aplica**, especificar inferencia solo en EE. UU. vía el parámetro `inference_geo` puede implicar un **multiplicador 1.1×** sobre **todas** las categorías de precio por token (entrada, salida y caché). Ese recargo es distinto del enrutamiento global por defecto. Plataformas de terceros (Bedrock, Vertex, etc.) tienen reglas propias.

En la implementación:

- Usa `defaultModifiers.inferenceGeoUs` del JSON (p. ej. `1.1`) solo cuando, según tu lectura de la petición y la documentación vigente del modelo, **corresponda** aplicar residencia US.
- Si `inference_geo` es `not_available` o la petición no usa residencia US, **no** apliques ese multiplicador (salvo regla de negocio explícita). En el ejemplo de [example-and-aggregation.md](example-and-aggregation.md) el valor es `not_available` y el multiplicador no se usa.

---

## 8. Ecuación del coste por interacción (Messages)

### 8.1 Qué interviene

El coste de una respuesta Messages es una **suma de productos**: en cada categoría (entrada base, escrituras de caché, lectura de caché, salida) multiplicas **cantidad de tokens** × **precio de esa categoría en USD por millón de tokens (MTok)**.

Hacen falta **dos fuentes de datos distintas**:

1. **Cantidades (tokens)** — Salen del objeto **`usage`** en la respuesta de la API una vez completado el mensaje. Ahí vienen los enteros (`input_tokens`, `cache_read_input_tokens`, etc.): cuántos tokens se contabilizan en cada categoría de facturación.

2. **Tarifas (USD por millón de tokens)** — No las devuelve la API en cada respuesta como tabla completa; las define tu proyecto en **`anthropic-model-pricing.json`**. Primero resuelves qué fila de `models[]` corresponde al campo **`model`** de la petición o respuesta (`modelId` exacto o `aliases`). De esa fila usas el objeto anidado **`costs`**: ahí están los números `costs.input.base`, `costs.input.cacheWrite5m`, `costs.output`, etc., todos en **USD/MTok**.

**Regla de cada sumando:**  
`(tokens de esa categoría) / 1_000_000 × (USD/MTok de esa categoría)`  
Es lo mismo que `tokens × USD/MTok × 1e-6`.

En el pseudocódigo de §8.3 la variable **`tarifas`** representa ese objeto **`costs`** ya resuelto para el modelo (un solo bloque de precios por petición).

### 8.2 Desglose por categoría

La entrada se factura en **cuatro sumandos** (base + tres líneas de caché); la salida en **uno**. En total son **cinco productos** (tokens × USD/MTok) que se suman.

| Parte | Campo en `usage` (cantidad) | Campo en `costs` del JSON (USD/MTok) |
|-------|-----------------------------|--------------------------------------|
| Entrada base | `input_tokens` | `costs.input.base` |
| Escritura caché 5m | `cache_creation.ephemeral_5m_input_tokens` | `costs.input.cacheWrite5m` |
| Escritura caché 1h | `cache_creation.ephemeral_1h_input_tokens` | `costs.input.cacheWrite1h` |
| Lectura caché | `cache_read_input_tokens` | `costs.input.cacheRead` |
| Salida | `output_tokens` | `costs.output` |

### 8.3 Fórmula (implementación)

`tarifas` = objeto `costs` del modelo ya elegido en `anthropic-model-pricing.json` (mismas claves que la tabla §8.2).

```
# tarifas = models[i].costs del modelo resuelto; contadores = usage de la respuesta

cost_in =
    (input_tokens / 1e6) * tarifas.input.base
  + (cache_creation.ephemeral_5m_input_tokens / 1e6) * tarifas.input.cacheWrite5m
  + (cache_creation.ephemeral_1h_input_tokens / 1e6) * tarifas.input.cacheWrite1h
  + (cache_read_input_tokens / 1e6) * tarifas.input.cacheRead

cost_out = (output_tokens / 1e6) * tarifas.output

coste_interaccion = cost_in + cost_out
```

*Puedes asignar antes variables cortas a los campos de `usage` (como en §8.2) y reutilizar la misma expresión de `cost_in`.*

### 8.4 Residencia US (opcional)

Si, según [§7.1](#71-modificador-inference_geo-opcional), aplica el multiplicador documentado para inferencia solo en EE. UU.:

```
coste_final = coste_interaccion * defaultModifiers.inferenceGeoUs
```

Si no aplica, usar factor **1** (no multiplicar). En muchos snapshots `inference_geo` es `not_available` y este paso no se usa.
