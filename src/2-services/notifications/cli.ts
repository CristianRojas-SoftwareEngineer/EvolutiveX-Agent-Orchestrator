// Entry point CLI standalone (capa 4 PKA).
// Delega en DesktopNotificationAdapter. No se importa desde src/4-api/
// en N1: el cableado al composition root queda para N2.
import { Command, Option } from 'commander';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve as resolvePath } from 'path';
import { DesktopNotificationAdapter } from './DesktopNotificationAdapter.js';
import type { NotificationEvent } from './types.js';
import { STABLE_PNG_PATH } from './asset-paths.js';

const SOUND_FLAG = 'sound';
const SILENT_FLAG = 'silent';
const STDIN_JSON_FLAG = 'stdin-json';
const APP_ID_FLAG = 'app-id';
const ICON_FLAG = 'icon';

// Default de branding: AUMID Windows (Company.App, sin espacios, ≤ 129 chars).
const DEFAULT_APP_ID = 'AIAssistant.Proxy';

// Resolver el icono por defecto. Prioridad:
//   1. `--icon <path>` (override explícito del usuario).
//   2. Ruta estable ASCII-only (`%LOCALAPPDATA%\AIAssistant\ai-assistant.png`)
//      si existe — esta es la ruta que `register --install` deja lista.
//      Es ASCII-only para evitar issues con SnoreToast al pasar el path
//      como `-p` a snoretoast.exe (caracteres como la "ó" de "Proyectos"
//      en la ruta del repo causan problemas).
//   3. Ruta del repo (`<repo>/assets/notifications/ai-assistant.png`)
//      como fallback. Útil en entornos donde aún no se corrió --install.
//
// La existencia se evalúa una sola vez al cargar el CLI (módulo-level),
// no en cada notificación.
const DEFAULT_ICON_PATH = existsSync(STABLE_PNG_PATH)
  ? STABLE_PNG_PATH
  : resolvePath(
      resolvePath(fileURLToPath(import.meta.url), '..'),
      '../../..',
      'assets/notifications/ai-assistant.png',
    );
const DEFAULT_ICON_EXISTS = existsSync(DEFAULT_ICON_PATH);

interface CliOptions {
  eventType?: string;
  message?: string;
  title?: string;
  sound: boolean;
  silent: boolean;
  stdinJson: boolean;
  appId?: string;
  icon?: string;
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

/**
 * Resuelve los defaults de branding: `appId` siempre toma `DEFAULT_APP_ID`
 * si no se proporcionó `--app-id`; `icon` toma la ruta al `.png` por defecto
 * SOLO si el archivo existe (degradación con gracia). En Windows, `icon`
 * se traduce a `-p` en SnoreToast (imagen del toast); sin él aparece el
 * logo genérico de SnoreToast. La ruta por defecto prioriza la copia
 * ASCII-only en `%LOCALAPPDATA%\AIAssistant\` tras `--install`.
 */
export function resolveBranding(options: CliOptions): { appId: string; icon?: string } {
  const appId = options.appId ?? DEFAULT_APP_ID;
  if (options.icon !== undefined) {
    return { appId, icon: options.icon };
  }
  if (DEFAULT_ICON_EXISTS) {
    return { appId, icon: DEFAULT_ICON_PATH };
  }
  return { appId };
}

export function buildEvent(options: CliOptions, stdinPayload?: Record<string, unknown>): NotificationEvent | { error: string } {
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

  const branding = resolveBranding(options);
  return {
    title,
    message,
    sound: options.sound,
    silent: options.silent,
    appId: branding.appId,
    ...(branding.icon !== undefined ? { icon: branding.icon } : {}),
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
    .option(`--${APP_ID_FLAG} <id>`, `Identificador de aplicación (AUMID Windows); default: ${DEFAULT_APP_ID}`)
    .option(`--${ICON_FLAG} <path>`, 'Ruta al icono de la notificación; default: <repo>/assets/notifications/ai-assistant.png')
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

// Auto-ejecutar solo cuando este módulo es el entry point (evita que
// `import` desde tests dispare `main()` + `process.exit()`).
// `import.meta.url` y `process.argv[1]` solo coinciden cuando Node
// ejecuta este archivo directamente vía `node` o `tsx`.
const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  main().then(
    (code) => {
      process.exit(code);
    },
    (err) => {
      process.stderr.write(`Error inesperado: ${(err as Error).message}\n`);
      process.exit(1);
    },
  );
}
