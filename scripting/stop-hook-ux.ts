/**
 * Hook Stop unificado: POST /hooks, toast de fin de turno y toast con resumen.
 * Un solo proceso lee stdin una vez (varios hooks en paralelo vacían stdin en Windows).
 */
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { postHookEvent, readStdinBuffer } from './post-hook-event.js';
import { notifyStopTurnFinished, runStopWorkSummaryNotification } from './stop-work-summary-notification.js';

export async function runStopHookUx(): Promise<number> {
  const body = await readStdinBuffer();
  const raw = body.toString('utf-8').trim();

  await postHookEvent(body);

  try {
    await notifyStopTurnFinished();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-hook-ux: notificación de fin de turno: ${msg}\n`);
  }

  if (!raw) {
    process.stderr.write('stop-hook-ux: stdin vacío; no se envía resumen\n');
    return 0;
  }

  return runStopWorkSummaryNotification(raw);
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
