/**
 * Hook PostToolUse[matcher="TaskUpdate"]: notifica solo cuando
 * `tool_input.status === "in_progress"`. Filtra el resto silenciosamente.
 *
 * No invoca POST /hooks: el `AuditHookEventHandler` no procesa eventos
 * `TaskUpdate` (ver spec `hooks-lifecycle-correlation`).
 */
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { DesktopNotificationAdapter } from '../src/2-services/notifications/DesktopNotificationAdapter.js';
import { buildEvent, normalizeStdinJsonText } from '../src/2-services/notifications/cli.js';
import { readStdinBuffer } from './post-hook-event.js';

export async function runTaskInProgressHookUx(): Promise<number> {
  const body = await readStdinBuffer();
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
  } catch (err) {
    process.stderr.write(
      `task-in-progress-hook-ux: JSON inválido: ${(err as Error).message}\n`,
    );
    return 0;
  }

  const toolInput = payload.tool_input;
  if (toolInput == null || typeof toolInput !== 'object') {
    return 0;
  }
  const status = (toolInput as Record<string, unknown>).status;
  if (status !== 'in_progress') {
    return 0;
  }

  const built = buildEvent(
    {
      eventType: 'TaskInProgress',
      stdinJson: true,
      sound: false,
      silent: false,
    },
    payload,
  );
  if ('error' in built) {
    process.stderr.write(`task-in-progress-hook-ux: ${built.error}\n`);
    return 0;
  }

  const adapter = new DesktopNotificationAdapter();
  try {
    await adapter.notify(built);
    return 0;
  } catch (err) {
    process.stderr.write(
      `task-in-progress-hook-ux: toast: ${(err as Error).message}\n`,
    );
    return 0;
  }
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  runTaskInProgressHookUx()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`task-in-progress-hook-ux: ${msg}\n`);
      process.exit(0);
    });
}
