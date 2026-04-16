# 📡 Smart Code Proxy (Anthropic Observability)

[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black.svg)](https://fastify.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-SOLID-green.svg)](#🏛-diseño-del-sistema-solid)

Una implementación de alto rendimiento, modular y basada en **Fastify + TypeScript** diseñada para interceptar, auditar y analizar en tiempo real el tráfico entre clientes de IA (como Claude Code / Cursor) y la API oficial de Anthropic.

Este proyecto moderniza el flujo de observabilidad legacy, introduciendo un diseño desacoplado que garantiza **latencia cero** en la retransmisión mientras se procesan auditorías profundas en segundo plano.

---

## 🏛 Diseño del Sistema (SOLID)

El proxy utiliza un patrón de **Inversión de Control** y **Responsabilidad Única** para gestionar flujos de datos asíncronos y streams de larga duración.

### 🧩 Capas de Responsabilidad

- **[SessionService](./src/services/session.service.ts)**: Resuelve identidades de sesión mediante cabeceras dinámicas y gestiona el locking asíncrono para garantizar que el contador de peticiones en disco (`requests/`) sea secuencial y consistente.
- **[AuditWriterService](./src/services/audit-writer.service.ts)**: Encargado de la persistencia atómica. Escribe cabeceras, cuerpos binarios y metadatos JSON usando flujos de escritura no bloqueantes.
- **[RedactService](./src/services/redact.service.ts)**: Centraliza las reglas de privacidad. Sanitiza `x-api-key`, `Authorization` y campos sensibles dentro de JSON profundamente anidado antes de registrar cualquier dato.
- **[ProxyController](./src/controllers/proxy.controller.ts)**: El cerebro del sistema. Orquestra la intercepción de streams, la descompresión **Gzip** al vuelo y el parsing de **SSE** línea por línea.
- **[SseReconstructService](./src/services/sse-reconstruct.service.ts)**: Realiza el "replay" de los bytes SSE capturados a través del parser oficial del SDK para reconstruir el cuerpo JSON final de la respuesta.
- **[MarkdownRendererService](./src/services/markdown-renderer.service.ts)**: Transforma los cuerpos JSON (petición/respuesta) en documentación Markdown legible para facilitar la revisión humana.

---

## 🔄 Flujo de Datos (Arquitectura de Intercepción)

```mermaid
graph TD
    A[Cliente: Claude Code] -->|Request + Audit Session Header| B(Fastify Proxy)
    B -->|Hook: preHandler| C{SessionService}
    C -->|ID Resuelto| D[AuditWriter: Guardar Request Body]
    B -->|Transmisión| E[Upstream: API Anthropic]
    E -->|Response Stream| F{ProxyController: Interceptor}
    F -->|Clonación de Stream| G[Transmisión al Cliente]
    F -->|Clonación de Stream| H[AuditWriter: Procesamiento]
    H -->|Si SSE| I[response.sse.jsonl]
    H -->|Si SSE (End)| L[SSEReconstructService]
    L -->|Reconstrucción| M[response.body.json]
    H -->|Si Gzip| J[Gunzip -> response.body.json]
    M --> K[meta.json + Markdown]
    J --> K
```

---

## 🚀 Casos de Uso del Sistema

### 🔍 Observabilidad de Flujos SSE

A diferencia de un proxy genérico, este sistema "entiende" los flujos binarios de Anthropic.

- Extrae cada línea de datos y la convierte en una entrada con _timestamp_ en `response.sse.jsonl`.
- Permite el volcado binario crudo (`response.sse.txt`) para depuración de paridad de protocolos.

### 🛡️ Privacidad Avanzada

El diseño garantiza que nunca se filtren API Keys a los logs de servidor ni a los archivos de auditoría físicos, permitiendo compartir los volcados de sesión de forma segura entre equipos de desarrollo.

### 📦 Gestión de Sesiones Persistentes

Ideal para depurar comportamientos erráticos en herramientas de CLI (como `claude`):

- Agrupa todas las peticiones bajo una carpeta de sesión nombrada (ej. `sessions/debug-feature-x/`).
- Mantiene un archivo `meta.json` final por cada petición con estadísticas de duración, conteo de líneas SSE y bytes totales.

<a name="riesgos-seguridad"></a>

> [!WARNING]
> **Riesgos de Seguridad**: Los directorios de auditoría pueden contener API keys, tokens y contenido de conversaciones en claro si se desactiva la redacción. Restringe los permisos del directorio `sessions/` y manténlo fuera de repositorios públicos.

---

<a name="archivos-auditoria"></a>

## 📂 Referencia de Archivos de Auditoría

Cada petición genera una estructura jerárquica en `./sessions/<session-id>/requests/<seq>_<req-id>/`:

| Archivo                               | Contenido                                                         |
| ------------------------------------- | ----------------------------------------------------------------- |
| `meta.json`                           | Informe final de la transacción (performance, estatus, truncado). |
| `request.headers.json`                | Cabeceras enviadas (sanitizadas).                                 |
| `request.body.bin`                    | Cuerpo crudo de la petición.                                      |
| `request.body.formatted.json`         | JSON indentado del cuerpo de la petición (si aplica).             |
| `request.body.parsed.md`              | Vista Markdown legible del JSON de petición.                      |
| `request.body.omitted.txt`            | (Borde) Razón si la petición fue truncada por tamaño.             |
| `response.headers.json`               | Cabeceras de respuesta (específico para flujos SSE).              |
| `response.body.json` o `.bin`         | Cuerpo crudo de la respuesta final.                               |
| `response.body.formatted.json`        | JSON indentado de la respuesta final.                             |
| `response.body.parsed.md`             | Vista Markdown legible del JSON de respuesta.                     |
| `response.body.omitted.txt`           | (Borde) Razón de escape si cayó la red o superamos el límite.     |
| `response.body.reconstruct-error.txt` | (Borde) Mensaje de error si la reconstrucción SSE falla.          |
| `response.sse.jsonl`                  | Cada evento del stream capturado secuencialmente.                 |
| `response.sse.txt`                    | Volcado binario crudo del stream (si `AUDIT_SSE_RAW=1`).          |

---

<a name="configuracion"></a>

## ⚙️ Configuración (Matriz de Entorno)

Personaliza el comportamiento ajustando estas variables en tu entorno o en un archivo `configs/.env`:

|   Categoría   | Variable                              | Descripción                                                   | Default                      |
| :-----------: | ------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
|   **Core**    | `PORT`                                | Puerto de escucha del proxy.                                  | `8787`                       |
| **Upstream**  | `UPSTREAM_ORIGIN`                     | URL objetivo de Anthropic.                                    | `https://api.anthropic.com`  |
|               | `UPSTREAM_ACCEPT_ENCODING`            | Control de compresión (`identity`, `gzip`, `pass`, `remove`). | `identity`                   |
| **Auditoría** | `AUDIT_ENABLED`                       | Activa/Desactiva el volcado de datos a disco.                 | `1` (Activo)                 |
|               | `AUDIT_SESSIONS_DIR`                  | Carpeta raíz para las capturas.                               | `sessions`                   |
|               | `AUDIT_SSE_RAW`                       | Activa el volcado binario `.sse.txt`.                         | `0` (Desactivo)              |
|               | `AUDIT_SESSION_HASH_SUFFIX`           | Añade hash al ID de sesión.                                   | `0` (Desactivo)              |
|  **Headers**  | `AUDIT_SESSION_OVERRIDE_HEADER`       | Cabecera primaria de sesión.                                  | `x-cc-audit-session`         |
|               | `AUDIT_SESSION_FALLBACK_HEADER`       | Cabecera secundaria.                                          | `x-claude-code-session-id`   |
|               | `STRIP_AUDIT_SESSION_HEADER`          | Elimina cabeceras de sesión hacia upstream.                   | `1` (Activo)                 |
|               | `DEFAULT_AUDIT_SESSION`               | Sesión si no hay cabeceras.                                   | _(vacío)_                    |
|  **Límites**  | `MAX_REQUEST_BODY`                    | Límite del cuerpo de petición (memoria en proxy).             | `50mb`                       |
|               | `MAX_RESPONSE_BUFFER_BYTES`           | Tope de buffer en memoria para respuestas no-SSE.             | `104857600`                  |
|               | `MAX_AUDIT_RESPONSE_BODY_BYTES`       | Tope de archivo físico para el cuerpo de respuesta.           | `52428800`                   |
|               | `MAX_AUDIT_REQUEST_BODY_BYTES`        | Tope de archivo físico para el cuerpo de petición.            | `52428800`                   |
|               | `MAX_AUDIT_SSE_RAW_BYTES`             | Tope físico para SSE crudo (`0` equivale a ilimitado).        | `52428800`                   |
| **SSE Rsp.**  | `AUDIT_SSE_RESPONSE_BODY`             | Reconstruye un JSON completo al finalizar el stream SSE.      | `0` (Desactivo)              |
|               | `AUDIT_SSE_RESPONSE_BODY_REQUIRE_RAW` | Solo reconstruye si `AUDIT_SSE_RAW` está activo y persiste.   | `1` (Activo)                 |
|               | `AUDIT_SSE_RESPONSE_BODY_FORCE_BETA`  | Fuerza modo Beta en SDK internamente al reconstruir.          | `0` (Desactivo)              |
|               | `AUDIT_SSE_REPLAY_MODEL`              | Modelo de emulación si no se detecta (Anthropic SDK).         | `claude-3-5-sonnet-20241022` |
|  **Compat.**  | `CONSOLE_REDACT`                      | Deshabilita prints con información en claro a la terminal.    | `1` (Activo)                 |
|               | `LOG_SSE`                             | Imprime por terminal cada línea de Event-Stream en vivo.      | `0` (Desactivo)              |
|               | `MAX_BODY_LOG_BYTES`                  | Límite restrictivo para visualizar cuerpos crudos por log.    | `2048`                       |

<a name="correlación-de-sesión-sessionid"></a>

### Correlación de Sesión (SessionId)

El directorio de auditoría se nombra utilizando las cabeceras definidas en `AUDIT_SESSION_OVERRIDE_HEADER` o `AUDIT_SESSION_FALLBACK_HEADER`. Si ninguna está presente en la solicitud, se usa el valor de `DEFAULT_AUDIT_SESSION`.

<a name="capas-bytes-env"></a>

### Capas de Bytes y Convenciones de Logs

El sistema previene la saturación en memoria o disco ignorando la escritura si se superan los límites configurados. Todo volcado que se trunca genera un archivo `.omitted.txt` documentando la omisión. El proxy utiliza Fastify Logger para la salida de consola, delegando el registro de los eventos directamente al framework.

> [!TIP]
> **Certificados SSL corporativos:** si tu organización intercepta tráfico HTTPS, configura la variable de entorno estándar de Node.js [`NODE_EXTRA_CA_CERTS`](https://nodejs.org/api/cli.html#node_extra_ca_certsfile) con la ruta a un archivo PEM que contenga los certificados raíz adicionales. Esta variable es gestionada directamente por Node.js, no por el proxy.

---

## 🛠 UX de Desarrollo (Workflow)

### Instrucciones de Inicio Rápido

1.  **Instalar dependencias**: `npm install`
2.  **Modo Desarrollo**: `npm run dev` (Carga `configs/.env` mediante flag nativo de Node v22.9+; **v24 LTS recomendado**).
3.  **Compilación**: `npm run build` (Genera `/dist` optimizado).
4.  **Limpieza**: `npm run clean` (Purga `dist/` y `node_modules/`). Para eliminar datos de auditoría acumulados: `npm run clean:sessions`.

## 🐳 Docker y Contenerización

Los artefactos para la contenerización del proyecto se han centralizado en el directorio `containerization/`.

- `containerization/Dockerfile`: imagen multi-etapa optimizada para producción.
- `containerization/Dockerfile.dockerignore`: entradas ignoradas para construir la imagen sin archivos de desarrollo ni artefactos (convención [BuildKit](https://docs.docker.com/build/buildkit/): Docker asocia automáticamente este archivo al `Dockerfile` del mismo directorio).

Instrucciones básicas:

1.  Construir la imagen (desde la raíz del repositorio):

    - `docker build -f containerization/Dockerfile -t smart-code-proxy:latest .`

2.  Ejecutar el contenedor (crea y monta `sessions/` como volumen):

    - `docker run -it --rm -p 8787:8787 -v "$(pwd)/sessions:/app/sessions" --env-file configs/.env smart-code-proxy:latest`

3.  Notas importantes:

    - El `Dockerfile` usa una etapa `builder` para compilar TypeScript y una etapa final mínima basada en `node:20-alpine`.
    - Asegúrate de no incluir `sessions/`, `dist/` ni `node_modules/` en la imagen: estos están listados en `containerization/Dockerfile.dockerignore`. Docker BuildKit (motor por defecto desde Docker 23.0+) reconoce automáticamente este archivo al construir con `-f containerization/Dockerfile`.
    - Para desarrollo iterativo es recomendable usar `npm run dev` localmente en lugar de reconstruir la imagen cada cambio.

Para más detalles y comandos alternativos, consulta `docs/dockerization.md`.

### Interpretación de Auditoría

Tras cada petición, se genera una estructura en `./sessions/<session-id>/requests/<seq>_<uuid>/` con los archivos documentados en la [§ Referencia de Archivos de Auditoría](#archivos-auditoria).

---

> [!NOTE]
> Este proyecto utiliza **Inyección de Dependencias** para facilitar las pruebas unitarias de los servicios sin necesidad de levantar el servidor completo.

## 📚 Guías de Estimación de Costos

El proxy intercepta métricas de uso de tokens que pueden ser cuantificadas. Consulta estas guías adicionales para configurar precios y estimar costos según el tráfico auditado:

- [Coste por interacción: Claude Code y la API de Anthropic](./docs/how-to-calculate-anthropic-api-costs.md)
- [Coste por generación: OpenRouter y la API Chat Completions](./docs/how-to-calculate-openrouter-api-costs.md)
