Ejecuta `/orchestrate-specification-delta --mode auto` para implementar el siguiente cambio.

---

## Contexto de la investigación

Se investigó un bug reportado sobre las variables `LOG_HTTP_LEVEL` y `LOG_LEVEL` en el sistema de logging HTTP del proxy. La investigación concluyó que `LOG_HTTP_LEVEL` tiene un defecto de diseño estructural: usa el sistema de niveles de Pino (`.debug()` vs `.info()`) para controlar la verbosidad de un subsistema, pero los niveles de Pino son un mecanismo de filtrado global, no de categorización por subsistema. Esto crea una dependencia implícita entre `LOG_HTTP_LEVEL` y `LOG_LEVEL`: cuando `LOG_HTTP_LEVEL < LOG_LEVEL`, todos los logs HTTP son descartados silenciosamente por el root logger sin ningún aviso. El comportamiento es contraintuitivo: el supuesto "modo más verboso" (`LOG_HTTP_LEVEL=debug`) hace desaparecer los logs HTTP bajo la configuración por defecto del sistema (`LOG_LEVEL=info`).

La investigación también determinó que `LOG_HTTP_LEVEL` no cubre ninguna necesidad que el sistema no satisfaga ya con otras variables: la visibilidad global la controla `LOG_LEVEL`; el contenido de los logs lo controlan `LOG_HTTP_BODIES` (booleano) y `LOG_HTTP_HEADERS` (booleano). La variable no tiene razón de existir.

Los eventos HTTP que el middleware registra (request entrante, body, response) son eventos operacionales de tipo `info` por naturaleza — no diagnósticos. Siempre deben emitirse en `info`.

---

## Cambio solicitado

**Eliminar la variable de entorno `LOG_HTTP_LEVEL` del sistema completo.**

Todos los logs del http-logger deben emitirse siempre en `request.log.info(...)`. La selección condicional de método Pino (`debug` vs `info`) debe eliminarse de los tres hooks.

---

## Causa raíz

`LOG_HTTP_LEVEL` mezcla dos responsabilidades en una variable: qué método Pino invocar y cuándo son visibles los logs HTTP. Ambas responsabilidades quedan acopladas implícitamente al sistema de niveles de Pino, que está diseñado para filtrado, no para control de verbosidad por subsistema. El resultado es un comportamiento silenciosamente roto cuando la combinación `LOG_HTTP_LEVEL < LOG_LEVEL` se produce, que es exactamente el caso en la configuración por defecto del sistema.

---

## Solución prescrita

Eliminar `LOG_HTTP_LEVEL` de los cinco puntos donde existe y siempre emitir en `info`:

### 1. `src/1-domain/types/config.types.ts`
Eliminar la línea 44:
```ts
LOG_HTTP_LEVEL?: 'info' | 'debug';
```
y su comentario JSDoc en la línea 43.

### 2. `src/4-api/config/env.config.ts`
Eliminar la línea 52 del objeto `config`:
```ts
LOG_HTTP_LEVEL: (process.env.LOG_HTTP_LEVEL === 'debug' ? 'debug' : 'info') as 'info' | 'debug',
```

### 3. `src/5-user-interfaces/http/middlewares/http-logger.ts`
Tres cambios:

**a)** Eliminar el campo `level` de la interfaz `HttpLoggerConfig` (línea 12):
```ts
/** Nivel Pino para los logs del plugin (info | debug). */
level: 'info' | 'debug';
```

**b)** En `createHttpOnRequestHook` (líneas 62-66), reemplazar el bloque condicional:
```ts
if (config.level === 'debug') {
  request.log.debug(payload, '→ incoming request');
} else {
  request.log.info(payload, '→ incoming request');
}
```
por:
```ts
request.log.info(payload, '→ incoming request');
```

**c)** En `createHttpPreValidationHook` (líneas 84-88), reemplazar:
```ts
if (config.level === 'debug') {
  request.log.debug(payload, '→ incoming request body');
} else {
  request.log.info(payload, '→ incoming request body');
}
```
por:
```ts
request.log.info(payload, '→ incoming request body');
```

**d)** En `createHttpOnResponseHook` (líneas 110-114), reemplazar:
```ts
if (config.level === 'debug') {
  request.log.debug(payload, '← response sent');
} else {
  request.log.info(payload, '← response sent');
}
```
por:
```ts
request.log.info(payload, '← response sent');
```

### 4. `src/app.ts`
En la construcción de `httpLoggerConfig` (líneas 21-25), eliminar el campo `level`:
```ts
const httpLoggerConfig = {
  logBodies: deps.config.LOG_HTTP_BODIES === true,
  logHeaders: deps.config.LOG_HTTP_HEADERS !== false,
  level: deps.config.LOG_HTTP_LEVEL ?? 'info',   // ← eliminar esta línea
};
```

### 5. `docs/observability.md`
Dos cambios:

**a)** En la tabla de variables de entorno (línea 13), eliminar la fila:
```
| `LOG_HTTP_LEVEL`    | `info`  | Nivel Pino para los logs del plugin (`info` \| `debug`). |
```

**b)** En la sección "Cómo activarlo temporalmente" (líneas 85-86), eliminar el bloque:
```bash
# Modo debug (nivel 20 en Pino — muy verboso)
LOG_HTTP_BODIES=true LOG_HTTP_LEVEL=debug npm run dev
```

---

## Archivos afectados (solo estos cinco)

| Archivo | Tipo de cambio |
|---|---|
| `src/1-domain/types/config.types.ts` | Eliminar campo de interfaz |
| `src/4-api/config/env.config.ts` | Eliminar línea de config |
| `src/5-user-interfaces/http/middlewares/http-logger.ts` | Eliminar campo de interfaz + reemplazar 3 condicionales |
| `src/app.ts` | Eliminar campo de objeto literal |
| `docs/observability.md` | Eliminar fila de tabla + ejemplo de bash |

`configs/.env.example` **no requiere cambios** — `LOG_HTTP_LEVEL` nunca fue documentada ahí.

---

## Restricciones

- No modificar la lógica de `logBodies`, `logHeaders`, `serializeBody`, ni `pickHeaders`.
- No cambiar el nivel de ningún otro logger del sistema.
- No introducir nuevas variables de configuración.
- No tocar tests existentes salvo que fallen por el cambio de interfaz (en cuyo caso actualizar solo lo necesario para que compilen y pasen).

---

## Criterios de éxito

1. `tsc` sin errores — `HttpLoggerConfig` ya no tiene el campo `level` y ningún consumer lo referencia.
2. `LOG_HTTP_LEVEL` no aparece en ningún archivo bajo `src/`.
3. Los tres hooks del http-logger llaman siempre a `request.log.info(...)`.
4. `docs/observability.md` no menciona `LOG_HTTP_LEVEL`.
5. `npm test` pasa sin modificaciones ajenas al cambio de interfaz.
