# Cómo empezar (on-boarding)

Esta página está pensada para **quien no ha usado este repositorio antes**. No asume que sepas qué es un proxy HTTP ni cómo se configura Claude Code por dentro: si algo te resulta obvio, puedes saltarte ese párrafo.

La referencia técnica completa (tabla de variables, formato de `meta.json`, riesgos) sigue en el [README](../README.md).

---

## ¿Qué es este proyecto? (en pocas palabras)

**Claude Code** (y otros clientes) suelen hablar con la API de Anthropic en internet de forma directa.

Este repositorio es un **programa que se ejecuta en tu ordenador** y hace de **intermediario**:

- Las peticiones de tu cliente **salen primero hacia este programa** (en un puerto de tu máquina).
- El programa **las reenvía** a la API real de Anthropic (`https://api.anthropic.com` por defecto), **sin cambiar** cómo funciona la API.
- A cambio, puedes ver **trazas en la consola** (JSON línea a línea) y, si lo activas, **copias en disco** de peticiones y respuestas bajo la carpeta `sessions/`.

Eso sirve para **observar** y **auditar** el tráfico (depuración, cumplimiento, análisis), no para modificar el contrato de Anthropic.

**Importante — seguridad:** en `sessions/` puede haber **claves API y texto de conversaciones en claro**. No subas esa carpeta a Git público; más detalle en el [README](../README.md#riesgos-seguridad).

---

## Qué necesitas instalado

- **Node.js v22.9** o superior ([página oficial de Node](https://nodejs.org/)); **v24 LTS recomendado**. El mínimo cubre el flag `--env-file-if-exists` que usa `npm run dev` para cargar `configs/.env`. En producción (`npm start`) las variables se inyectan en el entorno del sistema; ahí no hace falta ese flag.
- Conexión a **internet** hacia la API de Anthropic cuando quieras usar el servicio real (el “servidor al que el proxy reenvía”; en la documentación técnica se llama a veces _upstream_).

---

## Instalación del proyecto

Sigue estos pasos en orden:

1. Obtén el código (clona el repositorio o descomprime la carpeta del proyecto).
2. Abre una terminal y entra en la carpeta raíz del proyecto (donde está `package.json`).
3. Instala dependencias:

   ```bash
   cd "Smart Code Proxy"
   npm install
   ```

4. **Opcional — configurar proveedor en Claude Code:** si usas el CLI de Anthropic y quieres que apunte al proxy (y opcionalmente a un backend distinto de la API pública), ejecuta el asistente interactivo:

   ```bash
   npm run configure:provider
   ```

   Escribe variables como `ANTHROPIC_BASE_URL` en el entorno de Claude Code para que el tráfico pase por este proxy. Detalle de proveedores soportados en el [README](../README.md#-enrutamiento-de-proveedores).

5. **Opcional:** configura variables de entorno para desarrollo local usando un archivo `.env`:

   a. Copia el archivo de referencia dentro de la carpeta `configs/`:

   ```bash
   cp configs/.env.example configs/.env
   ```

   En **PowerShell**:

   ```powershell
   Copy-Item configs/.env.example configs/.env
   ```

   b. Abre `configs/.env` y edita solo las variables que quieras cambiar. Las que no definas tomarán su valor por defecto del código (ver la [tabla de variables](#variables-que-suelen-bastar-al-principio) y el [README](../README.md#configuracion)).

   El archivo `.env` está en `.gitignore` (no se sube al repositorio). El archivo `.env.example` sí está versionado y sirve de guía: muestra todas las variables disponibles con sus valores por defecto.

   **¿Cómo se carga?** El script `npm run dev` usa el flag nativo de Node.js `--env-file-if-exists=configs/.env` (disponible desde Node v22.9; Node v24+ recomendado). A diferencia de `--env-file`, este flag **no falla** si el archivo `.env` no existe: el proxy arranca igualmente con los valores por defecto del código. **El script `npm start` (producción) no carga `.env`** a propósito: en producción las variables se inyectan en el entorno del sistema directamente.

6. **Opcional:** puedes verificar que el código compila sin errores antes de arrancar:

   ```bash
   npm run build
   ```

   El proyecto incluye un script de validación integral (`npm test`) que ejecuta el análisis estático (`lint`), la validación de tipos (`typecheck`), la validación de pruebas integradas (`test:unit`) y la compilación (`build`) para asegurar la exactitud funcional y la integridad del código TypeScript. Se recomienda ejecutarlo antes de cada despliegue relevante.

7. **Opcional — compatibilidad multi-agente:** Si usas otros agentes de código además de Claude Code (Codex CLI, Copilot, Cursor, etc.), puedes crear un hardlink `AGENTS.md` → `CLAUDE.md` para que también lean las instrucciones del proyecto:

   ```bash
   npm run create:agents-reference
   ```

   El hardlink comparte el mismo inodo que `CLAUDE.md`, por lo que cualquier cambio en uno se refleja automáticamente en el otro. No requiere permisos especiales en ninguna plataforma. El script es idempotente: ejecutarlo varias veces recrea el enlace sin duplicar contenido.

---

## Arrancar el proxy (servidor local)

1. En la misma carpeta del proyecto, ejecuta:

   ```bash
   npm run dev
   ```

   Esto levanta el servidor directamente desde TypeScript sin compilar (tsx). Es la opción más rápida para empezar.

   Para **producción**, compila primero con `npm run build` y luego ejecuta `npm start` (internamente es `node dist/index.js`).

2. **No cierres esa terminal** mientras quieras usar el proxy: el proceso debe seguir en marcha.

3. Comprueba el arranque: debería imprimirse **una línea JSON** con el mensaje `Proxy levantado correctamente` junto con campos como `port`, `upstream`, `upstreamAcceptEncoding`, `maxResponseBufferBytes`, `maxAuditRequestBodyBytes`, `maxAuditResponseBodyBytes`, `maxAuditSseRawBytes`, `stripAuditSessionHeader` y `auditSessionHashSuffix` (lista de variables de entorno en el [README](../README.md#configuracion)). Si ves esa línea, el proxy está escuchando en tu PC.

Por defecto el proxy reenvía a `https://api.anthropic.com`. Puedes cambiar la URL de destino con la variable `UPSTREAM_ORIGIN` si tu organización usa otro host (véase el README).

---

## Procedimiento: usar Claude Code pasando por el proxy

La siguiente secuencia es un **único flujo de trabajo**: primero el servidor proxy, luego la configuración del cliente, luego qué observar. Los pasos van en orden; no son una lista “al azar”.

### Paso A — Tener el proxy en ejecución

Completa la sección anterior (**Arrancar el proxy**). Sin ese proceso en marcha, el resto no funcionará: Claude Code intentaría hablar con un puerto donde nadie escucha.

### Paso B — Redirigir el cliente hacia tu máquina (no directamente a Anthropic)

Claude Code utiliza el SDK de Anthropic. Ese SDK, por defecto, usa la URL pública de la API. Para meter el proxy en medio, debes decirle al SDK: **“usa como base esta URL, que es mi ordenador”**.

Eso se hace con la variable de entorno **`ANTHROPIC_BASE_URL`** del **proceso donde corre Claude Code** (no del proxy):

- Valor típico si el proxy usa el puerto por defecto: `http://127.0.0.1:8787`
- **Sin barra al final** (no uses `http://127.0.0.1:8787/`).

**Windows 11 con PowerShell 7+ (`pwsh`)** — Ejemplos concretos (elige según necesites que la variable dure solo la sesión o sea persistente):

- **Solo la sesión actual de la terminal** (válido si lanzas Claude Code desde esa misma ventana o proceso hijo):

  ```powershell
  $env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:8787'
  ```

  Comprueba: `echo $env:ANTHROPIC_BASE_URL`

- **Usuario de Windows (persistente entre reinicios)** — Útil si inicias Claude Code desde el menú Inicio y debe ver la variable sin abrir `pwsh` antes:

  ```powershell
  [Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'http://127.0.0.1:8787', 'User')
  ```

  Cierra y vuelve a abrir Claude Code (o cierra sesión en Windows) para que cargue el cambio.

En Linux/macOS suele usarse `export ANTHROPIC_BASE_URL=...` en la shell; en cualquier sistema, lo importante es que **el proceso de Claude Code** reciba la variable **al arrancar**.

Efecto práctico: las rutas que el SDK añada (por ejemplo `/v1/messages`) se pedirán a `http://127.0.0.1:8787/v1/...` y este proxy las **reenviará** a la API real. No hace falta repetir `/v1` dos veces si tu herramienta ya lo incluye en la ruta.

### Paso C — Identificar la sesión de auditoría en disco

Con **Claude Code** y el proxy por defecto, las carpetas bajo `sessions/<sessionId>/` suelen **alinearse solas** con la sesión del CLI: el cliente envía `x-claude-code-session-id` (prioridad secundaria o fallback). La cabecera `x-cc-audit-session` solo interviene si el cliente la envía (override; p. ej. `ANTHROPIC_CUSTOM_HEADERS`). Orden y variables en el [README](../README.md#correlación-de-sesión-sessionid).

**Opcional:** si quieres **otro** identificador (por ejemplo un UUID que tú elijas), envía cabeceras extra con **`ANTHROPIC_CUSTOM_HEADERS`**. El formato es: una o más líneas `Nombre: Valor`. Documentación oficial: [variables de entorno de Claude Code](https://code.claude.com/docs/en/env-vars).

Ejemplo de valor (un UUID ficticio):

```text
X-CC-Audit-Session: 550e8400-e29b-41d4-a716-446655440000
```

En **PowerShell 7+**, para la sesión actual:

```powershell
$env:ANTHROPIC_CUSTOM_HEADERS = 'X-CC-Audit-Session: 550e8400-e29b-41d4-a716-446655440000'
```

(Persistencia entre sesiones: `SetEnvironmentVariable` con ámbito `User`, igual que `ANTHROPIC_BASE_URL`.)

Por defecto el proxy **no reenvía al upstream** la cabecera que haya definido el `sessionId` (para no mandar cabeceras arbitrarias al proveedor). Eso se controla con `STRIP_AUDIT_SESSION_HEADER` en el proxy (ver README).

### Paso D — Usar Claude Code con normalidad

Abre tu flujo habitual (proyecto, chat, lo que use la API). Las peticiones pasarán por el proxy mientras **`ANTHROPIC_BASE_URL` apunte al proxy** y el proxy siga en marcha.

### Paso E — Dónde mirar el resultado (dos sitios distintos)

| Qué quieres ver                                         | Dónde está                                                                              | Qué es                                                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Actividad en vivo** (peticiones, respuestas, errores) | Terminal de `npm run dev` y archivo **`server/logs.jsonl`** (relativo al CWD)          | El proxy usa Pino con doble salida: consola formateada para seguir el tráfico al momento, y `server/logs.jsonl` en JSON línea a línea para revisar o filtrar después. Nivel configurable con `LOG_LEVEL` (por defecto `info`). |
| **Copias en disco** por turno                           | Carpeta **`sessions/`** en el ordenador (relativa al CWD desde donde arrancas el proxy) | Árbol por sesión (`sessions/<sessionId>/`): `session-metrics.json`; turnos del chat en `main-agent/interactions/NN/`; preflights y side-requests en `side-interactions/NN/`. Cada interacción incluye `meta.json`, y según el tipo también `input/`, `output/` y `steps/`. Ver esquema abajo y el [README](../README.md#archivos-auditoria). |

Esquema resumido (turno típico del agente principal):

```
sessions/<session-id>/
  session-metrics.json
  main-agent/interactions/NN/
    meta.json
    input/          # petición inicial del turno
    output/         # al cerrar turno SSE: body.json, body.parsed.md, headers.json
    steps/NN/
      request/      # petición de ese step
      response/     # durante SSE: sse.jsonl, headers.json, sse.txt (debug)
                      # al cerrar step: body.json, body.parsed.md
  side-interactions/NN/   # quota warm-up, count_tokens, etc.
    meta.json, steps/NN/request/, steps/NN/response/  # mismas convenciones bajo steps/
```

**Dos árboles bajo cada sesión**

- **`main-agent/interactions/`** — Turnos del chat principal: prompts del usuario, continuaciones con `tool_result` y respuestas SSE del agente. Es lo que sueles abrir para seguir una conversación.
- **`side-interactions/`** — Peticiones auxiliares con contador propio: _preflights_ (`client-preflight`, p. ej. comprobación de cuota o warm-up de caché) y _side-requests_ (p. ej. `count_tokens`, generación de título de sesión). No mezclan su numeración con los turnos del agente principal.

**`session-metrics.json`** (en la raíz de `sessions/<sessionId>/`) agrega tokens por modelo a medida que se cierran turnos; sirve para consultas rápidas (p. ej. statusline) sin reescanear todos los `meta.json`. Esquema y motivación en [`session-metrics-system.md`](./session-metrics-system.md).

La auditoría en disco es incondicional: el proxy siempre escribe en `./sessions`. Los logs de consola y `server/logs.jsonl` dependen de `LOG_LEVEL`.

Para **limpiar** las sesiones acumuladas, ejecuta `npm run clean:sessions`. Para purga completa de todo (build, dependencias, sesiones y logs en `server/`): `npm run clean:all`. El próximo arranque con `npm run dev` recreará los directorios vacíos automáticamente.

---

## Variables que suelen bastar al principio

No hace falta leer la tabla entera del README el primer día:

| Variable                  | Para qué sirve (resumen)                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `PORT`                    | Puerto donde escucha el proxy en tu máquina (por defecto `8787`).                                |
| `UPSTREAM_ORIGIN`         | URL base del API al que el proxy reenvía (por defecto Anthropic).                                |
| `FILTERED_TOOLS`          | Lista de tool names a excluir del request (coma-separado). Sin definir la variable = lista por defecto (7 tools). Para desactivar el filtrado: `FILTERED_TOOLS=` o `FILTERED_TOOLS=""`. |
| `PROXY_UNREDACT_THINKING` | Remueve flag de redacción de thinking para capturar contenido legible (por defecto `false`).     |

La carpeta de salida es siempre `./sessions`, relativa al directorio desde donde ejecutas el proxy.

**Streaming (SSE) en disco:** las rutas siguientes son relativas a cada interacción, p. ej. `sessions/<sessionId>/main-agent/interactions/01/` (o `side-interactions/NN/`).

| Momento | Ruta | Qué contiene |
| ------- | ---- | ------------ |
| Durante el stream | `steps/NN/response/sse.jsonl` | Eventos SSE línea a línea (**fuente de verdad** para reconstruir) |
| Durante el stream | `steps/NN/response/headers.json` | Cabeceras de la respuesta de ese step |
| Durante el stream | `steps/NN/response/sse.txt` | Volcado raw opcional (límite `MAX_AUDIT_SSE_RAW_BYTES`; `0` = ilimitado; no afecta la reconstrucción) |
| Al cerrar cada step | `steps/NN/response/body.json`, `body.parsed.md` | Mensaje del asistente reconstruido **de ese step** |
| Al cerrar el turno (step terminal) | `output/body.json`, `output/body.parsed.md`, `output/headers.json` | Resumen **top-level** del turno (agrega los `body.json` de los steps) |

No existe un directorio `response/` en la raíz de la interacción: `request/` y `response/` solo viven bajo `steps/NN/`. Detalle técnico en [`how-sse-reconstruction-works.md`](./how-sse-reconstruction-works.md).

El resto (límites de tamaño, volcado SSE crudo, etc.) está en la Matriz de Entorno del [README](../README.md#configuracion). Para ver cómo se aplican los límites de memoria y disco usa [Capas de Bytes y Convenciones de Logs](../README.md#capas-bytes-env).

**Perfil rápido (Claude Code):** con `ANTHROPIC_BASE_URL` apuntando al proxy y el proxy en marcha (`npm run dev`), suele bastar correlacionar sesiones con la cabecera por defecto `x-claude-code-session-id` (fallback/segunda prioridad). La correlación de sesión y overrides (`x-cc-audit-session`, etc.) está en el [README: correlación de sesión](../README.md#correlación-de-sesión-sessionid).

---

## Siguientes pasos

- [Variables de entorno](../README.md#configuracion) (matriz completa de configuración).
- [Capas de bytes y convenciones](../README.md#capas-bytes-env) (diagrama y límites en memoria y disco).
- [Correlación de sesión](../README.md#correlación-de-sesión-sessionid) (resolución de session ID y overrides).
- [Archivos de auditoría en disco y `meta.json`](../README.md#archivos-auditoria).
- Entornos con **inspección SSL** (certificados corporativos): párrafo `NODE_EXTRA_CA_CERTS` en el [README](../README.md#configuracion).
- [Estimación de Costos Anthropic](./how-to-calculate-anthropic-api-costs.md) (Ecuación y JSON local de precios).
- [Estimación de Costos OpenRouter](./how-to-calculate-openrouter-api-costs.md) (Esquema ResponseUsage y agregación).
