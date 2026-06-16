## Context

El http-logger emite logs en tres hooks (`onRequest`, `preValidation`, `onResponse`). Actualmente `HttpLoggerConfig.level` selecciona entre `request.log.debug()` y `request.log.info()`. La variable `LOG_HTTP_LEVEL` alimenta ese campo desde `env.config.ts`. Pino filtra por nivel global (`LOG_LEVEL`), por lo que invocar `.debug()` cuando el root logger está en `info` descarta los mensajes sin aviso.

## Goals / Non-Goals

**Goals:**
- Eliminar `LOG_HTTP_LEVEL` de tipos, config, middleware, app bootstrap y documentación.
- Simplificar los tres hooks para emitir siempre en `info`.
- Actualizar el test que verificaba nivel debug.

**Non-Goals:**
- Cambiar `LOG_LEVEL`, `LOG_HTTP_BODIES`, `LOG_HTTP_HEADERS` ni la lógica de serialización.
- Introducir nuevas variables de configuración.
- Modificar otros loggers del sistema.

## Decisions

### D1: Siempre `request.log.info()` — sin reemplazo de `LOG_HTTP_LEVEL`

**Decisión:** Los eventos HTTP operacionales (`→ incoming request`, `→ incoming request body`, `← response sent`) son inherentemente `info`. No se introduce variable sustituta.

**Alternativa descartada:** Mantener `LOG_HTTP_LEVEL` documentando la interacción con `LOG_LEVEL` — no resuelve el defecto de diseño y añade complejidad innecesaria.

### D2: Eliminación mecánica en cinco puntos

| Archivo | Cambio |
|---|---|
| `config.types.ts` | Quitar `LOG_HTTP_LEVEL?` |
| `env.config.ts` | Quitar línea de parsing |
| `http-logger.ts` | Quitar `level` de interfaz + 3 condicionales |
| `app.ts` | Quitar `level` de `httpLoggerConfig` |
| `docs/observability.md` | Quitar fila de tabla y ejemplo bash |

## Risks / Trade-offs

[Operadores que usaban `LOG_HTTP_LEVEL=debug`] → La variable deja de existir; para más verbosidad global usar `LOG_LEVEL=debug`. Para más detalle HTTP usar `LOG_HTTP_BODIES=true`.

[Test `level=debug`] → Reemplazar por aserción de que los logs emiten en nivel 30 (info).

## Migration Plan

1. Aplicar cambios en código y docs.
2. Ejecutar `tsc` y `npm test`.
3. Verificar que `LOG_HTTP_LEVEL` no aparece bajo `src/`.

**Rollback:** Revertir el commit; no hay migración de datos.

## Legacy Retirement Strategy

- **Tipos y config:** eliminar campo `LOG_HTTP_LEVEL` de `ProxyEnvironmentConfig` y `env.config.ts`.
- **Middleware:** eliminar `level` de `HttpLoggerConfig` y ramas `if (config.level === 'debug')`.
- **Bootstrap:** eliminar `level` de `httpLoggerConfig` en `app.ts`.
- **Docs:** eliminar referencias en `docs/observability.md`.
- **Tests:** actualizar `http-logger.test.ts` para reflejar emisión siempre en `info`.
