/**
 * Relay unificado: lee stdin una vez, POST /hooks y toast con --stdin-json.
 * Evita carrera de stdin cuando post-hook-event y cli.ts corren en paralelo (Windows).
 */
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { DesktopNotificationAdapter } from '../src/2-services/notifications/DesktopNotificationAdapter.js';
import { buildEvent, normalizeStdinJsonText } from '../src/2-services/notifications/cli.js';
import { postHookEvent, readStdinBuffer } from './post-hook-event.js';

const STDIN_JSON_EVENT_TYPES = new Set(['UserPromptSubmit', 'StopFailure']);

export async function runGatewayHookNotify(eventType: string): Promise<number> {
  if (!STDIN_JSON_EVENT_TYPES.has(eventType)) {
    process.stderr.write(
      `gateway-hook-notify: event-type no soportado: ${eventType}\n`,
    );
    return 1;
  }

  const body = await readStdinBuffer();
  await postHookEvent(body);

  const raw = body.toString('utf-8').trim();
  if (!raw) {
    process.stderr.write('gateway-hook-notify: stdin vacío\n');
    return 1;
  }

  let stdinPayload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(normalizeStdinJsonText(raw));
    if (typeof parsed !== 'object' || parsed === null) {
      process.stderr.write('gateway-hook-notify: payload no es un objeto JSON\n');
      return 1;
    }
    stdinPayload = parsed as Record<string, unknown>;
  } catch (err) {
    process.stderr.write(
      `gateway-hook-notify: JSON inválido: ${(err as Error).message}\n`,
    );
    return 1;
  }

  const built = buildEvent(
    {
      eventType,
      stdinJson: true,
      sound: false,
      silent: false,
    },
    stdinPayload,
  );
  if ('error' in built) {
    process.stderr.write(`gateway-hook-notify: ${built.error}\n`);
    return 1;
  }

  const adapter = new DesktopNotificationAdapter();
  try {
    await adapter.notify(built);
    return 0;
  } catch (err) {
    process.stderr.write(
      `gateway-hook-notify: toast: ${(err as Error).message}\n`,
    );
    return 1;
  }
}

async function main(): Promise<number> {
  const program = new Command();
  program
    .requiredOption('--event-type <type>', 'UserPromptSubmit | StopFailure')
    .parse(process.argv);
  const { eventType } = program.opts<{ eventType: string }>();
  return runGatewayHookNotify(eventType);
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`gateway-hook-notify: ${msg}\n`);
      process.exit(1);
    });
}
