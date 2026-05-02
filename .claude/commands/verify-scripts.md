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

## Grafo de dependencias

```
node_modules/  ← prerequisito de TODOS los comandos npm
     │
     ├── help, configure:provider, lint, typecheck, test:unit, test:integration  (solo lectura)
     ├── format, lint:fix                                                          (mutan src/*.ts)
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
- Los scripts de solo lectura van primero (no alteran estado): `help`, `configure:provider`, `lint`, `typecheck`, `test:unit`, `test:integration`.
- Los mutadores de código (`format`, `lint:fix`) van antes de `build` para que este compile el código ya normalizado.
- `build` va antes de `start` (genera `dist/`).
- `dev` y `test:watch` no dependen de `dist/` pero se ejecutan junto a `start` por ser procesos de larga duración.
- `clean:sessions` y `clean:logs` van antes de `clean` porque necesitan `node_modules/` (usan `concurrently` implícitamente vía npm).
- `clean` es el último script verificado porque destruye `node_modules/` y `dist/`.
- `clean:modules` se omite (SKIPPED) porque `clean` ya lo ejecuta internamente.
- Tras `clean`, se restaura el workspace con `npm install` + `npm run build`.

---

## Terminación de procesos background

Los pasos 12 (`start`), 13 (`dev`) y 14 (`test:watch`) lanzan procesos persistentes. Tras verificar el arranque de cada uno, **terminar el proceso antes de continuar al siguiente paso**:

- **Pasos 12 y 13** (servidores en puerto 8787) — matar por puerto:
  - **Windows**: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess) -Force -ErrorAction SilentlyContinue`
  - **Linux/macOS**: `kill $(lsof -t -i :8787) 2>/dev/null`
  - Confirmar que el puerto quedó libre antes de avanzar al siguiente paso de servidor.
- **Paso 14** (vitest watch) — matar por nombre de proceso:
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

### Paso 2 — `lint`
```bash
npm run lint
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar cantidad de errores y warnings por separado.

### Paso 2.5 — `configure:provider`
```bash
npm run configure:provider -- --show-current
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que imprime el estado actual de variables Claude Code y providers disponibles.
- **Nota**: se usa `--show-current` para evitar interactividad y validar solo el modo informativo.

### Paso 3 — `test:unit`
```bash
npm run test:unit
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar `X/Y tests passed` y cantidad de archivos de test.

### Paso 4 — `test:integration`
```bash
npm run test:integration
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar tests pasados/fallidos. Actualmente comparte config con `test:unit`.

### Paso 5 — `typecheck`
```bash
npm run typecheck
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar errores de tipos si existen.

### Paso 6 — `format`
```bash
npm run format
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar qué archivos fueron modificados (los que NO dicen `(unchanged)`).

### Paso 7 — `lint:fix`
```bash
npm run lint:fix
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar warnings residuales (los no auto-corregibles).

### Paso 8 — `clean:dist`
```bash
npm run clean:dist
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `dist/` ya no existe.

### Paso 9 — `build:js`
```bash
npm run build:js
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que se generó `dist/index.js`. Anotar tamaño reportado por tsup.

### Paso 10 — `build:types`
```bash
npm run build:types
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que se generaron archivos `.d.ts` en `dist/`.

### Paso 11 — `build`
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `clean:dist` → (`build:js` ∥ `build:types`). Confirmar que las tres sub-tareas reportan exit 0.

### Paso 11.5 — `test:quick`
```bash
npm run test:quick
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `lint‖typecheck` → `test:unit` (sin fase de build).

### Paso 12 — `test`
```bash
npm test
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `lint‖typecheck` → `test:unit` → `build` (fases paralelas en etapa 1).

### Paso 13 — `start`
```bash
npm start
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `Proxy levantado correctamente` o `Server listening`.
- **Tras verificar**: terminar el proceso por puerto (ver sección "Terminación de procesos background").
- Si el puerto está ocupado, marcar como ❌ FAIL con nota "puerto en uso".

### Paso 14 — `dev`
```bash
npm run dev
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `Proxy levantado correctamente` o `Server listening`.
- **Antes de lanzar**: confirmar que el puerto 8787 está libre (el paso 12 fue terminado correctamente).
- **Tras verificar**: terminar el proceso por puerto (ver sección "Terminación de procesos background").

