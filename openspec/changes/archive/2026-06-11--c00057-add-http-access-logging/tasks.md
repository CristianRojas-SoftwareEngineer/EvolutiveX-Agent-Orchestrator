## 1. Configuración de entorno (capa 1-domain + capa 4-api)

- [x] 1.1 Agregar los 3 campos opcionales (`LOG_HTTP_BODIES?`, `LOG_HTTP_HEADERS?`, `LOG_HTTP_LEVEL?`) al interface `ProxyEnvironmentConfig` en `src/1-domain/types/config.types.ts`, con JSDoc en español.
- [x] 1.2 Agregar las 3 env vars al objeto `config` en `src/4-api/config/env.config.ts`, con coerción explícita (`'true' === 'true'`, `!== 'false'`, ternario para `level`) y los defaults acordados.
- [x] 1.3 Verificar que `npm run test:quick` pasa tras el cambio (lint + typecheck + unit).

## 2. Implementación del plugin (capa 5-user-interfaces)

- [x] 2.1 Crear `src/5-user-interfaces/http/middlewares/http-logger.ts` exportando:
  - `HttpLoggerConfig` como interface local (no crear archivo nuevo en `4-api`).
  - `createHttpOnRequestHook(config): (request, reply) => Promise<void>` — hook `onRequest`.
  - `createHttpPreValidationHook(config): (request, reply) => Promise<void>` — hook `preValidation` para body.
  - `createHttpOnResponseHook(config): (request, reply) => Promise<void>` — hook `onResponse`.
  - `httpLoggerPlugin: FastifyPluginAsync<{ config: HttpLoggerConfig }>` — agrupador que registra los tres hooks internamente (para uso futuro con `fastify-plugin`).
- [x] 2.2 Hook `onRequest`: emite `req.log.{info|debug}({ reqId, method, url, headers? }, '→ incoming request')` — headers disponibles, body aún no parseado.
- [x] 2.3 Hook `preValidation`: emite `req.log.{info|debug}({ reqId, body?, bodyLength?, bodyPreview? }, '→ incoming request body')` — body disponible como `Buffer` desde el content-type parser. Solo se ejecuta si `logBodies=true`.
- [x] 2.4 Hook `onResponse`: emite `req.log.{info|debug}({ reqId, method, url, statusCode, responseTime, headers? }, '← response sent')`.
- [x] 2.5 Helper `serializeBody(buffer: Buffer, contentType: string | undefined): { body?: string; bodyLength: number; bodyPreview?: string }` — si `Content-Type` matchea `/^(application\/json|text\/|application\/x-www-form-urlencoded)/i` → string UTF-8 completo; caso contrario → `bodyLength` + `bodyPreview` (subarray 256 bytes).
- [x] 2.6 Respetar `LOG_HTTP_LEVEL` al emitir (`req.log.info` por default, `req.log.debug` si el flag es `debug`).
- [x] 2.7 Verificar con `npm run test:quick`.

## 3. Registro del plugin (capa 5-user-interfaces)

- [x] 3.1 Importar `createHttpOnRequestHook`, `createHttpPreValidationHook`, `createHttpOnResponseHook` en `src/app.ts`.
- [x] 3.2 Construir el objeto `httpLoggerConfig` con coerción defensiva (`=== true`, `!== false`, `?? 'info'`) porque los campos en `ProxyEnvironmentConfig` son opcionales.
- [x] 3.3 Llamar `app.addHook('onRequest', createHttpOnRequestHook(httpLoggerConfig))`, `app.addHook('preValidation', createHttpPreValidationHook(httpLoggerConfig))` y `app.addHook('onResponse', createHttpOnResponseHook(httpLoggerConfig))` **antes** de `removeAllContentTypeParsers()` y de las rutas. Registrar en el root context para que cubran todas las rutas (`/health`, `/hooks`, `/proxy/*`).
- [x] 3.4 Verificar que `app.ts` crece en ≤10 líneas netas (imports + config + 3 addHook + comentarios).
- [x] 3.5 Verificar con `npm run test:quick`.

## 4. Tests unitarios

- [x] 4.1 Crear `tests/5-user-interfaces/http/middlewares/http-logger.test.ts`. Usar las funciones factory (`createHttpOnRequestHook`, `createHttpPreValidationHook`, `createHttpOnResponseHook`) registradas con `app.addHook` (mismo patrón que `app.ts`), no `app.register` (los hooks de plugin encapsulado no percolan a rutas del root en Fastify 5). Incluir `app.removeAllContentTypeParsers()` y `app.addContentTypeParser('*', { parseAs: 'buffer' })` para que `request.body` sea `Buffer` en los tests.
- [x] 4.2 Test: con `logHeaders: true, logBodies: false`, `app.inject({ method: 'POST', url: '/echo', headers, payload })`, assertar que existe línea con `msg === '→ incoming request'` conteniendo `headers` y SIN `body`.
- [x] 4.3 Test: con `logBodies: true` y `Content-Type: application/json`, assertar que existe línea con `msg === '→ incoming request body'` conteniendo `body` con el JSON serializado como string UTF-8.
- [x] 4.4 Test: con `logBodies: true` y `Content-Type: application/octet-stream`, assertar que existe línea con `msg === '→ incoming request body'` conteniendo `bodyLength` y `bodyPreview` pero NO `body`.
- [x] 4.5 Test: el log de response (`msg === '← response sent'`) contiene `statusCode` y `responseTime >= 0`.
- [x] 4.6 Test: con `level: 'debug'`, assertar que la línea de request tiene `level === 20` (Pino debug level).
- [x] 4.7 Verificar con `npm run test` (suite completa, incluyendo hooks.e2e.test.ts y agent-headers-correlation.test.ts).

## 5. Documentación

- [x] 5.1 Crear `docs/observability.md` con: descripción del plugin, tabla de env vars con sus defaults, ejemplo de log con `LOG_HTTP_BODIES=true` y ejemplo con `false`, sección "Limitaciones conocidas" (response body, redacción), `⚠️` warning sobre uso en producción.
- [x] 5.2 Si existe índice de docs en `README.md` o `docs/README.md`, enlazar el nuevo archivo.

## 6. Verificación end-to-end

- [x] 6.1 Levantar el server localmente con `LOG_HTTP_BODIES=true` y `LOG_HTTP_HEADERS=true`.
- [x] 6.2 Hacer `curl -v -X POST http://localhost:8787/hooks -H 'Content-Type: application/json' -d '{"foo":"bar"}'`.
- [x] 6.3 Verificar que `server/logs.jsonl` contiene tres líneas por request:
  - `→ incoming request` (headers + metadata, sin body).
  - `→ incoming request body` (body serializado como string UTF-8, solo si `logBodies=true`).
  - `← response sent` (statusCode: 202 y responseTime).
- [x] 6.4 Repetir con `LOG_HTTP_BODIES=false` y confirmar que NO existe línea `→ incoming request body`.
- [x] 6.5 Repetir con `LOG_HTTP_HEADERS=false` y confirmar que ni `→ incoming request` ni `← response sent` incluyen `headers`.
- [x] 6.6 Verificar con `npm run test` (suite completa).

## 7. Cierre del change

- [x] 7.1 Ejecutar `npm run test:quick` una última vez.
- [x] 7.2 Confirmar que el commit incluye el trailer `Case: add-http-access-logging` (o el `case-id` que se asigne si se abre un caso SM).
- [x] 7.3 Confirmar que `CHANGELOG.md` se regenera con el on-demand generator (no se edita a mano).
- [x] 7.4 Listo para `openspec-archive` o `openspec-apply` (este change ya está apply-ready).
