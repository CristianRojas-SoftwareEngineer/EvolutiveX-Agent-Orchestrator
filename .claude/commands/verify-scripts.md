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
     ├── help, lint, test:unit, test:integration  (solo lectura)
     ├── format, lint:fix                          (mutan src/*.ts)
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
             clean:sessions  (borra sessions/, no afecta nada más)
                │
             clean   (borra dist/ + node_modules/ → ÚLTIMA posición)
```

**Reglas de orden derivadas del grafo:**
- Los scripts de solo lectura van primero (no alteran estado).
- Los mutadores de código (`format`, `lint:fix`) van antes de `build` para que este compile el código ya normalizado.
- `build` va antes de `start` (genera `dist/`).
- `dev` y `test:watch` no dependen de `dist/` pero se ejecutan junto a `start` por ser procesos de larga duración.
- `clean:sessions` va antes de `clean` porque necesita `node_modules/` (usa `concurrently` implícitamente vía npm).
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

### Paso 5 — `format`
```bash
npm run format
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar qué archivos fueron modificados (los que NO dicen `(unchanged)`).

### Paso 6 — `lint:fix`
```bash
npm run lint:fix
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Anotar warnings residuales (los no auto-corregibles).

### Paso 7 — `clean:dist`
```bash
npm run clean:dist
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `dist/` ya no existe.

### Paso 8 — `build:js`
```bash
npm run build:js
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que se generó `dist/index.js`. Anotar tamaño reportado por tsup.

### Paso 9 — `build:types`
```bash
npm run build:types
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que se generaron archivos `.d.ts` en `dist/`.

### Paso 10 — `build`
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `clean:dist` → (`build:js` ∥ `build:types`). Confirmar que las tres sub-tareas reportan exit 0.

### Paso 11 — `test`
```bash
npm test
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Orquesta: `lint` → `test:unit` → `build`. Confirmar que las tres fases pasan.

### Paso 12 — `start`
```bash
npm start
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `Proxy levantado correctamente` o `Server listening`.
- **Tras verificar**: terminar el proceso por puerto (ver sección "Terminación de procesos background").
- Si el puerto está ocupado, marcar como ❌ FAIL con nota "puerto en uso".

### Paso 13 — `dev`
```bash
npm run dev
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `Proxy levantado correctamente` o `Server listening`.
- **Antes de lanzar**: confirmar que el puerto 8787 está libre (el paso 12 fue terminado correctamente).
- **Tras verificar**: terminar el proceso por puerto (ver sección "Terminación de procesos background").

### Paso 14 — `test:watch`
```bash
npm run test:watch
```
- **Tipo**: no-bloqueante (background)
- **Verificar**: esperar hasta 15 segundos buscando en stdout/stderr el texto `PASS  Waiting for file changes` o `press h to show help, press q to quit`.
- **Tras verificar**: terminar el proceso por nombre (ver sección "Terminación de procesos background").

### Paso 15 — `clean:sessions`
```bash
npm run clean:sessions
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0. Borra el directorio `sessions/` (o el configurado en `AUDIT_SESSIONS_DIR` vía `configs/.env`). No falla si no existe gracias a `force: true`.

### Paso 16 — `clean:modules` (SKIPPED)
- **No ejecutar**. El script `clean` (paso 17) ejecuta `clean:dist` y `clean:modules` en paralelo, por lo que este paso ya queda cubierto.
- **Registrar**: ⏭️ SKIPPED — cubierto por `clean` en paso 17.

### Paso 17 — `clean`
```bash
npm run clean
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que tanto `dist/` como `node_modules/` han sido eliminados.
- **ADVERTENCIA**: después de este paso, ningún script npm puede ejecutarse hasta restaurar `node_modules/`.

---

## Restauración del workspace

Inmediatamente después del paso 17, restaurar el entorno:

### Paso 18 — Restaurar dependencias
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0, que `node_modules/` existe, y que no hay vulnerabilidades críticas.

### Paso 19 — Restaurar artefactos de compilación
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit code 0 y que `dist/` existe con `index.js` y archivos `.d.ts`.

---

## Informe final

Al terminar todos los pasos, producir una tabla resumen con el siguiente formato:

```
| #  | Script           | Estado | Exit Code | Observaciones                    |
|----|------------------|--------|-----------|----------------------------------|
| 1  | help             | ✅     | 0         | Panel impreso correctamente      |
| 2  | lint             | ✅     | 0         | 0 errores, 2 warnings            |
| 3  | test:unit        | ✅     | 0         | 32/32 tests, 8 archivos          |
| 4  | test:integration | ✅     | 0         | 32/32 tests, 8 archivos          |
| 5  | format           | ✅     | 0         | 2 archivos reformateados         |
| 6  | lint:fix         | ✅     | 0         | 2 warnings no auto-corregibles   |
| 7  | clean:dist       | ✅     | 0         | dist/ eliminado                  |
| 8  | build:js         | ✅     | 0         | dist/index.js 48 KB ESM          |
| 9  | build:types      | ✅     | 0         | 15 archivos .d.ts                |
| 10 | build            | ✅     | 0         | 3 sub-tareas exit 0              |
| 11 | test             | ✅     | 0         | lint + tests + build OK          |
| 12 | start            | ✅     | —         | Proxy levantado, puerto 8787     |
| 13 | dev              | ✅     | —         | Proxy levantado (tsx), puerto 8787 |
| 14 | test:watch       | ✅     | —         | Vitest watch mode activo         |
| 15 | clean:sessions   | ✅     | 0         | sessions/ limpiado               |
| 16 | clean:modules    | ⏭️     | —         | Cubierto por clean (paso 17)     |
| 17 | clean            | ✅     | 0         | dist/ y node_modules/ eliminados |
| 18 | npm install      | ✅     | 0         | Workspace restaurado             |
| 19 | npm run build    | ✅     | 0         | dist/ regenerado                 |
```

Incluir al final un resumen de una línea:
- **Total**: X/17 scripts PASS, Y FAIL, Z SKIPPED.
- **Workspace**: restaurado correctamente / con errores de restauración.
