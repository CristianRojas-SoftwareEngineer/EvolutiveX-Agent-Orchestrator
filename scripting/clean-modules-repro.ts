/**
 * Reproductor del bug: rimraf exit 0 con borrado incompleto en Windows.
 *
 * Simula la condición donde un proceso mantiene un handle abierto sobre
 * un archivo de node_modules/ mientras rimraf intenta borrar el directorio.
 * Ejecutar desde la raíz del proyecto:
 *
 *   npx tsx scripting/clean-modules-repro.ts
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';

const projectRoot = 'C:/Users/Cristian/Desktop/Proyectos/Smart Code Proxy';
const nodeModulesPath = join(projectRoot, 'node_modules');
const testFilePath = join(nodeModulesPath, '.bin', 'test-lock-file.txt');

// Crear un archivo de prueba en node_modules
writeFileSync(testFilePath, 'hold this file open', 'utf-8');

console.log('=== Experimento H1: rimraf con archivo bloqueado ===');
console.log('');

// Abrir el archivo y mantenerlo bloqueado con un proceso hijo
console.log('[1] Abriendo archivo de prueba y manteniendo handle...');

// En Windows, usar powershell para mantener el archivo abierto
const lockProcess = spawn(
  'powershell',
  [
    '-Command',
    `$f = [System.IO.File]::Open('${testFilePath.replace(/\\/g, '\\\\')}', 'Open', 'ReadWrite', 'None'); ` +
      `Start-Sleep -Seconds 10; $f.Close()`,
  ],
  {
    cwd: projectRoot,
    stdio: 'pipe',
    detached: true,
    windowsHide: true,
  },
);

lockProcess.unref();

// Esperar a que el lock esté activo
console.log('[2] Esperando 2s para que el lock esté activo...');
await new Promise((r) => setTimeout(r, 2000));

console.log('[3] Verificando que el archivo existe:', existsSync(testFilePath) ? 'SÍ' : 'NO');

console.log('[4] Ejecutando npm run clean:modules...');
let exitCode = null;
let stdout = '';
let stderr = '';

try {
  const result = execSync('npm run clean:modules', {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 30000,
  });
  exitCode = 0;
  stdout = result;
  console.log('   rimraf exit code: 0 (sin excepción)');
} catch (error: unknown) {
  const err = error as { status?: number; stdout?: string; stderr?: string };
  exitCode = err.status ?? 1;
  stdout = err.stdout ?? '';
  stderr = err.stderr ?? '';
  console.log(`   rimraf exit code: ${exitCode} (capturado)`);
}

console.log('');
console.log('[5] Verificando estado de node_modules/...');
const nodeModulesExists = existsSync(nodeModulesPath);
console.log(`   node_modules/ existe: ${nodeModulesExists ? 'SÍ ❌' : 'NO ✅'}`);

if (nodeModulesExists) {
  const count = execSync('ls node_modules/ | wc -l', { encoding: 'utf-8' }).trim();
  console.log(`   Archivos/directorios restantes: ${count}`);
  console.log('');
  console.log('=== RESULTADO: H1 CONFIRMADA ===');
  console.log('rimraf completó con exit 0 pero node_modules/ quedó incompleto.');
} else {
  console.log('');
  console.log('=== RESULTADO: H1 REFUTADA ===');
  console.log('node_modules/ eliminado completamente; rimraf funcionó correctamente.');
}

// Limpiar proceso de lock si aún existe
try {
  lockProcess.kill();
} catch {
  /* ignore */
}

// Limpiar archivo de prueba si quedó
try {
  unlinkSync(testFilePath);
} catch {
  /* ignore */
}

console.log('');
console.log('=== Fin experimento ===');
process.exit(exitCode ?? 0);
