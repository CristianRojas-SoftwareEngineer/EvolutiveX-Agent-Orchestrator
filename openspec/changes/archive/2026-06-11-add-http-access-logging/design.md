## Context

El proxy está construido sobre Fastify 5 con Pino 9 como logger. Hoy se invoca `fastify({ loggerInstance: logger })` en `src/app.ts`, lo que **inyecta un logger externo** pero **no activa el request logging automático de Fastify** (esa opción es `logger: true`, no `loggerInstance`). El resultado es que los logs HTTP actuales son manuales y dispersos:

- `hooks.controller.ts` no loguea body ni headers — solo el handler emite el mensaje `"hook desconocido recibido — ignorado"` con `eventName`.
- El middleware de Fastify loguea `incoming request` y `request completed` a través del logger de Fastify, pero sin bodies ni headers.
- `parseHookEvent` descarta silenciosamente cualquier campo del payload que no conozca — evidencia perdida.

**Estado actual del logging de un POST /hooks:**

```
{"msg":"incoming request","reqId":"...","req":{"method":"POST","url":"/hooks"}}
{"msg":"hook desconocido recibido — ignorado","eventName":""}
{"msg":"request completed","reqId":"...","res":{"statusCode":202}}
```

No hay forma de saber qué payload llegó. Diagnosticar bugs remotos exige reproducir localmente.

**Restricción operacional:** el proyecto está en desarrollo, sin usuarios activos. La confidencialidad de headers/bodies no es un bloqueante; el usuario prioriza velocidad de desarrollo y diferirá la redacción sensible para más adelante.

## Goals / Non-Goals

**Goals:**
- Centralizar el logging HTTP en un único plugin Fastify autocontenido.
- Loguear en `onRequest`: `method`, `url`, `reqId`, `headers` (configurable), `body` (configurable).
- Loguear en `onResponse`: `statusCode`, `responseTime`, `reqId`, `headers` de respuesta (configurable).
- Hacer el plugin **configurable por env vars** sin recompilar.
- Mantener `app.ts` con un cambio mínimo (un `app.register`).
- Aplicar a **todos los endpoints** registrados en `app.ts` (`/health`, `/hooks`, `/proxy/*`).
- Mensaje estable y objeto estructurado (parseable por el JSONL sink de Pino).

**Non-Goals:**
- Logging del **response body** (queda como deuda — ver §Risks).
- Redacción de campos sensibles (se aborda cuando haya usuarios reales).
- Métricas agregadas (p50/p95, histogramas) — trabajo aparte, dashboard.
- Cambio en el formato de logs existentes — el plugin solo agrega eventos nuevos; los logs manuales previos se mantienen.
- Tocar la capa de dominio o servicios — el plugin es puramente de la capa `5-user-interfaces`.

## Decisions

### D1. Plugin Fastify encapsulado vs. hooks inline en `app.ts`

**Decisión (implementada):** Crear `src/5-user-interfaces/http/middlewares/http-logger.ts` exportando funciones factory `createHttpOnRequestHook`, `createHttpPreValidationHook` y `createHttpOnResponseHook`, y registrarlas en `app.ts` con `app.addHook` directo. El plugin `httpLoggerPlugin: FastifyPluginAsync<{ config: HttpLoggerConfig }>` se exporta como agrupador documentado para cuando se resuelva la dependencia `fastify-plugin`. **No se usa `fastify-plugin`** (no está en el proyecto).

**Racionale:** En **Fastify 5**, los hooks de un plugin registrado con `app.register()` en el root context **no percolan** a las rutas registradas en el mismo root context (encapsulamiento del plugin). Esto fue confirmado empíricamente: `app.register(plugin, ...)` + `app.post('/echo', ...)` produce logs del plugin solo para rutas anidadas dentro del plugin, no para rutas registradas directamente en el root. La solución sin `fastify-plugin` es que `app.ts` registre los hooks con `app.addHook` directamente — mismo patrón que `proxyRoutes` con su `preHandler`.

