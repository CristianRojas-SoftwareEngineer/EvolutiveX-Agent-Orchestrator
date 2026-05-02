# Verificación completa de scripts de package.json

Ejecuta **todos** los scripts definidos en `package.json` en un orden seguro basado en el grafo de dependencias, captura salida/errores de cada uno y produce un informe final de estado. El workspace queda funcional al terminar.

---

## Prerequisitos

Antes de ejecutar cualquier script:

1. Leer `package.json` y extraer la lista completa de scripts disponibles.
2. Verificar que `node_modules/` existe. Si no existe, ejecutar `npm install` (bloqueante) antes de continuar.
3. Verificar que el puerto del proyecto (default `8787`) no está ocupado:
   - **Windows**: `netstat -ano | findstr :8787`
   - **Linux/macOS**: `lsof -i :8787`
   - Si está ocupado, reportar advertencia pero continuar.

---

## ⚠️ Requisito Mandatorio

**Este procedimiento debe ejecutar TODOS los scripts definidos en `package.json` sin excepciones ni skipping.**

El propósito de `verify-scripts.md` es la validación exhaustiva del conjunto completo de scripts. Cada script debe tener su paso de verificación correspondiente ejecutado explícitamente. No se permite "skipear" ni omitir scripts bajo ninguna justificación, incluyendo:

- Scripts que "ya fueron probados indirectamente" por otros pasos
- Scripts que "son redundantes" con otros pasos
- Scripts de limpieza que "destruyen el workspace"

Si un script destruye `node_modules/` o `dist/`, el procedimiento debe incluir los pasos de restauración necesarios para continuar con las verificaciones restantes.

---

## Grafo de dependencias

```
node_modules/  ← prerequisito de TODOS los comandos npm
     │
     ├── help, configure:provider, create:agents-reference  (solo lectura)
     ├── lint, typecheck, test:unit, test:integration     (solo lectura)
     ├── format, lint:fix                                  (mutan src/*.ts)
     │
     ├── clean:dist ──┐
     ├── build:js ────┤← requieren src/ + node_modules/
     ├── build:types ─┤
     └── build ───────┘ (clean:dist → build:js ∥ build:types)
                │
                ▼
             dist/  ← prerequisito de start
                │
             start    (servidor Fastify desde dist/)
             dev      (servidor Fastify con tsx, no necesita dist/)
             test:watch (proceso interactivo vitest)
                │
             clean:sessions, clean:logs  (borran sessions/ y logs/, no afecta nada más)
                │
             clean:all  (borra dist/ + node_modules/ + sessions/ + logs/ en paralelo)
                │
             clean   (borra dist/ + node_modules/)
```

**Reglas de orden derivadas del grafo:**
- Los scripts de solo lectura van primero (no alteran estado): `help`, `configure:provider`, `create:agents-reference`, `lint`, `typecheck`, `test:unit`, `test:integration`.
- Los mutadores de código (`format`, `lint:fix`) van antes de `build` para que este compile el código ya normalizado.
- `build` va antes de `start` (genera `dist/`).
- `dev` y `test:watch` no dependen de `dist/` pero se ejecutan junto a `start` por ser procesos de larga duración.
- `clean:sessions` y `clean:logs` van antes de los clean nucleares.
- `clean:modules` se ejecuta explícitamente (no se skipea) antes de `clean` y `clean:all`.
- `clean` y `clean:all` destruyen `node_modules/` y requieren restauración posterior.
- Cada script destructivo (`clean:modules`, `clean:all`, `clean`) va seguido de un paso de restauración `npm install` para que los scripts siguientes puedan ejecutarse.

---

## Terminación de procesos background

Los pasos 16 (`start`), 17 (`dev`) y 18 (`test:watch`) lanzan procesos persistentes. Tras verificar el arranque de cada uno, **terminar el proceso antes de continuar al siguiente paso**:

