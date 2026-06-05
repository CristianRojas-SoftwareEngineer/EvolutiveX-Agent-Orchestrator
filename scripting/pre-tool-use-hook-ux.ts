/**
 * Hook PreToolUse unificado: POST /hooks para todas las tools y toast solo en
 * AskUserQuestion. Un solo proceso lee stdin (evita carrera con cli en paralelo).
 */
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { DesktopNotificationAdapter } from '../src/2-services/notifications/DesktopNotificationAdapter.js';
import { buildEvent, normalizeStdinJsonText } from '../src/2-services/notifications/cli.js';
import { resolveHookNotificationMessage } from '../src/2-services/notifications/hook-payload-notification-message.js';
import { postHookEvent, readStdinBuffer } from './post-hook-event.js';

export async function runPreToolUseHookUx(): Promise<number> {
  const body = await readStdinBuffer();
  await postHookEvent(body);

  const raw = body.toString('utf-8').trim();
  if (!raw) {
    return 0;
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(normalizeStdinJsonText(raw));
    if (typeof parsed !== 'object' || parsed === null) {
      return 0;
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return 0;
  }

  const dynamicMessage = resolveHookNotificationMessage('PreToolUse', payload);
  if (!dynamicMessage) {
    return 0;
  }

  const built = buildEvent(
    {
      eventType: 'PreToolUse',
      stdinJson: true,
      sound: false,
      silent: false,
    },
    payload,
  );
  if ('error' in built) {
    process.stderr.write(`pre-tool-use-hook-ux: ${built.error}\n`);
    return 1;
  }

  const adapter = new DesktopNotificationAdapter();
  try {
    await adapter.notify(built);
    return 0;
  } catch (err) {
    process.stderr.write(`pre-tool-use-hook-ux: toast: ${(err as Error).message}\n`);
    return 1;
  }
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  runPreToolUseHookUx()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`pre-tool-use-hook-ux: ${msg}\n`);
      process.exit(0);
    });
}