El módulo como archivo existe para: (1) encapsular la lógica de serialización y helpers, (2) mantener testeabilidad unitaria con streams en memoria, (3) ofrecer una API de alto nivel cuando se instale `fastify-plugin`. Las funciones factory permiten el registro directo en `app.ts`.

**Alternativas consideradas:**
- `app.register(httpLoggerPlugin, ...)` → no funciona por encapsulamiento de Fastify 5; los hooks no aplican a rutas del root context.
- `fastify-plugin` (dependencia nueva) → rechazado: viola la regla de "no agregar deps no aprobadas"; requiere instalarla primero.
- Mover la lógica al `index.ts` → fuera de la capa 5, rompería la arquitectura.

### D2. `onRequest` + `preValidation` + `onResponse` vs. un solo `onResponse`

**Decisión (implementada):** Usar tres hooks en secuencia.

**Racionale:** `onRequest` captura headers y metadata **antes** del content-type parsing. El body como `Buffer` (resultado del `addContentTypeParser('*', { parseAs: 'buffer' })` en `app.ts`) **no está disponible en `onRequest`** — lo está a partir de `preValidation`. Por eso el logging de body se hace en `preValidation` (mensaje `→ incoming request body`). `onResponse` captura `statusCode` y `responseTime` al final. Son complementarios y cada uno corre en su momento correcto del lifecycle de Fastify 5.

### D3. Acceso al body — `preValidation` hook y serialización

**Decisión (implementada):** El logging de body se hace en el hook `preValidation` (donde `request.body` ya es `Buffer` tras el content-type parser). Se emite como mensaje `→ incoming request body` (separado de `→ incoming request` que va en `onRequest`). Serialización: si `Content-Type` matchea `/^(application\/json|text\/|application\/x-www-form-urlencoded)/i` → loguear string UTF-8 completo; caso contrario → loguear `bodyLength` + `bodyPreview` (subarray 256 bytes).

**Racionale:** `onRequest` corre **antes** del content-type parser en Fastify 5, así que `request.body` es `undefined` ahí. `preValidation` es el primer hook post-parser donde el body como `Buffer` está disponible. Dos mensajes separados (`→ incoming request` + `→ incoming request body`) refleja fielmente el timing diferente de cada información.

**Alternativas consideradas:**
- `onRequest` para body → no funciona porque el body aún no está parseado.
- `preHandler` → demasiado tarde (después de la validación del handler); `preValidation` es más temprano y correcto.
- Un solo mensaje `→ incoming request` con body → imposible sin cambiar el diseño a un solo hook o usar un middleware que capture el body antes del parsing; ambas opciones agregan complejidad innecesaria.

### D4. Headers sensibles — diferido

**Decisión:** No redactar nada en esta iteración. Marcar en `docs/observability.md` como **no usar en producción** y como **deuda técnica abierta**.

**Racionale:** El usuario confirmó que no hay usuarios activos. Resolver redacción ahora agregaría complejidad que diverge del objetivo principal (debugging). La doc del plugin lleva un `⚠️` explícito.

### D5. Configuración por env vars en `env.config.ts` (no en `app.ts`)

**Decisión:** Las tres env vars se declaran en `src/4-api/config/env.config.ts` con sus defaults (`LOG_HTTP_BODIES=false`, `LOG_HTTP_HEADERS=true`, `LOG_HTTP_LEVEL=info`). Se pasan al plugin como opciones en `app.register(httpLoggerPlugin, { config })`.

**Racionale:** Consistencia con el patrón existente del proyecto: toda config de runtime vive en `env.config.ts` (composition root). Evita leer `process.env` desde la capa 5.

### D6. Nombre del plugin: `httpLoggerPlugin`

**Decisión:** `export const httpLoggerPlugin: FastifyPluginAsync<{ config: HttpLoggerConfig }>` — función `async (fastify, opts) => Promise<void>` (mismo patrón que `proxyRoutes`). El tipo `HttpLoggerConfig` se define localmente en el plugin, no en `4-api/config/`.

