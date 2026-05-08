---
auto_execution_mode: 3
description: Ejecuta todos los scripts de package.json en orden seguro basado en el grafo de dependencias, captura salida/errores de cada uno y produce un informe final de estado.
---

# Workflow: Verificación completa de scripts de package.json

Este workflow ejecuta **todos** los scripts definidos en `package.json` en un orden seguro basado en el grafo de dependencias, captura salida/errores de cada uno y produce un informe final de estado. El workspace queda funcional al terminar.

## Prerequisitos

Antes de ejecutar cualquier script:

1. Leer `package.json` y extraer la lista completa de scripts disponibles.
2. Verificar que `node_modules/` existe. Si no existe, ejecutar `npm install` (bloqueante) antes de continuar.
3. Verificar que el puerto del proyecto (default `8787`) no está ocupado:
   - **Windows**: `netstat -ano | findstr :8787`
   - **Linux/macOS**: `lsof -i :8787`
   - Si está ocupado, reportar advertencia pero continuar.

## ⚠️ Requisito Mandatorio

**Este procedimiento debe ejecutar TODOS los scripts definidos en `package.json` sin excepciones ni skipping.**

El propósito de este workflow es la validación exhaustiva del conjunto completo de scripts. Cada script debe tener su paso de verificación correspondiente ejecutado explícitamente. No se permite "skipear" ni omitir scripts bajo ninguna justificación, incluyendo:

- Scripts que "ya fueron probados indirectamente" por otros pasos
- Scripts que "son redundantes" con otros pasos
- Scripts de limpieza que "destruyen el workspace"

Si un script destruye `node_modules/` o `dist/`, el procedimiento debe incluir los pasos de restauración necesarios para continuar con las verificaciones restantes.

## Grafo de dependencias

```
node_modules/ → help, configure, create:agents-reference, lint, typecheck, tests
             → format, lint:fix (mutan src/)
             → clean:dist → build:js ∥ build:types → dist/ → start/dev/test:watch
             → clean:sessions, clean:logs → clean:modules → clean:all → clean
```

**Orden:** scripts de solo lectura primero, luego mutadores, luego build, luego servidores, luego cleans con restauración `npm install` después de cada script destructivo.

## Terminación de procesos background

Pasos 16-18 lanzan procesos persistentes. Tras verificar arranque, terminar antes de continuar:

- **Pasos 16-17** (puerto 8787): Windows `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess) -Force`; Linux/macOS `kill $(lsof -t -i :8787)`
- **Paso 18** (vitest): Windows `Stop-Process -Id (Get-Process | Where-Object {$_.CommandLine -like "*vitest*"} | Select-Object -First 1 -ExpandProperty Id) -Force`; Linux/macOS `pkill -f vitest`

## Proceso

Ejecutar pasos secuencialmente. Para cada paso: ejecutar comando, capturar exit code, registrar resultado (✅ PASS/❌ FAIL/⏭️ SKIPPED), anotar observaciones. No detenerse ante fallos.

### Paso 1 — `help`
```bash
npm run help
```
- **Tipo**: bloqueante
- **Verificar**: imprime panel de referencia sin errores.

### Paso 2 — `configure:provider`
```bash
npm run configure:provider -- --show-current
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, imprime estado actual.

### Paso 3 — `create:agents-reference`
```bash
npm run create:agents-reference
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, crea hardlink AGENTS.md → CLAUDE.md.

### Paso 4 — `lint`
```bash
npm run lint
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, anotar errores/warnings.

### Paso 5 — `typecheck`
```bash
npm run typecheck
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, anotar errores de tipos.

### Paso 6 — `test:unit`
```bash
npm run test:unit
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, anotar X/Y tests.

### Paso 7 — `test:integration`
```bash
npm run test:integration
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, anotar tests pasados/fallidos.

### Paso 8 — `format`
```bash
npm run format
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, anotar archivos modificados.

### Paso 9 — `lint:fix`
```bash
npm run lint:fix
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, anotar warnings residuales.

### Paso 10 — `clean:dist`
```bash
npm run clean:dist
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, dist/ eliminado.

### Paso 11 — `build:js`
```bash
npm run build:js
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, dist/index.js generado.

### Paso 12 — `build:types`
```bash
npm run build:types
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, .d.ts generados.

### Paso 13 — `build`
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, orquesta clean:dist → (build:js ∥ build:types).

### Paso 14 — `test:quick`
```bash
npm run test:quick
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, lint‖typecheck → test:unit.

### Paso 15 — `test`
```bash
npm test
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, lint‖typecheck → test:unit → build.

### Paso 16 — `start`
```bash
npm start
```
- **Tipo**: background
- **Verificar**: esperar 15s buscando "Proxy levantado" o "Server listening". Terminar por puerto.

### Paso 17 — `dev`
```bash
npm run dev
```
- **Tipo**: background
- **Verificar**: esperar 15s buscando "Proxy levantado". Confirmar puerto libre. Terminar por puerto.

### Paso 18 — `test:watch`
```bash
npm run test:watch
```
- **Tipo**: background
- **Verificar**: esperar 15s buscando "PASS Waiting". Terminar por nombre.

### Paso 19 — `clean:sessions`
```bash
npm run clean:sessions
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, sessions/ limpiado.

### Paso 20 — `clean:logs`
```bash
npm run clean:logs
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, logs/ limpiado.

### Paso 21 — `clean:modules`
```bash
npm run clean:modules
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, node_modules/ eliminado.

### Paso 22 — `npm install`
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, node_modules/ restaurado.

### Paso 23 — `clean:all`
```bash
npm run clean:all
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, 4 directorios eliminados en paralelo.

### Paso 24 — `npm install`
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, node_modules/ restaurado.

### Paso 25 — `clean`
```bash
npm run clean
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, dist/ y node_modules/ eliminados.

### Paso 26 — `npm install`
```bash
npm install
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, node_modules/ restaurado.

### Paso 27 — `npm run build`
```bash
npm run build
```
- **Tipo**: bloqueante
- **Verificar**: exit 0, dist/ regenerado.

## Formato de entrega

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

## Verificación final

Antes de responder, confirma mentalmente:

1. ¿Ejecuté todos los 27 pasos en el orden correcto?
2. ¿Terminé los procesos background (start, dev, test:watch) después de cada verificación?
3. ¿Restauré node_modules/ después de cada script destructivo (clean:modules, clean:all, clean)?
4. ¿El informe final incluye la tabla completa y el resumen de una línea?
5. ¿No skipeé ningún script bajo ninguna justificación?

Solo entrega el informe cuando estas verificaciones hayan pasado.
