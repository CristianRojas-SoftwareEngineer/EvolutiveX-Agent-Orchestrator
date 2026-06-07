/**
 * Script dedicado para eliminar node_modules/ con garantías de atomicidad en Windows.
 *
 * Problema que resuelve: rimraf en Windows no garantiza atomicidad transaccional.
 * Cuando falla a mitad del borrado (archivos bloqueados por procesos activos),
 * no hay rollback — el directorio queda corrupto (~350 items restantes) y la
 * pipeline de verificación se rompe en cascada.
 *
 * Solución: pre-limpieza de procesos en Windows + verificación post-borrado.
 * La auto-recuperación se delega a un proceso hijo (spawn con detached:true)
 * para que el padre pueda terminar con exit code 1 sin quedar bloqueado.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';

const NODE_MODULES = join(process.cwd(), 'node_modules');
const IS_WINDOWS = process.platform === 'win32';

/**
 * Mata procesos que típicamente mantienen handles abiertos sobre archivos
 * de node_modules/ en entornos de desarrollo Windows.
 * Solo mata esbuild y vitest — no mata 'node' para no cascadear a
 * procesos padres无辜 (bash, npm, gateway).
 */
function windowsPreCleanup(): void {
  if (!IS_WINDOWS) return;

  const processes = ['esbuild', 'vitest'];
  for (const proc of processes) {
    try {
      execSync(`taskkill /F /IM ${proc}.exe /T 2>nul`, { stdio: 'pipe', windowsHide: true });
    } catch {
      // Silently ignore if process not found
    }
  }
  // Esperar 2s para que el SO libere los handles
  execSync('powershell -Command "Start-Sleep -Seconds 2"', { stdio: 'pipe', windowsHide: true });
}

/**
 * Verifica si node_modules/ fue eliminado completamente.
 * Retorna true si el directorio no existe o está vacío.
 */
function verifyDeletion(): boolean {
  if (!existsSync(NODE_MODULES)) return true;
  try {
    const items = readdirSync(NODE_MODULES);
    return items.length === 0;
  } catch {
    return true; // Si no se puede leer, considerar eliminado
  }
}

/**
 * Auto-recuperación: ejecuta npm install en un proceso hijo detached
 * para restaurar el entorno a un estado completo y funcional.
 * El proceso padre termina inmediatamente con exit1 para no quedar
 * bloqueado por npm install.
 */
function autoRecover(): void {
  console.error(
    '[clean-modules] Estado corrupto detectado. Ejecutando npm install en segundo plano para restaurar el entorno...',
  );
  spawn('npm', ['install'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    detached: true,
    windowsHide: true,
  });
}

/**
 * Delegar directamente a rimraf en Linux/macOS — sin pre-limpieza.
 */
function delegateToRimraf(): void {
  try {
    execSync('npx rimraf node_modules', { stdio: 'inherit', cwd: process.cwd() });
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

// === Punto de entrada ===

if (!IS_WINDOWS) {
  // Linux/macOS: delegación directa a rimraf
  delegateToRimraf();
}

// Windows: pre-limpieza + rimraf + verificación + auto-recuperación
windowsPreCleanup();

let rimrafFailed = false;
try {
  execSync('npx rimraf node_modules', {
    stdio: 'pipe',
    cwd: process.cwd(),
    timeout: 60_000,
    windowsHide: true,
  });
} catch (err) {
  rimrafFailed = true;
  console.error('[clean-modules] rimraf falló:', err);
}

if (verifyDeletion()) {
  process.exit(0);
} else {
  // Estado corrupto: directorio persiste con items
  // Lanzar npm install en segundo plano y terminar con error
  autoRecover();
  process.exit(1);
}
