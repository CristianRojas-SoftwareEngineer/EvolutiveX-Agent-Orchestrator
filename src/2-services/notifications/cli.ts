// Entry point CLI standalone (capa 4 PKA).
// Delega en DesktopNotificationAdapter. No se importa desde src/4-api/
// en N1: el cableado al composition root queda para N2.
import { Command, Option } from 'commander';
import { DesktopNotificationAdapter } from './DesktopNotificationAdapter.js';
import type { NotificationEvent } from './types.js';

const SOUND_FLAG = 'sound';
const SILENT_FLAG = 'silent';
const STDIN_JSON_FLAG = 'stdinJson';

interface CliOptions {
  eventType?: string;
  message?: string;
  title?: string;
  sound: boolean;
  silent: boolean;
  stdinJson: boolean;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}

function deriveMessageFromPayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof payload['hook_event_name'] === 'string') {
    parts.push(String(payload['hook_event_name']));
  }
  if (typeof payload['session_id'] === 'string') {
    parts.push(`session=${String(payload['session_id'])}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'hook event';
}

function buildEvent(options: CliOptions, stdinPayload?: Record<string, unknown>): NotificationEvent | { error: string } {
  let title: string;
  let message: string;

  if (options.stdinJson) {
    if (!stdinPayload) {
      return { error: 'No se recibió payload por stdin con --stdin-json' };
    }
    const eventName = stdinPayload['hook_event_name'];
    title = typeof eventName === 'string' && eventName.length > 0 ? eventName : options.eventType ?? 'HookEvent';
    message = options.message ?? deriveMessageFromPayload(stdinPayload);
  } else {
    if (!options.eventType) {
      return { error: 'Falta --event-type (o usa --stdin-json con payload)' };
    }
    if (!options.message) {
      return { error: 'Falta --message (o usa --stdin-json con payload)' };
    }
    title = options.title ?? options.eventType;
    message = options.message;
  }

  return {
    title,
    message,
    sound: options.sound,
    silent: options.silent,
  };
}

async function main(): Promise<number> {
  const program = new Command();
  program
    .name('claude-notify')
    .description('Emite un toast nativo del SO desde un hook de Claude Code')
    .option('--event-type <type>', 'Tipo de evento del lifecycle (p. ej. Stop)')
    .option('--message <msg>', 'Cuerpo del toast')
    .option('--title <title>', 'Título del toast (por defecto = --event-type)')
    .addOption(new Option(`--${SOUND_FLAG}`, 'Reproducir sonido').conflicts(SILENT_FLAG))
    .addOption(new Option(`--${SILENT_FLAG}`, 'Silenciar el toast').conflicts(SOUND_FLAG))
    .option(`--${STDIN_JSON_FLAG}`, 'Leer payload JSON por stdin y derivar title/message')
    .allowExcessArguments(false)
    .parse(process.argv);

  const options = program.opts<CliOptions>();
  options.sound = Boolean(options.sound);
  options.silent = Boolean(options.silent);
  options.stdinJson = Boolean(options.stdinJson);

  let stdinPayload: Record<string, unknown> | undefined;
  if (options.stdinJson) {
    let raw: string;
    try {
      raw = await readStdin();
    } catch (err) {
      process.stderr.write(`Error leyendo stdin: ${(err as Error).message}\n`);
      return 1;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        process.stderr.write('Payload de stdin inválido: no es un objeto JSON\n');
        return 1;
      }
      stdinPayload = parsed as Record<string, unknown>;
    } catch (err) {
      process.stderr.write(`Payload de stdin no parseable como JSON: ${(err as Error).message}\n`);
      return 1;
    }
  }

  const built = buildEvent(options, stdinPayload);
  if ('error' in built) {
    process.stderr.write(`${built.error}\n`);
    return 1;
  }

  const adapter = new DesktopNotificationAdapter();
  try {
    await adapter.notify(built);
    return 0;
  } catch (err) {
    process.stderr.write(`Error emitiendo notificación: ${(err as Error).message}\n`);
    return 1;
  }
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    process.stderr.write(`Error inesperado: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
