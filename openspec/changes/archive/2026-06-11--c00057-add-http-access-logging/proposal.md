## Why

El proxy actualmente emite logs HTTP con información mínima (`incoming request`, `request completed`, `eventName:""`). Cuando un evento de hook llega con `eventName` vacío o desconocido — y hemos visto más de 150 ocurrencias en una sesión de ~6 minutos — no es posible diagnosticar **qué** payload llegó realmente al gateway, qué headers trajo, ni qué respondió el servidor. Esto bloquea el desarrollo: cualquier bug remoto requiere reproducir el escenario localmente, lo cual es caro y a veces imposible.

Necesitamos logs HTTP estructurados y completos de **request** (headers + body) y **response** (status, tiempo, headers), configurables por variables de entorno para activarlos solo cuando se requiere debugging profundo — sin ruido en operación normal.

## What Changes

- Se agrega un **plugin Fastify** (`httpLoggerPlugin`) que registra hooks `onRequest` y `onResponse` para emitir logs estructurados.
- Se introduce configuración por variables de entorno en `env.config.ts`:
  - `LOG_HTTP_BODIES` (default: `false`) — activa/desactiva el logging del body de request.
  - `LOG_HTTP_HEADERS` (default: `true`) — activa/desactiva el logging de headers de request y response.
  - `LOG_HTTP_LEVEL` (default: `info`) — nivel de log dedicado para los mensajes del plugin.
- Los logs se emiten con un mensaje estable (`→ incoming request` / `← response sent`) y un objeto estructurado con `reqId`, `method`, `url`, `headers` (si está activo), `body` (si está activo), `statusCode` y `responseTime`.
- El plugin se registra en `app.ts` mediante `app.register(httpLoggerPlugin, { config })`, una sola línea.
- Se documenta el uso en `docs/observability.md` (nuevo) con ejemplos de salida para ambos modos (con/sin body).

**No incluye** (queda fuera de alcance explícito):
- Logging del **response body** — requiere interceptar la serialización de Fastify; queda como deuda técnica.
- Redacción de campos sensibles (Authorization, cookies, tokens) — se resuelve cuando el proyecto tenga usuarios activos.
- Métricas agregadas (request count, p50/p95) — Pino ya emite `responseTime` por request; un dashboard es trabajo aparte.

## Capabilities

### New Capabilities

- `http-access-logging`: Contrato del plugin Fastify y de la configuración por env vars. Define qué se loguea, bajo qué condiciones, y qué formato se garantiza (mensaje estable + objeto estructurado). Se aplica a **todos** los endpoints registrados en `app.ts` (`/health`, `/hooks`, `/proxy/*`).

### Modified Capabilities

_Ninguna._ Este cambio es puramente aditivo en la capa de observabilidad: no altera requisitos existentes de las capabilities actuales (no cambia el comportamiento de hooks, no toca routing, no modifica dominios).

## Impact

**Capas PKA afectadas:**
- `5-user-interfaces` — nuevo archivo `http/middlewares/http-logger.ts`, modificación de `app.ts` (1 línea: `app.register`).
- `4-api` — modificación de `env.config.ts` para declarar las nuevas env vars con defaults.

**Archivos clave:**
- `src/5-user-interfaces/http/middlewares/http-logger.ts` (nuevo) — el plugin.
- `src/app.ts` — registro del plugin.
- `src/4-api/config/env.config.ts` — schema de las env vars.
- `docs/observability.md` (nuevo) — guía de uso.

**Sin impacto en:**
- `1-domain` y `2-services` — el plugin no introduce lógica de negocio ni toca repositorios.
- Protocolo wire ni contrato con Claude Code — solo observabilidad.
- Performance en operación normal — `LOG_HTTP_BODIES=false` evita serializar el body en cada request.
