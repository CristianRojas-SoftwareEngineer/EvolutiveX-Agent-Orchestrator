## 1. Tipos y configuración

- [x] 1.1 Eliminar `LOG_HTTP_LEVEL` y su JSDoc de `src/1-domain/types/config.types.ts`
- [x] 1.2 Eliminar línea de parsing de `LOG_HTTP_LEVEL` en `src/4-api/config/env.config.ts`

## 2. Middleware HTTP logger

- [x] 2.1 Eliminar campo `level` de `HttpLoggerConfig` en `http-logger.ts`
- [x] 2.2 Reemplazar condicionales de nivel por `request.log.info(...)` en los tres hooks

## 3. Bootstrap de la aplicación

- [x] 3.1 Eliminar `level` de `httpLoggerConfig` en `src/app.ts`

## 4. Documentación

- [x] 4.1 Eliminar fila `LOG_HTTP_LEVEL` y ejemplo bash de `docs/observability.md`

## 5. Tests

- [x] 5.1 Actualizar `http-logger.test.ts`: reemplazar test `level=debug` por aserción de emisión en nivel info (30); quitar `level` de configs de test

## 6. Limpieza de legado

- [x] 6.1 Verificar que `LOG_HTTP_LEVEL` no aparece bajo `src/`
- [x] 6.2 Ejecutar `tsc` y `npm test` sin errores
