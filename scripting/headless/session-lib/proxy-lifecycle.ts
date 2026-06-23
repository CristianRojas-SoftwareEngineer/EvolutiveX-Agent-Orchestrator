import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface ProxyHandle {
  child: ChildProcess;
  port: number;
}

/** Obtiene PIDs que escuchan en un puerto TCP. */
function getPidsOnPort(port: number): number[] {
  const pids = new Set<number>();

  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr ":${port}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      for (const line of output.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1] ?? '', 10);
        if (!isNaN(pid) && pid > 0) pids.add(pid);
      }
    } catch {
      // Sin procesos en el puerto
    }
  } else {
    try {
      const output = execSync(`lsof -ti :${port}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      for (const line of output.split('\n')) {
        const pid = parseInt(line.trim(), 10);
        if (!isNaN(pid) && pid > 0) pids.add(pid);
      }
    } catch {
      // Sin procesos en el puerto
    }
  }

  return [...pids];
}

/** Mata procesos que escuchan en el puerto dado. */
export function killProcessOnPort(port: number): void {
  for (const pid of getPidsOnPort(port)) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      // El proceso ya terminó
    }
  }
}

/**
 * Arranca el proxy con el mismo comando que `npm run dev`.
 * `extraEnv` sobreescribe variables del padre y de configs/.env (el entorno
 * del proceso tiene prioridad sobre --env-file en Node).
 */
export function startProxy(
  projectRoot: string,
  port: number,
  extraEnv: Record<string, string> = {},
): ProxyHandle {
  const child = spawn(
    'node',
    ['--env-file-if-exists=configs/.env', '--import', 'tsx', 'src/index.ts'],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port), ...extraEnv },
    },
  );

  return { child, port };
}

/** Espera a que GET /health responda 200. */
export async function waitHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // Reintentar
    }
    await sleep(500);
  }

  return false;
}

/** Detiene el proxy y su árbol de procesos. */
export async function stopProxy(handle: ProxyHandle): Promise<void> {
  const { child, port } = handle;

  if (child.pid && !child.killed) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${child.pid} /T`, { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      // Ya terminó
    }
  }

  await sleep(500);
  killProcessOnPort(port);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ruta al archivo de logs del proxy (configurable para instancias de test aisladas). */
export function getLogPath(projectRoot: string, fileName = 'logs.jsonl'): string {
  return join(projectRoot, 'server', fileName);
}
