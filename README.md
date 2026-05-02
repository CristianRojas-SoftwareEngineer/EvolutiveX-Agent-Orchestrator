# 📡 Smart Code Proxy (Anthropic Observability)

[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black.svg)](https://fastify.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-PKA-green.svg)](#-diseño-del-sistema-pka---progressive-kernel-architecture)

Una implementación de alto rendimiento, modular y basada en **Fastify + TypeScript** diseñada específicamente para interceptar, auditar y analizar en tiempo real el tráfico entre **Claude Code** (el CLI oficial de Anthropic) y la API oficial de Anthropic. Claude Code permite redirigir sus peticiones al proxy vía la variable `ANTHROPIC_BASE_URL`, condición imprescindible para el funcionamiento del sistema; otros clientes (p. ej. Cursor) usan harnesses distintos y no están dentro del alcance de este proyecto.

Diseño desacoplado que garantiza **latencia cero** en la retransmisión mientras procesa auditorías enfocadas en la **observabilidad inteligente para análisis humana** — no busca registrar todo lo técnicamente posible, sino presentar los flujos lógicos que el usuario orquesta (secuenciales y/o paralelos con subagentes) de forma natural y trazable.

---

## 🏛 Diseño del Sistema (PKA - Progressive Kernel Architecture)

El proxy utiliza **Progressive Kernel Architecture (PKA)** — un modelo arquitectónico concéntrico de 6 capas que sintetiza los mejores patrones de **Clean Architecture**, **Hexagonal Architecture**, **Onion Architecture**, **DDD** y **CQRS**. Las dependencias del código fuente **solo apuntan hacia el centro** (Dominio). La Capa 6 (GUIs) no aplica a este proyecto.

### 🧩 Capas de Responsabilidad

| Capa                           | Ubicación                | Responsabilidad                                                                   | Componentes Clave                                                                                                                                                   |
| ------------------------------ | ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 - Dominio**                | `src/1-domain/`          | Tipos puros (entidades) y lógica de dominio sin dependencias externas             | `SessionResolverService`, `TurnClassifierService`, `RedactService`, `MarkdownRendererService`, `SseSimulatorService`, Tipos de auditoría                            |
| **2 - Servicios (Adapters)**   | `src/2-services/`        | Implementaciones concretas con I/O (filesystem, streams) y **ports** (interfaces) | `SessionStoreService`, `AuditWriterService`, `SseReconstructService`, `StreamTeeService`, Ports: `IAuditWriter`, `ISessionStore`, `ISseReconstructor`, `IStreamTee` |
| **3 - Operaciones (Handlers)** | `src/3-operations/`      | Orquestación de casos de uso (Command Handlers)                                   | `AuditInteractionHandler`, `AuditSseResponseHandler`, `AuditStandardResponseHandler`, `AuditUpstreamErrorHandler`, `FilterToolsHandler`                             |
| **4 - API (Composition Root)** | `src/4-api/`             | Wiring de dependencias y configuración                                            | `createProxyDependencies()`, Configuración de entorno                                                                                                               |
| **5 - Interfaces de Usuario**  | `src/5-user-interfaces/` | Adaptadores HTTP (reciben deps inyectadas via options)                            | `ProxyController`, `InternalController`, `proxyRoutes`, `registerInternalRoutes`, `fastify.augments.d.ts`                                                           |

### 📐 Regla de Dependencia

```
Capa 5 → Capa 4 → Capa 3 → Capa 2 → Capa 1
(UI)     (API)     (Ops)    (Svcs)   (Domain)
```

Las capas internas **nunca** importan de capas externas. Esta regla garantiza que:

- El dominio (Capa 1) es puro y testeable sin mocks
- Los servicios (Capa 2) pueden ser reemplazados sin afectar la lógica de negocio
- La UI (Capa 5) es un detalle de implementación desechable

---

## 🔄 Flujo de Datos (Arquitectura de Intercepción)

```mermaid
graph TD
    A[Cliente: Claude Code] -->|Request + Audit Session Header| B(Fastify Proxy)
    B -->|Hook: preHandler| C{SessionService + TurnClassifier}
    C -->|Turno clasificado| D[AuditInteractionHandler\nfresh / continuation / preflight / side-request]
    D -->|Guardar Request Body| E[AuditWriter]
    B -->|Transmisión| F[Upstream: API Anthropic]
    F -->|Response Stream| G{ProxyController: Interceptor}
    G -->|Clonación de Stream| H[Transmisión al Cliente]
    G -->|Clonación de Stream| I[Handler de Auditoría]
    I -->|Si SSE| J[steps/NNN/response/sse.jsonl]
    I -->|Si SSE, detecta stop_reason| K[SSEReconstructService\nagrupa steps, reconstruye]
    K -->|Reconstrucción| L[response/body.json]
    I -->|Si no-SSE, heurística terminal| M[steps/NNN/response/body.json]
    L --> N[meta.json TurnMetadata + Markdown]
    M --> N
```

---

## 🚀 Casos de Uso del Sistema

### 🔍 Observabilidad de Flujos SSE

A diferencia de un proxy genérico, este sistema "entiende" los flujos binarios de Anthropic.

- Extrae cada línea de datos y la convierte en una entrada con _timestamp_ en `response/sse.jsonl` (escrito **síncronamente**: fuente de verdad ordenada para la reconstrucción).
- Mantiene un volcado binario crudo (`response/sse.txt`) para depuración de paridad de protocolos. **No** es la fuente de la reconstrucción y puede truncarse por `MAX_AUDIT_SSE_RAW_BYTES` sin afectar al mensaje final reconstruido.

### 🛡️ Privacidad Avanzada

El diseño garantiza que nunca se filtren API Keys a los logs de servidor ni a los archivos de auditoría físicos, permitiendo compartir los volcados de sesión de forma segura entre equipos de desarrollo.

### 📦 Gestión de Sesiones Persistentes

Ideal para depurar comportamientos erráticos en herramientas de CLI (como `claude`):

- Agrupa las peticiones de un turno completo (prompt → respuesta final) bajo una interacción con subdirectorios `steps/`.
- Tres tipos de interacción: `agentic-turn` (turno del usuario con prompt y respuesta), `client-preflight` (quota check + cache warm-up) y `side-request` (peticiones con `"tools": []`, ej. count_tokens, generación de títulos).
- Los `side-request` se auditan en su propia interacción sin desplazar al turno activo principal, evitando corrupción de metadata por race conditions.
- Los `side-request` de Context Sync WebFetch (`context-sync-webfetch`) implementan **caché inteligente para observabilidad transparente**:
  - **HIT**: Se detecta por heurística, se responde localmente con SSE simulada reutilizando el resumen del subagente, **sin llamar a Anthropic** y **sin crear interacción en disco** (completamente transparente para el observador humano).
  - **MISS**: El step resuelto no aparece dentro de `CONTEXT_SYNC_MAX_WAIT_MS`. Se degrada a side-request normal de primer nivel con `contextSyncFallback: true` en `meta.json`. Esto es un indicador de **potencial inconsistencia** si el subagente ya había completado (el caché debería haber resuelto el HIT). Ver diagnóstico en [`docs/issues/context-sync-cache.md`](docs/issues/context-sync-cache.md).
- **Principio de observabilidad**: Las ejecuciones internas de built-in tools (WebFetch/WebSearch) por subagentes sí se registran como sub-interacciones (aportan valor al entender qué información consumió cada subagente). Las reinyecciones de Context Sync deben ser transparentes (HIT sin registro) para no duplicar la información ni crear ambigüedad.
- Los turnos se indexan por `interactionDir` (único por request) permitiendo múltiples turnos concurrentes en la misma sesión (parallel subagents).
- Las continuaciones (`tool_result`) se rutean al turno padre mediante correlación por `tool_use_id`, eliminando la misatribución de steps.
- Los preflights (`client-preflight`) se cierran inmediatamente al recibir su respuesta, evitando turnos zombie que bloquean la sesión.
- Cada step en `meta.json` puede incluir `toolUseIds: string[]` — los IDs de tool_use emitidos en ese step, usados para correlacionar con futuras continuaciones.
- `meta.json` resume el turno completo: steps individuales, tokens agregados en `totals`, duración y `turnOutcome`.

<a name="riesgos-seguridad"></a>

> [!WARNING]
> **Riesgos de Seguridad**: Los directorios de auditoría pueden contener API keys, tokens y contenido de conversaciones en claro si se desactiva la redacción. Restringe los permisos del directorio `sessions/` y manténlo fuera de repositorios públicos.

---

<a name="archivos-auditoria"></a>

## 📂 Referencia de Archivos de Auditoría

Cada turno genera una estructura jerárquica en `./sessions/<session-id>/interactions/<seq>_<uuid>/`:

```
interactions/NNNNNN_<uuid>/
  meta.json                     # TurnMetadata: resumen del turno (interactionType, turnOutcome, steps[], totals)
  state.json                    # Marcador "in-progress" (solo existe mientras la interacción está abierta)
  request/                      # Solo agentic-turn y side-request: petición inicial top-level
    headers.json
    body.bin
    body.json
    body.parsed.md
  response/                     # Solo agentic-turn/side-request SSE completados: respuesta final reconstruida
    body.json
    body.parsed.md
    headers.json
  steps/
    001/                        # Cada step es una llamada HTTP individual; siempre contiene request/ para todos los tipos
      request/                  # Petición del step (auto-contenida; desde step 001 en adelante)
        headers.json, body.bin, body.json, body.parsed.md
      response/                 # SSE: sse.jsonl (fuente de verdad) + archivos reconstruidos; No-SSE: body.json
        sse.jsonl, sse.txt, headers.json                    (SSE crudo)
        body.json, body.parsed.md                           (SSE reconstruido ✅)
    002/ ...
```

> **Nota:** Los preflights (`client-preflight`) no escriben `request/` en el nivel raíz de la interacción; sólo tienen `steps/` con sus archivos individuales. Todos los tipos de interacción (`agentic-turn`, `side-request`, `client-preflight`) escriben `steps/001/request/` para mantener simetría estructural.

> **Subagentes (`Task` / herramienta `Agent`):** Cuando el turno principal emite un `tool_use` con `name: "Agent"`, la siguiente petición fresh de la misma sesión NO se trata como nuevo turno raíz: se anida bajo el step que la disparó como `steps/<NNN>/sub-interactions/<MMM>_<uuid>/` con la misma estructura interna (`request/`, `response/`, `steps/`, `meta.json`, `state.json`). El `meta.json` del subagente incluye un bloque `parentContext: { parentInteractionDir, parentStepIndex, triggeringToolUseId, subagentType }` para reconstruir el árbol padre→hijo. La profundidad está acotada a 2 niveles (un subagente no puede ser padre de otros subagentes).

> **state.json:** Archivo marcador escrito al iniciar la interacción con `{ state: "in-progress", startedAt, interactionType, parentContext? }`. Se elimina al cerrar el turno (cuando se escribe `meta.json`). Su presencia indica una interacción huérfana por crash del proceso.

### Tipos de Interacción

| `interactionType`  | Origen                                                                 | Cierre                                            |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `agentic-turn`     | Prompt del usuario con `tools` no vacíos (fresh) + continuations       | `stop_reason` terminal (`end_turn`, `max_tokens`) |
| `client-preflight` | Quota check (`max_tokens:1`) o cache warm-up sin turno activo          | Al recibir la respuesta (inmediato)               |
| `side-request`     | Peticiones con `tools: []` (ej. `count_tokens`, generación de títulos) | Respuesta terminal; no desplaza al turno activo   |

### Resultados de Turno (`turnOutcome`)

El campo `turnOutcome` en `meta.json` indica el resultado final del turno:

| `turnOutcome`    | Significado                                                             | `statusCode` típico |
| ---------------- | ----------------------------------------------------------------------- | ------------------- |
| `completed`      | Turno completado exitosamente                                           | 2xx                 |
| `client-error`   | Error del cliente (request mal formada, autenticación fallida, etc.)    | 4xx                 |
| `upstream-error` | Error del servidor upstream (fallo de conexión, timeout, error SSE)     | 5xx o `null`        |
| `truncated`      | Respuesta truncada por `max_tokens`                                     | 2xx                 |
| `orphaned`       | Turno cerrado por cleanup (continuation nunca llegó, graceful shutdown) | `null`              |

> **Campos forenses en `meta.json`:** Cuando un turno se cierra con `upstream-error` o `orphaned` habiendo emitido `tool_use` de tipo `Agent` que no se correlacionaron con subagentes, el campo `lostPendingAgents?: PendingAgentToolUse[]` registra los IDs de esos tool_uses pendientes para facilitar correlación offline.

### Correlación con Logs de Claude Code

Cada step en `meta.json` incluye `anthropicMessageId` — el `message.id` de la API de Anthropic — permitiendo correlacionar directamente con los logs oficiales de Claude Code:

```json
{
  "steps": [
    {
      "stepIndex": 1,
      "anthropicMessageId": "msg_01SweCL7ReWWANWSRsPc8mfn",
      "stopReason": "tool_use"
    }
  ]
}
```

| Sistema                       | Ubicación del ID             | Valor de ejemplo               |
| ----------------------------- | ---------------------------- | ------------------------------ |
| Log Claude Code (`.jsonl`)    | `message.id`                 | `msg_01SweCL7ReWWANWSRsPc8mfn` |
| Auditoría Proxy (`meta.json`) | `steps[].anthropicMessageId` | `msg_01SweCL7ReWWANWSRsPc8mfn` |

**Proceso de correlación:**

1. Extrae `"id"` del evento `assistant` en el log de Claude Code
2. Busca ese valor en `sessions/<session>/interactions/*/meta.json` bajo `steps[].anthropicMessageId`
3. El directorio contenedor es la interacción correspondiente

### Filtrado de Health Checks

El proxy detecta y **ignora silenciosamente** los health checks de conectividad que Claude Code (runtime Bun) envía antes de iniciar una sesión real. Un request se considera health check (y no se audita) si cumple **TODAS** estas condiciones:

- `User-Agent` contiene "Bun" pero NO "claude-cli"
- Body de la petición está vacío (`Content-Length: 0`)
- Sin header `authorization`
- Sin headers de sesión (`x-claude-code-session-id`, `x-cc-audit-session`)
- Sesión resuelta a `_unknown` (fallback final)

Esto evita la creación de directorios `_unknown/` con interacciones vacías que no aportan valor a la observabilidad.

---

<a name="configuracion"></a>

## ⚙️ Configuración (Matriz de Entorno)

Personaliza el comportamiento ajustando estas variables en tu entorno o en un archivo `configs/.env`:

|    Categoría     | Variable                        | Descripción                                                                                                                        | Default                                                                                 |
| :--------------: | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
|     **Core**     | `PORT`                          | Puerto de escucha del proxy.                                                                                                       | `8787`                                                                                  |
|   **Upstream**   | `UPSTREAM_ORIGIN`               | URL objetivo de Anthropic.                                                                                                         | `https://api.anthropic.com`                                                             |
|                  | `UPSTREAM_ACCEPT_ENCODING`      | Control de compresión (`identity`, `gzip`, `pass`, `remove`).                                                                      | `identity`                                                                              |
|   **Headers**    | `AUDIT_SESSION_OVERRIDE_HEADER` | Cabecera primaria de sesión.                                                                                                       | `x-cc-audit-session`                                                                    |
|                  | `AUDIT_SESSION_FALLBACK_HEADER` | Cabecera secundaria.                                                                                                               | `x-claude-code-session-id`                                                              |
|                  | `STRIP_AUDIT_SESSION_HEADER`    | Elimina cabeceras de sesión hacia upstream.                                                                                        | `1` (Activo)                                                                            |
|                  | `DEFAULT_AUDIT_SESSION`         | Sesión si no hay cabeceras.                                                                                                        | _(vacío)_                                                                               |
|                  | `AUDIT_SESSION_HASH_SUFFIX`     | Añade hash al ID de sesión.                                                                                                        | `0` (Desactivo)                                                                         |
|   **Límites**    | `MAX_REQUEST_BODY`              | Límite del cuerpo de petición (memoria en proxy).                                                                                  | `50mb`                                                                                  |
|                  | `MAX_RESPONSE_BUFFER_BYTES`     | Tope de buffer en memoria para respuestas no-SSE.                                                                                  | `104857600`                                                                             |
|                  | `MAX_AUDIT_REQUEST_BODY_BYTES`  | Tope de archivo físico para el cuerpo de petición.                                                                                 | `52428800`                                                                              |
|                  | `MAX_AUDIT_RESPONSE_BODY_BYTES` | Tope de archivo físico para el cuerpo de respuesta.                                                                                | `52428800`                                                                              |
|                  | `MAX_AUDIT_SSE_RAW_BYTES`       | Tope físico para `response/sse.txt` (raw dump debug; `0` = ilimitado). **No afecta** a la reconstrucción (que lee `sse.jsonl`).    | `52428800`                                                                              |
|   **Compat.**    | `CONSOLE_REDACT`                | Deshabilita prints con información en claro a la terminal.                                                                         | `1` (Activo)                                                                            |
|                  | `LOG_SSE`                       | Imprime por terminal cada línea de Event-Stream en vivo.                                                                           | `0` (Desactivo)                                                                         |
|   **Logging**    | `LOG_LEVEL`                     | Nivel de severidad del logger Pino (`trace`–`fatal`).                                                                              | `info`                                                                                  |
|                  |                                 | Logs dual-transport: terminal formateada + `server/logs.jsonl` (JSON crudo).                                                          | —                                                                                       |
|                  | `MAX_BODY_LOG_BYTES`            | Límite restrictivo para visualizar cuerpos crudos por log.                                                                         | `2048`                                                                                  |
|   **Thinking**   | `PROXY_UNREDACT_THINKING`       | Remueve el flag `redact-thinking-2026-02-12` del header `anthropic-beta` para capturar contenido thinking legible.                 | `false` (desactivado)                                                                   |
| **Context Sync** | `CONTEXT_SYNC_CACHE_ENABLED`    | Habilita caché inteligente para side-request `context-sync-webfetch`. Si está en `0/false`, siempre hace forward+auditoría normal. | `true`                                                                                  |
|                  | `CONTEXT_SYNC_MAX_WAIT_MS`      | Tiempo máximo (ms) para esperar el step de WebFetch ya resumido antes de fallback.                                                 | `5000`                                                                                  |
|   **Filtrado**   | `FILTERED_TOOLS`                | Lista de tool names a excluir del request (coma-separado). Reduce tokens y ruido en auditoría.                                     | `ScheduleWakeup,NotebookEdit,ExitWorktree,EnterWorktree,CronList,CronDelete,CronCreate` |

> **Auditoría por defecto (con excepción explícita).** El proxy escribe en `./sessions` para `agentic-turn`, `client-preflight` y `side-request` normales. Excepción: side-request Context Sync de WebFetch con caché HIT (`context-sync-webfetch`) se responden localmente sin crear interacción en disco. En side-request SSE auditados: (a) `steps/NNN/response/sse.jsonl` es la **fuente de verdad** (escritura síncrona, orden determinista); (b) `steps/NNN/response/sse.txt` es raw dump de depuración acotado por `MAX_AUDIT_SSE_RAW_BYTES`; (c) `response/body.json` top-level se reconstruye desde `sse.jsonl`. Detalle en [`docs/how-sse-reconstruction-works.md`](docs/how-sse-reconstruction-works.md).

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
2.  **Configurar proveedor** (opcional): `npm run configure:provider` (asistente interactivo para configurar API keys y modelos de diferentes proveedores).
3.  **Referencia multi-agente** (opcional): `npm run create:agents-reference` (Crea hardlink `AGENTS.md` → `CLAUDE.md` para compatibilidad con otros agentes de código).
4.  **Modo Desarrollo**: `npm run dev` (Carga `configs/.env` mediante flag nativo de Node v22.9+; **v24 LTS recomendado**).
5.  **Compilación**: `npm run build` (Genera `/dist` optimizado).
6.  **Referencia de scripts**: `npm run help` (muestra todos los scripts disponibles con descripciones).
7.  **Limpieza**: `npm run clean` (Purga `dist/` y `node_modules/`). Para purga completa incluyendo auditoría y logs: `npm run clean:all`. Para limpieza selectiva: `npm run clean:sessions` o `npm run clean:logs`.

> Para una guía detallada de onboarding, consultar [docs/how-to-start.md](docs/how-to-start.md).

## 📡 Enrutamiento de Proveedores

El directorio `routing/providers/` contiene la configuración de los diferentes proveedores de modelos LLM soportados:

```
routing/providers/
├── anthropic/           # AUTH_METHOD: api_key
│   ├── config.json      # Configuración del proveedor
│   ├── secrets.json     # API keys (no versionado)
│   ├── secrets.json.example
│   └── models/          # Metadatos por modelo
│       ├── claude-haiku-4-5/metadata.json
│       ├── claude-opus-4-6/metadata.json
│       └── claude-sonnet-4-6/metadata.json
├── openrouter/          # AUTH_METHOD: bearer
│   ├── config.json      # Configuración del proveedor
│   ├── secrets.json     # API keys (no versionado)
│   ├── secrets.json.example
│   └── models/          # Metadatos por modelo
│       ├── deepseek-v4-flash/metadata.json
│       ├── deepseek-v4-pro/metadata.json
│       └── minimax-m2-5/metadata.json
├── ollama/              # AUTH_METHOD: bearer
│   ├── config.json      # Configuración del proveedor
│   ├── secrets.json     # API keys (no versionado)
│   ├── secrets.json.example
│   └── models/          # Metadatos por modelo
│       ├── gemini-3-flash-preview/metadata.json
│       └── minimax-m2.5/metadata.json
└── xiaomi/              # AUTH_METHOD: bearer
    ├── config.json      # Configuración del proveedor
    └── models/          # Metadatos por modelo
        └── mimo-v2-5/metadata.json
```


Cada `config.json` incluye el campo `AUTH_METHOD` que determina qué variable de entorno de autenticación usa Claude Code al comunicarse con ese proveedor:

| `AUTH_METHOD` | Variable de entorno | Header HTTP | Cuándo usarlo |
|---|---|---|---|
| `api_key` | `ANTHROPIC_API_KEY` | `X-Api-Key` | Acceso directo a la API de Anthropic (pay-as-you-go) |
| `bearer` | `ANTHROPIC_AUTH_TOKEN` | `Authorization: Bearer` | Gateways y proxies LLM (OpenRouter, Ollama, Xiaomi) |

Los archivos `secrets.json` contienen la credencial real y **no deben versionarse** (están en `.gitignore`). Usar `secrets.json.example` como plantilla — su contenido refleja el campo correcto según el `AUTH_METHOD` del proveedor.


## 🐳 Docker y Contenerización

Los artefactos para la contenerización del proyecto se han centralizado en el directorio `containerization/`.

- `containerization/Dockerfile`: imagen multi-etapa optimizada para producción.
- `containerization/.dockerignore`: entradas ignoradas para construir la imagen sin archivos de desarrollo ni artefactos (convención [BuildKit](https://docs.docker.com/build/buildkit/): Docker asocia automáticamente este archivo al `Dockerfile` del mismo directorio).

Instrucciones básicas:

1.  Construir la imagen (desde la raíz del repositorio):
    - `docker build -f containerization/Dockerfile -t smart-code-proxy:latest .`

2.  Ejecutar el contenedor (crea y monta `sessions/` como volumen):
    - `docker run -it --rm -p 8787:8787 -v "$(pwd)/sessions:/app/sessions" --env-file configs/.env smart-code-proxy:latest`

3.  Notas importantes:
    - El `Dockerfile` usa una etapa `builder` para compilar TypeScript y una etapa final mínima basada en `node:24-alpine`.
    - Asegúrate de no incluir `sessions/`, `dist/` ni `node_modules/` en la imagen: estos están listados en `containerization/.dockerignore`. Docker BuildKit (motor por defecto desde Docker 23.0+) reconoce automáticamente este archivo al construir con `-f containerization/Dockerfile`.
    - La imagen final ejecuta como usuario `node` (no-root) e incluye un `HEALTHCHECK` contra `/health`.
    - Para desarrollo iterativo es recomendable usar `npm run dev` localmente en lugar de reconstruir la imagen cada cambio.

Para más detalles y comandos alternativos, consulta `docs/dockerization.md`.

### Interpretación de Auditoría

Tras cada turno, se genera una estructura en `./sessions/<session-id>/interactions/<seq>_<uuid>/` con los archivos documentados en la [§ Referencia de Archivos de Auditoría](#archivos-auditoria).

---

> [!NOTE]
> Este proyecto utiliza **Inyección de Dependencias** para facilitar las pruebas unitarias de los servicios sin necesidad de levantar el servidor completo.

## 📚 Guías de Estimación de Costos

El proxy intercepta métricas de uso de tokens que pueden ser cuantificadas. Consulta estas guías adicionales para configurar precios y estimar costos según el tráfico auditado:

- [Caché inteligente de Context Sync WebFetch (HIT/MISS y reglas de auditoría)](./docs/issues/context-sync-cache.md)
- [Coste por interacción: Claude Code y la API de Anthropic](./docs/how-to-calculate-anthropic-api-costs.md)
- [Coste por generación: OpenRouter y la API Chat Completions](./docs/how-to-calculate-openrouter-api-costs.md)