- **Pasos 16 y 17** (servidores en puerto 8787) — matar por puerto:
  - **Windows**: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess) -Force -ErrorAction SilentlyContinue`
  - **Linux/macOS**: `kill $(lsof -t -i :8787) 2>/dev/null`
  - Confirmar que el puerto quedó libre antes de avanzar al siguiente paso de servidor.
- **Paso 18** (vitest watch) — matar por nombre de proceso:
  - **Windows**: `Stop-Process -Id (Get-Process | Where-Object {$_.CommandLine -like "*vitest*"} | Select-Object -First 1 -ExpandProperty Id) -Force -ErrorAction SilentlyContinue`
  - **Linux/macOS**: `pkill -f vitest 2>/dev/null`

---

## Orden de ejecución

Ejecutar los siguientes pasos **secuencialmente**, uno por uno. Para cada paso:
- Ejecutar el comando indicado.
- Capturar el exit code.
- Registrar el resultado: ✅ PASS (exit 0), ❌ FAIL (exit ≠ 0), o ⏭️ SKIPPED (con justificación).
- Anotar observaciones relevantes (warnings, errores parciales, duración notable).
- **No detenerse ante fallos**: continuar con el siguiente paso y reportar todo al final.

### Paso 1 — `help`
```bash
npm run help
```
- **Tipo**: bloqueante
- **Verificar**: que imprime el panel de referencia de scripts en stdout sin errores.

### Paso 2 — `configure:provider`
```bash
npm run configure:provider -- --show-current
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que imprime el estado actual de variables Claude Code y providers disponibles.
- **Nota**: se usa `--show-current` para evitar interactividad y validar solo el modo informativo.

### Paso 3 — `create:agents-reference`
```bash
npm run create:agents-reference
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Crea o recrea el hardlink `AGENTS.md` → `CLAUDE.md`.

### Paso 4 — `lint`
```bash
npm run lint
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar cantidad de errores y warnings por separado.

### Paso 5 — `typecheck`
```bash
npm run typecheck
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar errores de tipos si existen.

### Paso 6 — `test:unit`
```bash
npm run test:unit
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar `X/Y tests passed` y cantidad de archivos de test.

### Paso 7 — `test:integration`
```bash
npm run test:integration
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar tests pasados/fallidos. Actualmente comparte config con `test:unit`.

### Paso 8 — `format`
```bash
npm run format
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar qué archivos fueron modificados (los que NO dicen `(unchanged)`).

### Paso 9 — `lint:fix`
```bash
npm run lint:fix
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar warnings residuales (los no auto-corregibles).

### Paso 10 — `clean:dist`
```bash
npm run clean:dist
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `dist/` ya no existe.

### Paso 11 — `build:js`
```bash
npm run build:js
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que se generó `dist/index.js`. Anotar tamaño reportado por tsup.

### Paso 12 — `build:types`
```bash
npm run build:types
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que se generaron archivos `.d.ts` en `dist/`.

### Paso 13 — `build`
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `clean:dist` → (`build:js` ∥ `build:types`). Confirmar que las tres sub-tareas reportan exit 0.

### Paso 14 — `test:quick`
```bash
npm run test:quick
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `lint‖typecheck` → `test:unit` (sin fase de build).

### Paso 15 — `test`
```bash
npm test
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `lint‖typecheck` → `test:unit` → `build` (fases paralelas en etapa 1).

### Paso 16 — `start`
```bash
npm start
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `Proxy levantado correctamente` o `Server listening`.
- **Tras verificar**: terminar el proceso por puerto (ver sección "Terminación de procesos background").
- Si el puerto está ocupado, marcar como ❌ FAIL con nota "puerto en uso".

### Paso 17 — `dev`
```bash
npm run dev
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `Proxy levantado correctamente` o `Server listening`.
- **Antes de lanzar**: confirmar que el puerto 8787 está libre (el paso 16 fue terminado correctamente).
- **Tras verificar**: terminar el proceso por puerto (ver sección "Terminación de procesos background").

### Paso 18 — `test:watch`
```bash
npm run test:watch
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `PASS  Waiting for file changes` o `press h to show help, press q to quit`.
- **Tras verificar**: terminar el proceso por nombre (ver sección "Terminación de procesos background").

### Paso 19 — `clean:sessions`
```bash
npm run clean:sessions
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Borra el directorio `sessions/` (o el configurado en `AUDIT_SESSIONS_DIR` vía `configs/.env`). No falla si no existe gracias a `force: true`.

