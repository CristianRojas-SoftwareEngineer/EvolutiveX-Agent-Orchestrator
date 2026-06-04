/**
 * Hook Stop unificado: POST /hooks y toast único con mensaje de continuidad.
 * Un solo proceso lee stdin una vez (varios hooks en paralelo vacían stdin en Windows).
 */
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { postHookEvent, readStdinBuffer } from './post-hook-event.js';
import { runContinuityNotification } from './stop-work-summary-notification.js';

export async function runStopHookUx(): Promise<number> {
  const body = await readStdinBuffer();
  const raw = body.toString('utf-8').trim();
  await postHookEvent(body);
  const scpRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
  return runContinuityNotification(raw, scpRoot);
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  runStopHookUx()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`stop-hook-ux: ${msg}\n`);
      process.exit(0);
    });
}
