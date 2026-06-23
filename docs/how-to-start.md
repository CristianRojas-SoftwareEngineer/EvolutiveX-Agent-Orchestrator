# Cómo empezar (on-boarding)

Esta página está pensada para **quien no ha usado este repositorio antes**. No asume que sepas qué es un proxy HTTP ni cómo se configura Claude Code por dentro: si algo te resulta obvio, puedes saltarte ese párrafo.

La referencia técnica completa (tabla de variables, formato de `meta.json`, riesgos) sigue en el [README](../README.md).

---

## ¿Qué es este proyecto? (en pocas palabras)

**Claude Code** (y otros clientes) suelen hablar con la API de Anthropic en internet de forma directa.

Este repositorio es un **programa que se ejecuta en tu ordenador** y hace de **intermediario**:

- Las peticiones de tu cliente **salen primero hacia este programa** (en un puerto de tu máquina).
- El programa **las reenvía** a la API real de Anthropic (`https://api.anthropic.com` por defecto), **sin cambiar** cómo funciona la API.
- A cambio, puedes ver **trazas en la consola** (formato legible vía Pino Pretty) y **copias en disco** de peticiones y respuestas bajo `sessions/` (para cada petición con sesión identificada).

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

   Escribe variables como `ANTHROPIC_BASE_URL` en el entorno de Claude Code para que el tráfico pase por este proxy. Detalle de proveedores soportados en el [README](../README.md#enrutamiento-de-proveedores).

5. **Opcional — instalación unificada (statusline + notificaciones + voz):** para instalar las tres integraciones con Claude Code en un solo paso:

   ```bash
   npm run setup
   ```

   Escribe `statusLine`, hooks de notificación y claves de voz en `~/.claude/settings.json`. **Reinicie Claude Code** tras instalar. Admite `--dry-run` (previsualizar sin escribir), `--uninstall` y flags de feature (`--statusline`, `--notifications`, `--voice`) para operar de forma selectiva. Instaladores individuales para statusline y notificaciones: `npm run install:statusline` y `npm run install:notifications`. La voz no tiene instalador individual: usa `npm run setup --voice`.

   El diseño del statusline está en [router-statusline.md](./router-statusline.md); el servicio de notificaciones en [notifications.md](./notifications.md).

6. **Opcional:** configura variables de entorno para desarrollo local usando un archivo `.env`:

   a. Copia el archivo de referencia dentro de la carpeta `configs/`:

   ```bash
   cp configs/.env.example configs/.env
   ```

   En **PowerShell**:

   ```powershell
   Copy-Item configs/.env.example configs/.env
   ```

   b. Abre `configs/.env` y edita solo las variables que quieras cambiar. Las que no definas tomarán su valor por defecto del código (ver la [tabla de variables](#variables-que-suelen-bastar-al-principio) y el [README](../README.md#configuracion)).

   El archivo `configs/.env` está en `.gitignore` (no se sube al repositorio). El archivo [`configs/.env.example`](../configs/.env.example) sí está versionado y sirve de guía: muestra todas las variables disponibles con sus valores por defecto.

   **¿Cómo se carga?** El script `npm run dev` usa el flag nativo de Node.js `--env-file-if-exists=configs/.env` (disponible desde Node v22.9; Node v24+ recomendado). A diferencia de `--env-file`, este flag **no falla** si el archivo `.env` no existe: el proxy arranca igualmente con los valores por defecto del código. **El script `npm start` (producción) no carga `.env`** a propósito: en producción las variables se inyectan en el entorno del sistema directamente.

7. **Opcional:** puedes verificar que el código compila sin errores antes de arrancar:

   ```bash
   npm run build
   ```

   El proyecto incluye un script de validación integral (`npm test`) que ejecuta el análisis estático (`lint`), la validación de tipos (`typecheck`), las pruebas unitarias (`test:unit`, Vitest) y la compilación (`build`) para asegurar la exactitud funcional y la integridad del código TypeScript. Se recomienda ejecutarlo antes de cada despliegue relevante.

8. **Opcional — compatibilidad multi-agente:** Si usas otros agentes de código además de Claude Code (Codex CLI, Copilot, Cursor, etc.), puedes crear un hardlink `AGENTS.md` → `CLAUDE.md` para que también lean las instrucciones del proyecto:

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

3. Comprueba el arranque: en la **terminal** debería aparecer el mensaje `Proxy levantado correctamente` con campos como `port`, `upstream`, `upstreamAcceptEncoding` (siempre `identity`), `maxAuditBytes`, `maxResponseBufferBytes` (derivado internamente) y `logLevel` (salida legible vía Pino Pretty; no es JSON compacto). En **`server/logs.jsonl`** el mismo evento queda como **una línea JSON** (`event: "listening"`). También verás líneas previas de Fastify del tipo `Server listening at http://127.0.0.1:8787` (y, al escuchar en `0.0.0.0`, pueden listarse otras interfaces de red) — son normales. Si aparece `Proxy levantado correctamente`, el proxy está escuchando en tu PC (lista de variables en el [README](../README.md#configuracion)).

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

Con **Claude Code** y el proxy por defecto, las carpetas bajo `sessions/<sessionId>/` suelen **alinearse solas**: el proxy resuelve el ID en este orden — **(1)** cabecera de override `x-cc-audit-session` si el cliente la envía (p. ej. vía `ANTHROPIC_CUSTOM_HEADERS`); **(2)** cabecera de fallback `x-claude-code-session-id` (la que envía Claude Code por defecto); **(3)** si ninguna está presente, la petición no genera árbol de auditoría (`_unknown`). Detalle y variables en el [README](../README.md#correlación-de-sesión-sessionid).

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

Por defecto el proxy **no reenvía al upstream** la cabecera que haya definido el `sessionId` (comportamiento fijo; ver [`advanced-configuration.md`](advanced-configuration.md)).

### Paso D — Usar Claude Code con normalidad

Abre tu flujo habitual (proyecto, chat, lo que use la API). Las peticiones pasarán por el proxy mientras **`ANTHROPIC_BASE_URL` apunte al proxy** y el proxy siga en marcha.

### Paso E — Dónde mirar el resultado (dos sitios distintos)

| Qué quieres ver                                         | Dónde está                                                                              | Qué es                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Actividad en vivo** (peticiones, respuestas, errores) | Terminal de `npm run dev` y archivo **`server/logs.jsonl`** (relativo al CWD)           | Consola: Pino Pretty (legible). Archivo: JSON línea a línea en `server/logs.jsonl` para revisar o filtrar después. Nivel configurable con `LOG_LEVEL` (por defecto `info`).                                                                                                                                                                                                    |
| **Copias en disco** por turno                           | Carpeta **`sessions/`** en el ordenador (relativa al CWD desde donde arrancas el proxy) | Árbol por sesión: `workflows/NN/` (layout `causal-workflows-v1`, índices base 1: `01`, `02`, …). **Un workflow por turno** de usuario; hops HTTP (`agentic`, `side-request`) son **steps** bajo ese workflow (`steps/MM/`). Los preflights no se auditan en disco. Referencia en [`session-audit-model.md` §0](./session-audit-model.md#0-layout-vigente-causal-workflows-v1). |

**Estructura bajo cada sesión (P1)**

- **`workflows/NN/`** — Cada turno de usuario: `meta.json`, `steps/MM/`, `tools/KK-slug/`, `output/result.json` al cerrar (hook `Stop`).
- El tipo semántico del turno (`agentic` o `side-request` en el primer hop) queda en `meta.json` (`interactionType`); cada hop conserva `stepKind` en metadatos del step. Los preflights no generan carpetas. Layout flat retirado; ver Apéndice A del modelo de auditoría.

**`session-metrics.json`** (en la raíz de `sessions/<sessionId>/`) agrega tokens por modelo a medida que se cierran turnos; sirve para consultas rápidas (p. ej. statusline) sin reescanear todos los `meta.json`. Esquema y motivación en [`session-metrics-system.md`](./session-metrics-system.md).

La auditoría en disco **no se puede desactivar por variable de entorno**: para cada petición con sesión identificada, el proxy escribe bajo `./sessions` (relativo al CWD). Las peticiones **sin** cabecera de sesión válida (p. ej. comprobaciones `HEAD /` antes de abrir sesión en Claude Code) se reenvían pero **no** crean carpetas en `sessions/`. Los logs de consola y `server/logs.jsonl` dependen de `LOG_LEVEL`.

Para **limpiar** las sesiones acumuladas, ejecuta `npm run clean:sessions`. Para purga completa de todo (build, dependencias, sesiones y logs en `server/`): `npm run clean:all`. Tras `clean:all`, el próximo `npm run dev` recrea `server/` y la raíz `sessions/` (con `.gitkeep`); las subcarpetas por sesión aparecen cuando hay tráfico auditado con cabecera de sesión válida.

---

## Variables que suelen bastar al principio

No hace falta leer la tabla entera del README el primer día:

| Variable                  | Para qué sirve (resumen)                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                    | Puerto donde escucha el proxy en tu máquina (por defecto `8787`).                                                                                                                       |
| `UPSTREAM_ORIGIN`         | URL base del API al que el proxy reenvía (por defecto Anthropic).                                                                                                                       |
| `MAX_REQUEST_BODY`        | Tamaño máximo del body que Fastify acepta en memoria (por defecto `50mb`).                                                                                                              |
| `MAX_AUDIT_BYTES`         | Tope único de volcado en disco bajo `sessions/` (request, response, `sse.txt` raw; default 50 MiB).                                                                                     |
| `LOG_LEVEL`               | Nivel de logs en consola y `server/logs.jsonl` (por defecto `info`).                                                                                                                    |
| `FILTERED_TOOLS`          | Lista de tool names a excluir del request (coma-separado). Sin definir la variable = lista por defecto (7 tools). Para desactivar el filtrado: `FILTERED_TOOLS=` o `FILTERED_TOOLS=""`. |
| `PROXY_UNREDACT_THINKING` | Remueve flag de redacción de thinking para capturar contenido legible (por defecto `false`).                                                                                            |

La carpeta de salida es siempre `./sessions`, relativa al directorio desde donde ejecutas el proxy.

**Streaming (SSE) en disco:** `workflows/NN/steps/MM/response/sse.jsonl` es la fuente de verdad (escritura vía `ISseAuditWriter` hasta P2); al cerrar el workflow se escribe `output/result.json`. Layout en [`session-audit-model.md` §0](./session-audit-model.md#0-layout-vigente-causal-workflows-v1); reconstrucción en [`how-sse-reconstruction-works.md`](./how-sse-reconstruction-works.md).

Cabeceras de sesión, compresión hacia upstream (`identity` fijo) y ajustes finos de buffer en memoria no son variables de entorno: véase [`advanced-configuration.md`](./advanced-configuration.md). Matriz completa en el [README](../README.md#configuracion).

**Perfil rápido (Claude Code):** con `ANTHROPIC_BASE_URL` apuntando al proxy y el proxy en marcha (`npm run dev`), suele bastar la cabecera de fallback `x-claude-code-session-id` (prioridad 2); el override `x-cc-audit-session` (prioridad 1) solo aplica si la envías explícitamente. Detalle en el [README: correlación de sesión](../README.md#correlación-de-sesión-sessionid).

---

## Siguientes pasos

- [Variables de entorno](../README.md#configuracion) (matriz completa de configuración).
- [Configuración avanzada](./advanced-configuration.md) (constantes internas: cabeceras, gzip, buffer derivado).
- [Capas de bytes y convenciones](../README.md#capas-bytes-env) (truncado en memoria y disco).
- [Correlación de sesión](../README.md#correlación-de-sesión-sessionid) (resolución de session ID y overrides).
- [Modelo de auditoría de sesiones (`session-audit-model.md`)](./session-audit-model.md) — referencia canónica del layout en `sessions/`.
- [Archivos de auditoría (resumen)](../README.md#archivos-auditoria).
- Entornos con **inspección SSL** (certificados corporativos): párrafo `NODE_EXTRA_CA_CERTS` en el [README](../README.md#configuracion).
- [Peticiones sin sesión (pre-sesión)](./health-check-handling.md) (por qué algunas peticiones no escriben en `sessions/`).