**Racionale:** Convención del proyecto (sufijo `Plugin` no usado, pero el nombre `httpLoggerPlugin` describe responsabilidad). Exportación nombrada para testearlo con `app.register` en un `app` efímero en tests unitarios. Mantener el tipo en el plugin evita crear un archivo nuevo en `4-api` para compartir 3 campos — seguir §2 (Simplicity First) del `CLAUDE.md`.

### D7. Forma del log: mensaje estable + objeto

**Decisión (implementada):**
- `onRequest` → `req.log.info({ reqId, method, url, headers? }, '→ incoming request')` — headers disponibles en `onRequest`; body aún no está parseado.
- `preValidation` → `req.log.info({ reqId, body?, bodyLength?, bodyPreview? }, '→ incoming request body')` — body disponible en `preValidation` tras el content-type parser.
- `onResponse` → `req.log.info({ reqId, method, url, statusCode, responseTime, headers? }, '← response sent')` — status y headers de respuesta disponibles.

**Racionale:** La separación en dos mensajes (`→ incoming request` + `→ incoming request body`) refleja el timing real de cuándo cada información está disponible en el lifecycle de Fastify. Es más preciso y permite loguear headers inmediatamente sin esperar a que el body esté parseado. Cuando `logBodies=false`, solo se emite `→ incoming request`. Mensajes con flecha (`→` / `←`) son visualmente distinguibles en terminal (pinoPretty los colorea) y estables para grep. El objeto estructurado es parseable por herramientas de log analysis.

## Risks / Trade-offs

- **[Volumen de logs]** → Con `LOG_HTTP_BODIES=true` y ~150 hooks/minuto, `logs.jsonl` crece ~varios MB/minuto. **Mitigación:** el default es `false`; el usuario lo activa solo durante debugging activo y lo desactiva al terminar.

- **[Confidencialidad]** → Headers como `Authorization` y bodies con prompts de usuario quedan en plano en `logs.jsonl`. **Mitigación:** explícito en `docs/observability.md` con `⚠️` y nota "no usar en producción con usuarios activos hasta que se implemente redacción".

- **[Body binario no-UTF-8]** → `body.toString('utf-8')` produce caracteres mojibake si el contenido es binario real (ej: imagen). **Mitigación:** verificar `Content-Type` antes de loguear; si no es `application/json`, `text/*`, o `application/x-www-form-urlencoded`, loguear solo `body.length` y `bodyPreview = body.subarray(0, 256).toString('utf-8')`. Ver D3-revised en la implementación.

- **[Response body no se loguea]** → Queda como deuda. Si en el futuro se necesita, se puede agregar con un `onSend` hook que intercepte el payload antes de la serialización, o wrapping de `reply.send`. **Mitigación:** documentado en `docs/observability.md` §"Limitaciones conocidas".

- **[Coupling al logger de Fastify]** → El plugin usa `req.log` (FastifyBaseLogger). Si en el futuro se cambia el logger, hay que migrar. **Mitigación:** el plugin recibe el logger por convención de Fastify (no por import directo), y el resto del proyecto ya depende de Pino.

- **[Performance overhead]** → `JSON.stringify(headers)` y `Buffer.toString()` por request. **Mitigación:** trivial — headers típicamente <2KB, body se serializa solo si `LOG_HTTP_BODIES=true`.

## Migration Plan

**Deploy:** No requiere pasos especiales. El cambio es aditivo: el plugin se registra, los logs adicionales aparecen. No rompe nada existente.

**Rollback:** Revertir el commit. El plugin se desactiva y los logs vuelven al estado previo.

**No hay migraciones de datos, cambios de schema, ni dependencias nuevas.**

## Open Questions

_Ninguna._ Las decisiones (D1–D7) están tomadas y consensuadas con el usuario durante la fase de exploración. El `outputPath` final del plugin (`src/5-user-interfaces/http/middlewares/http-logger.ts`) y las env vars se acordaron antes de la proposal.
