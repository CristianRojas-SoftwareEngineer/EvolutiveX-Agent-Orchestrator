## Why

`LOG_HTTP_LEVEL` usa los niveles de Pino (`.debug()` vs `.info()`) para controlar la verbosidad del subsistema HTTP, pero Pino filtra por nivel global — no por categoría. Cuando `LOG_HTTP_LEVEL=debug` y `LOG_LEVEL=info` (configuración por defecto), los logs HTTP desaparecen silenciosamente. La variable no aporta valor: `LOG_LEVEL` controla visibilidad global y `LOG_HTTP_BODIES`/`LOG_HTTP_HEADERS` controlan el contenido.

## What Changes

- **BREAKING**: Se elimina la variable de entorno `LOG_HTTP_LEVEL` y el campo `level` de `HttpLoggerConfig`.
- Los tres hooks del http-logger emiten siempre en `request.log.info(...)`.
- Se actualiza `docs/observability.md` para quitar referencias a `LOG_HTTP_LEVEL`.
- Se actualiza el test que verificaba emisión a nivel debug.

## Capabilities

### New Capabilities

_Ninguna._

### Modified Capabilities

- `http-access-logging`: Eliminar `LOG_HTTP_LEVEL` del contrato de configuración; los eventos HTTP operacionales se emiten siempre en nivel `info`.

## Impact

**Capas PKA afectadas:**
- `1-domain` — eliminar `LOG_HTTP_LEVEL` de `ProxyEnvironmentConfig`.
- `4-api` — eliminar parsing en `env.config.ts`.
- `5-user-interfaces` — simplificar `HttpLoggerConfig` y los tres hooks en `http-logger.ts`.
- `app.ts` — eliminar `level` del objeto `httpLoggerConfig`.

**Documentación:**
- `docs/observability.md` — quitar fila de tabla y ejemplo con `LOG_HTTP_LEVEL`.

**Tests:**
- `tests/5-user-interfaces/http/middlewares/http-logger.test.ts` — actualizar o eliminar test de `level=debug`.

**Sin impacto en:**
- Lógica de `logBodies`, `logHeaders`, `serializeBody`, `pickHeaders`.
- Nivel de ningún otro logger del sistema.
