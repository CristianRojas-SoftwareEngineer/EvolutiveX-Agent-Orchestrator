# Ejemplo numérico, `usage` en disco y agregación

Índice: [§9 Ejemplo](#9-ejemplo-con-datos-de-auditoría) · [§10 Resumen ubicación](#10-dónde-mirar-en-las-sesiones-auditadas-resumen) · [§11 Agregación](#11-coste-agregado-de-una-sesión-o-de-un-intervalo) · [§12 Seguridad](#12-seguridad)

---

## 9. Ejemplo con datos de auditoría

**Petición de referencia (repositorio proxy):** `sessions/claude-code-workflow-example/interactions/000006_5e0986b8-ff70-4afc-9534-701bb9c68597/response/body.formatted.json` (modelo `claude-haiku-4-5-20251001`).

**`usage` (solo contadores agregados):**

| Campo | Valor |
|-------|------:|
| `input_tokens` | 4480 |
| `cache_creation.ephemeral_5m_input_tokens` | 11011 |
| `cache_creation.ephemeral_1h_input_tokens` | 0 |
| `cache_read_input_tokens` | 26793 |
| `output_tokens` | 693 |
| `inference_geo` | `not_available` |

En este snapshot, `cache_creation_input_tokens` es **11011**, igual a `ephemeral_5m_input_tokens + ephemeral_1h_input_tokens` (11011 + 0), coherente con [usage-and-billing-buckets.md](usage-and-billing-buckets.md) (§4).

**Precios:** tomados de `config/anthropic-model-pricing.json` del repositorio para ese `modelId` (snapshot alineado con la tabla oficial de Claude Haiku 4.5 en la documentación). Los números concretos dependen del JSON vigente.

| Categoría | Tokens | USD / MTok | Parcial (USD) |
|-----------|-------:|-----------:|--------------:|
| Entrada base | 4480 | 1.00 | 0.004480 |
| Escritura caché 5m | 11011 | 1.25 | 0.01376375 |
| Escritura caché 1h | 0 | 2.00 | 0.000000 |
| Lectura caché | 26793 | 0.10 | 0.0026793 |
| Salida | 693 | 5.00 | 0.003465 |
| **Suma** | — | — | **0.02438805** USD (suma exacta de los parciales de la tabla) |

No se aplica `inferenceGeoUs` porque `inference_geo` es `not_available` en este ejemplo.

**Interpretación del total:** el coste **no** es «(suma de todos los contadores de tokens) × un único precio». Cada categoría tiene su propio USD/MTok; el importe es la **suma de los parciales** de la tabla (equivalente a la ecuación en [equation-loading-and-geo.md](equation-loading-and-geo.md), §8).

---

## 10. Dónde mirar en las sesiones auditadas (resumen)

Para la **jerarquía completa** de directorios, nombres de archivos y matriz de presencia (incl. `meta.json`, truncamiento, SSE crudo), usar la skill **smart-code-proxy** y su `reference.md`.

Aquí solo lo imprescindible para **`usage`** y **`model`**:

| `meta.json` (`sse`) | Archivos donde suele aparecer el mensaje / `usage` |
|---------------------|---------------------------------------------------|
| `false` | `response.body.json`, `response.body.formatted.json`, opcionalmente `response.body.parsed.md`. |
| `true` | Siempre `response.sse.jsonl` (stream de eventos). Si la reconstrucción del cuerpo SSE está activa y tuvo éxito: `response.body.formatted.json` (o equivalente) con el mensaje final; revisar `sseResponseBodyWritten` / `sseResponseBodyError` en `meta.json`. Si falló la reconstrucción: `response.body.reconstruct-error.txt`. Con `AUDIT_SSE_RAW=1` puede existir `response.sse.txt`. |

Si **no** hay JSON reconstruido pero sí `response.sse.jsonl`, el objeto `usage` sigue apareciendo en el flujo SSE (p. ej. en el último evento del mensaje o en metadatos de uso al finalizar el stream): parsea las líneas JSON del archivo hasta localizar el bloque `usage` asociado al mensaje completado.

El campo `model` para la resolución de precios suele coincidir en petición y respuesta; si solo tienes cuerpo de petición (`request.body.formatted.json`) por un fallo de auditoría, puedes leer `model` de ahí como respaldo.

---

## 11. Coste agregado de una sesión o de un intervalo

Para estimar el coste **total** de una sesión de Claude Code a partir de auditoría en disco:

1. Recorre cada carpeta `interactions/NNNNNN_*/` en orden de secuencia (p. ej. orden numérico del prefijo). Nota: cada interacción puede agrupar múltiples steps; los `usage` individuales están en `steps/{N}/response/sse.jsonl`.
2. Clasifica por **ruta sin query** (quita `?beta=true` u otros parámetros antes de comparar). **Orden importa:** el endpoint de conteo contiene el segmento `count_tokens`. Si solo buscas si la URL contiene `/v1/messages`, **ambas** rutas coincidirían (porque `.../messages/count_tokens` también incluye `messages`). Regla segura: si el path contiene `count_tokens` → petición de **conteo**; si no, y el path corresponde a `POST /v1/messages` (sin `count_tokens`) → **generación**. Omite `count_tokens` para el coste de generación (coste **0** con la política actual de conteo gratuito).
3. Para cada step de generación con respuesta válida y `usage` disponible, aplica la ecuación ([equation-loading-and-geo.md](equation-loading-and-geo.md), §8). El `model` suele estar en el cuerpo de respuesta reconstruido o en el último evento SSE del step. Alternativamente, `meta.json → totals` agrega los tokens de todos los steps para `agentic-turn` SSE.
4. **Suma** los costes por step. Si `turnOutcome: "upstream-error"` en `meta.json`, o si no hay archivos de respuesta utilizables en el step, no hay `usage` fiable para esa llamada.

---

## 12. Seguridad

Los directorios `sessions/` pueden contener **claves API** en cabeceras y **contenido sensible** en cuerpos. No compartas esos archivos públicamente; los ejemplos numéricos de `usage` son los únicos datos seguros para citar sin contexto adicional.
