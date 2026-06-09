---
case_id: 20260607-clean-modules-windows
profile: corrective
phase: 05-experiment-design
version: v1.0
timestamp: 2026-06-07T21:15:00Z
status: in_progress
inputs: [case.md, 04-hypothesis.md]
produces: 05-experiment-design.md
links: { previous: "04-hypothesis.md", next: }
---

# 05 — Experiment Design — 20260607-clean-modules-windows

## Applied policy

| Campo | Valor |
|---|---|
| focus | write a failing test that reproduces the bug first |
| reasoning_effort | medium |
| evidence | repro_test |
| acceptance | repro test + rollback defined |
| risk_controls | [rollback] |

## Hypothesis under test

**H1 — `fixEPERM` silently gives up, rimraf exits 0 con borrado incompleto.**

## Procedure

### Paso 0 — Precondición: restaurar entorno limpio

Antes del experimento, verificar que `node_modules/` está intacto y que `npm install` ejecutó correctamente:

```bash
ls node_modules/.bin/tsx && echo "entorno OK"
```

Si no existe, ejecutar `npm install`.

### Paso 1 — Crear reproductor del bug

Crear un script que simule la condición de lock:

**`maintenance-cases/20260607-clean-modules-windows/experiments/hypothesis-1/repro-script.ts`**:

```typescript
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const projectRoot = join('C:/Users/Cristian/Desktop/Proyectos/Smart Code Proxy');

console.log('=== Experimento: clean:modules con proceso con handle abierto ===');

// Paso 1: Arrancar un proceso que mantenga un handle sobre un archivo de node_modules
// Simulamos esto ejecutando `npm run dev` en background, que arranca vite/esbuild
console.log('Iniciando npm run dev en background...');
const devProcess = spawn('npm', ['run', 'dev'], {
  cwd: projectRoot,
  stdio: 'ignore',
  detached: true,
});

// Esperar a que dev arranque completamente
await new Promise(r => setTimeout(r, 5000));

// Paso 2: Ejecutar clean:modules
console.log('Ejecutando npm run clean:modules...');
try {
  const result = execSync('npm run clean:modules', {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  console.log('rimraf exit code: 0 (completó sin error)');
  console.log('stdout:', result);
} catch (error: unknown) {
  const err = error as { status?: number; message?: string };
  console.log('rimraf exit code:', err.status ?? 'unknown');
  console.log('error:', err.message);
}

// Paso 3: Verificar estado de node_modules
const nodeModulesExists = existsSync(join(projectRoot, 'node_modules'));
console.log('node_modules/ existe tras clean:', nodeModulesExists);

if (nodeModulesExists) {
  const filesRemaining = execSync('ls node_modules/ | wc -l', { encoding: 'utf-8' });
  console.log('Archivos/directorios restantes en node_modules/:', filesRemaining.trim());
}

// Paso 4: Matar el proceso dev
try {
  devProcess.kill();
} catch { /* ignore */ }

console.log('=== Fin experimento ===');
```

### Paso 2 — Ejecutar reproductor y observar

```bash
npx tsx maintenance-cases/20260607-clean-modules-windows/experiments/hypothesis-1/repro-script.ts
```

Observar:
- Exit code de rimraf (¿0 o 1?).
- Si exit code 0: ¿node_modules/ quedó incompleto?
- Si quedó incompleto: ¿cuántos archivos persisten?

### Paso 3 — Verificación de hipótesis

Si `node_modules/` queda incompleto Y rimraf exit code = 0 → **H1 confirmada**.

Si `node_modules/` se borra completamente → H1 refutada; probar H2.

## Variables

| Variable | Valor |
|---|---|
| Proceso con handle activo | `npm run dev` (background, detached) |
| Tiempo de espera antes de clean | 5 segundos |
| Comando evaluado | `npm run clean:modules` (rimraf node_modules) |
| Plataforma | Windows 11 |

## Controls

| Control | Valor |
|---|---|
| Sin proceso activo | Ejecutar `npm run clean:modules` en limpio → esperar borrado completo |
| Con proceso activo | Reproducir el experimento |
| Verificación post-ejecución | `existsSync(node_modules)` + `rimraf` exit code |

## Success / Failure criteria

| Criterio | Condición |
|---|---|
| **Éxito (H1 confirmada)** | `node_modules/` persiste parcialmente tras `npm run clean:modules` Y rimraf exit code = 0 |
| **Fallo (H1 refutada)** | `node_modules/` eliminado completamente tras `npm run clean:modules` incluso con proceso activo |
| **Inconclusivo** | rimraf exit code = 1 (error propagado) — en este caso H1 no aplica |

## Rollback

Si el experimento deja `node_modules/` incompleto, restaurar con:

```bash
npm install
```

Esto revertirá el estado al escenario conocido (incompleto por el bug original, pero restaurable).

Si el experimento funciona en limpio (H1 refutada), el estado del entorno es el mismo que antes del experimento.

---

## Nota sobre H2 y H4

Si H1 es refutada, el diseño para H2 (retry insuficiente) requiere modificar la llamada a rimraf para aumentar `maxRetries`. Esto puede hacerse directamente en el paso 1 del diseño, ejecutando rimraf programáticamente con `{ maxRetries: 20 }` en lugar de usar el CLI de npm. El diseño de H2 se definirá en una versión posterior de este artefacto si H1 es refutada.