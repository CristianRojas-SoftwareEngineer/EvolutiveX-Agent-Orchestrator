# Observabilidad HTTP

## Propósito

Plugin de logging HTTP estructurado que emite logs en los hooks `onRequest` y `preValidation`/`onResponse` de Fastify para todas las rutas del proxy (`/health`, `/hooks`, `/proxy/*`). Cada request genera dos entradas de log — una entrante y otra saliente — con `reqId` para correlación, headers opcionales y body parseado.

## Variables de entorno

| Variable           | Default | Descripción                                             |
| ------------------ | ------- | ------------------------------------------------------- |
| `LOG_HTTP_BODIES`  | `false` | Activar logging del body de request como texto/Preview. |
| `LOG_HTTP_HEADERS` | `true`  | Activar logging de headers request y response.          |

> ⚠️ **Advertencia:** No usar en producción con usuarios activos hasta que se implemente redacción de campos sensibles. Este plugin es solo para debugging en entornos de desarrollo.

## Forma de los logs

### Con `LOG_HTTP_BODIES=true`

```json
{
  "reqId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "POST",
  "url": "/hooks",
  "headers": {
    "content-type": "application/json",
    "user-agent": "curl/8.1.2"
  },
  "body": "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"sess-abc\"}",
  "bodyLength": 68,
  "level": 30,
  "msg": "→ incoming request"
}
```

Para content-types de texto (JSON, text/\*, form-urlencoded) el body se loguea como string UTF-8 completo. Para binarios se loguea `bodyLength` + `bodyPreview` (primeros 256 bytes).

### Sin body (solo headers + response)

```json
{
  "reqId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "POST",
  "url": "/hooks",
  "headers": {
    "content-type": "application/json"
  },
  "level": 30,
  "msg": "→ incoming request"
}
```

```json
{
  "reqId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "POST",
  "url": "/hooks",
  "statusCode": 202,
  "responseTime": 4.23,
  "headers": {
    "content-type": "application/json"
  },
  "level": 30,
  "msg": "← response sent"
}
```

## Limitaciones conocidas

1. **Response body no se loguea.** El plugin solo captura request body y response metadata (statusCode, responseTime). El cuerpo de la respuesta del upstream no está incluido — es deuda técnica para una próxima iteración.
2. **Sin redacción de campos sensibles.** Headers y bodies se vuelcan sin sanitizar. No usar con datos sensibles (credenciales, tokens, información personal) en entornos compartidos.
3. **Volumen alto con `LOG_HTTP_BODIES=true`.** Cada request genera múltiples entradas de log. En sesiones activas con muchos requests, el archivo `server/logs.jsonl` crece rápidamente.

## Cómo activarlo temporalmente

```bash
# Logging completo (headers + bodies JSON) durante una sesión de debugging
LOG_HTTP_BODIES=true LOG_HTTP_HEADERS=true npm run dev

# Solo bodies sin headers (menos ruido)
LOG_HTTP_BODIES=true LOG_HTTP_HEADERS=false npm run dev
```

### Inspeccionar logs en tiempo real

```bash
# Ver solo las líneas de HTTP logging
tail -f server/logs.jsonl | jq 'select(.msg | startswith("→") or startswith("←"))'

# Ver bodies de requests entrantes
tail -f server/logs.jsonl | jq 'select(.msg == "→ incoming request body") | {reqId, body}'

# Ver solo requests a /hooks con body
tail -f server/logs.jsonl | jq 'select(.url == "/hooks" and .msg == "→ incoming request body")'
```

### Desactivar sin restart

El plugin no soporta cambios en caliente. Para desactivarlo, hay que reiniciar el proceso con las variables en `false`/`0`:

```bash
# Desactivar completamente
LOG_HTTP_BODIES=false LOG_HTTP_HEADERS=false npm run dev
```
