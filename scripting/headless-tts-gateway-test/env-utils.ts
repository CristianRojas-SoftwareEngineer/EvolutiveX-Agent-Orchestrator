import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENV_PATH = join(process.cwd(), 'configs', '.env');

/** Lee el puerto del proxy PRINCIPAL desde configs/.env o devuelve 8787 (guard de aislamiento). */
export function getProxyPort(): number {
  if (!existsSync(ENV_PATH)) return 8787;
  const content = readFileSync(ENV_PATH, 'utf-8');
  const match = /^PORT\s*=\s*(.*)$/m.exec(content);
  if (match?.[1]) {
    const port = parseInt(match[1].trim(), 10);
    if (!isNaN(port)) return port;
  }
  return 8787;
}

/** Tamaño actual del archivo de logs (byte offset). */
export function getLogByteOffset(logPath: string): number {
  if (!existsSync(logPath)) return 0;
  return statSync(logPath).size;
}