### Paso 20 — `clean:logs`
```bash
npm run clean:logs
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `logs/` ha sido eliminado. No falla si no existe gracias a `force: true`.

### Paso 21 — `clean:modules`
```bash
npm run clean:modules
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `node_modules/` ha sido eliminado.

### Paso 22 — Restaurar dependencias
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `node_modules/` existe.
- **Justificación**: `clean:modules` destruyó `node_modules/`. Los scripts siguientes (`clean:all`, `clean`) dependen de paquetes como `concurrently` que residen en `node_modules/`.

### Paso 23 — `clean:all`
```bash
npm run clean:all
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que los 4 directorios (`dist/`, `node_modules/`, `sessions/`, `logs/`) han sido eliminados. Ejecuta los 4 clean en paralelo.

### Paso 24 — Restaurar dependencias
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `node_modules/` existe.
- **Justificación**: `clean:all` destruyó `node_modules/`. El paso siguiente (`clean`) requiere `concurrently` para ejecutarse.

### Paso 25 — `clean`
```bash
npm run clean
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que tanto `dist/` como `node_modules/` han sido eliminados.

### Paso 26 — Restaurar dependencias
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `node_modules/` existe.
- **Justificación**: `clean` destruyó `node_modules/`. El paso siguiente (`npm run build`) requiere `tsup`, `tsc` y `concurrently`.

### Paso 27 — Restaurar artefactos de compilación
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `dist/` existe con `index.js` y archivos `.d.ts`.

---

## Informe final

Al terminar todos los pasos, producir una tabla resumen con el siguiente formato:

```
| #  | Script                  | Estado | Exit Code | Observaciones                              |
|----|-------------------------|--------|-----------|-------------------------------------------|
| 1  | help                    | ✅     | 0         | Panel impreso correctamente               |
| 2  | configure:provider      | ✅     | 0         | Estado actual impreso correctamente       |
| 3  | create:agents-reference | ✅     | 0         | Hardlink AGENTS.md creado                 |
| 4  | lint                    | ✅     | 0         | 0 errores, 2 warnings                     |
| 5  | typecheck               | ✅     | 0         | 0 errores de tipos                        |
| 6  | test:unit               | ✅     | 0         | 32/32 tests, 8 archivos                   |
| 7  | test:integration        | ✅     | 0         | 32/32 tests, 8 archivos                   |
| 8  | format                  | ✅     | 0         | 2 archivos reformateados                  |
| 9  | lint:fix                | ✅     | 0         | 2 warnings no auto-corregibles            |
| 10 | clean:dist              | ✅     | 0         | dist/ eliminado                           |
| 11 | build:js                | ✅     | 0         | dist/index.js 48 KB ESM                   |
| 12 | build:types             | ✅     | 0         | 15 archivos .d.ts                         |
| 13 | build                   | ✅     | 0         | 3 sub-tareas exit 0                       |
| 14 | test:quick              | ✅     | 0         | lint‖typecheck + tests OK (sin build)     |
| 15 | test                    | ✅     | 0         | lint‖typecheck → tests → build OK         |
| 16 | start                   | ✅     | —         | Proxy levantado, puerto 8787              |
| 17 | dev                     | ✅     | —         | Proxy levantado (tsx), puerto 8787        |
| 18 | test:watch              | ✅     | —         | Vitest watch mode activo                  |
| 19 | clean:sessions          | ✅     | 0         | sessions/ limpiado                        |
| 20 | clean:logs              | ✅     | 0         | logs/ limpiado                            |
| 21 | clean:modules           | ✅     | 0         | node_modules/ eliminado                   |
| 22 | npm install             | ✅     | 0         | Dependencias restauradas                  |
| 23 | clean:all               | ✅     | 0         | 4 directorios eliminados en paralelo      |
| 24 | npm install             | ✅     | 0         | Dependencias restauradas                  |
| 25 | clean                   | ✅     | 0         | dist/ y node_modules/ eliminados          |
| 26 | npm install             | ✅     | 0         | Dependencias restauradas                  |
| 27 | npm run build           | ✅     | 0         | dist/ regenerado                          |
```

Incluir al final un resumen de una línea:
- **Total**: X/27 pasos PASS, Y FAIL.
- **Scripts verificados**: 23/23 de package.json (100% cobertura).
- **Workspace**: restaurado correctamente / con errores de restauración.