### Paso 15 — `test:watch`
```bash
npm run test:watch
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `PASS  Waiting for file changes` o `press h to show help, press q to quit`.
- **Tras verificar**: terminar el proceso por nombre (ver sección "Terminación de procesos background").

### Paso 16 — `clean:sessions`
```bash
npm run clean:sessions
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Borra el directorio `sessions/` (o el configurado en `AUDIT_SESSIONS_DIR` vía `configs/.env`). No falla si no existe gracias a `force: true`.

### Paso 16.5 — `clean:logs`
```bash
npm run clean:logs
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `logs/` ha sido eliminado. No falla si no existe gracias a `force: true`.

### Paso 17 — `clean:modules` (SKIPPED)
- **No ejecutar**. El script `clean` (paso 17) ejecuta `clean:dist` y `clean:modules` en paralelo, por lo que este paso ya queda cubierto.
- **Registrar**: ⏭️ SKIPPED — cubierto por `clean` en paso 17.

### Paso 17.5 — `clean:all`
```bash
npm run clean:all
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que los 4 directorios (`dist/`, `node_modules/`, `sessions/`, `logs/`) han sido eliminados. Ejecuta los 4 clean en paralelo.
- **ADVERTENCIA**: después de este paso, ningún script npm puede ejecutarse hasta restaurar `node_modules/`.

### Paso 18 — `clean`
```bash
npm run clean
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que tanto `dist/` como `node_modules/` han sido eliminados.
- **ADVERTENCIA**: después de este paso, ningún script npm puede ejecutarse hasta restaurar `node_modules/`.

---

## Restauración del workspace

Inmediatamente después del paso 17, restaurar el entorno:

### Paso 19 — Restaurar dependencias
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0, que `node_modules/` existe, y que no hay vulnerabilidades críticas.

### Paso 20 — Restaurar artefactos de compilación
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `dist/` existe con `index.js` y archivos `.d.ts`.

---

## Informe final

Al terminar todos los pasos, producir una tabla resumen con el siguiente formato:

```
| #  | Script              | Estado | Exit Code | Observaciones                                  |
|----|---------------------|--------|-----------|-----------------------------------------------|
| 1  | help                | ✅     | 0         | Panel impreso correctamente                    |
| 2  | lint                | ✅     | 0         | 0 errores, 2 warnings                           |
| 2.5| configure:provider | ✅     | 0         | Estado actual impreso correctamente              |
| 3  | test:unit           | ✅     | 0         | 32/32 tests, 8 archivos                        |
| 4  | test:integration    | ✅     | 0         | 32/32 tests, 8 archivos                        |
| 5  | typecheck           | ✅     | 0         | 0 errores de tipos                             |
| 6  | format              | ✅     | 0         | 2 archivos reformateados                        |
| 7  | lint:fix            | ✅     | 0         | 2 warnings no auto-corregibles                |
| 8  | clean:dist          | ✅     | 0         | dist/ eliminado                                |
| 9  | build:js            | ✅     | 0         | dist/index.js 48 KB ESM                       |
| 10 | build:types         | ✅     | 0         | 15 archivos .d.ts                             |
| 11 | build               | ✅     | 0         | 3 sub-tareas exit 0                           |
| 11.5| test:quick          | ✅     | 0         | lint‖typecheck + tests OK (sin build)         |
| 12 | test                | ✅     | 0         | lint‖typecheck → tests → build OK             |
| 13 | start               | ✅     | —         | Proxy levantado, puerto 8787                  |
| 14 | dev                 | ✅     | —         | Proxy levantado (tsx), puerto 8787            |
| 15 | test:watch          | ✅     | —         | Vitest watch mode activo                       |
| 16 | clean:sessions      | ✅     | 0         | sessions/ limpiado                            |
| 16.5| clean:logs         | ✅     | 0         | logs/ limpiado                                |
| 17 | clean:modules       | ⏭️     | —         | Cubierto por clean (paso 18)                  |
| 17.5| clean:all          | ✅     | 0         | 4 directorios eliminados en paralelo          |
| 18 | clean               | ✅     | 0         | dist/ y node_modules/ eliminados              |
| 19 | npm install         | ✅     | 0         | Workspace restaurado                          |
| 20 | npm run build       | ✅     | 0         | dist/ regenerado                              |
```

Incluir al final un resumen de una línea:
- **Total**: X/22 scripts PASS, Y FAIL, Z SKIPPED.
- **Workspace**: restaurado correctamente / con errores de restauración.
