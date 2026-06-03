import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readClaudeSettings,
  writeClaudeSettings,
  SMART_CODE_PROXY_ROOT_KEY,
  type ClaudeSettings,
} from './shared/claude-settings.js';
import { buildNpxTsxCommand } from './shared/npx-tsx-command.js';

export const NOTIFICATION_CLI_SEGMENT = 'src/2-services/notifications/cli.ts';
export const LEGACY_NOTIFICATION_PS1 = 'desktop-notification-hook.ps1';

const NOTIFICATION_HOOK_KEYS = [
  'UserPromptSubmit',
  'PreToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'StopFailure',
  'SessionStart',
  'SessionEnd',
  'PermissionRequest',
  'TaskCreated',
  'TaskCompleted',
] as const;

type NotificationHookKey = (typeof NOTIFICATION_HOOK_KEYS)[number];

interface HookCommandSpec {
  eventType: string;
  stdinJson?: boolean;
  matcher?: string;
}

const GLOBAL_NOTIFICATION_SPECS: Record<NotificationHookKey, HookCommandSpec> = {
  UserPromptSubmit: { eventType: 'UserPromptSubmit', stdinJson: true },
  PreToolUse: { eventType: 'PreToolUse', stdinJson: true, matcher: 'AskUserQuestion' },
  SubagentStart: { eventType: 'SubagentStart' },
  SubagentStop: { eventType: 'SubagentStop' },
  Stop: { eventType: 'Stop', stdinJson: true },
  StopFailure: { eventType: 'StopFailure', stdinJson: true },
  SessionStart: { eventType: 'SessionStart', matcher: 'startup|resume' },
  SessionEnd: { eventType: 'SessionEnd' },
  PermissionRequest: { eventType: 'PermissionRequest', stdinJson: true },
  TaskCreated: { eventType: 'TaskCreated' },
  TaskCompleted: { eventType: 'TaskCompleted' },
};

interface HookEntry {
  type: string;
  command: string;
  if?: string;
}

interface HookBlock {
  matcher?: string;
  hooks: HookEntry[];
}

export function isSmartCodeNotificationCommand(command: string | undefined): boolean {
  return typeof command === 'string' && command.includes(NOTIFICATION_CLI_SEGMENT);
}

export function isLegacyNotificationPs1(command: string | undefined): boolean {
  return typeof command === 'string' && command.includes(LEGACY_NOTIFICATION_PS1);
}

export function isManagedNotificationCommand(command: string | undefined): boolean {
  return isSmartCodeNotificationCommand(command) || isLegacyNotificationPs1(command);
}

export function buildNotificationCommand(
  proxyRoot: string,
  eventType: string,
  opts: { stdinJson?: boolean } = {},
): string {
  const extraArgs = [`--event-type`, eventType];
  if (opts.stdinJson) extraArgs.push('--stdin-json');
  return buildNpxTsxCommand(proxyRoot, NOTIFICATION_CLI_SEGMENT, extraArgs);
}

export function validateProxyRootForNotifications(proxyRoot: string): void {
  const root = resolve(proxyRoot);
  const cliPath = join(root, NOTIFICATION_CLI_SEGMENT);
  if (!existsSync(cliPath)) {
    throw new Error(
      `No se encontró ${cliPath}. Ejecute npm install y el instalador desde la raíz del proxy.`,
    );
  }
}

function buildHookBlock(spec: HookCommandSpec, proxyRoot: string): HookBlock {
  const block: HookBlock = {
    hooks: [
      {
        type: 'command',
        command: buildNotificationCommand(proxyRoot, spec.eventType, {
          stdinJson: spec.stdinJson,
        }),
      },
    ],
  };
  if (spec.matcher) block.matcher = spec.matcher;
  return block;
}

export function buildGlobalNotificationHooksBlock(
  proxyRoot: string,
): Record<string, HookBlock[]> {
  const hooks: Record<string, HookBlock[]> = {};
  for (const key of NOTIFICATION_HOOK_KEYS) {
    hooks[key] = [buildHookBlock(GLOBAL_NOTIFICATION_SPECS[key], proxyRoot)];
  }
  return hooks;
}

function hookBlockCommands(blocks: HookBlock[] | undefined): string[] {
  if (!blocks) return [];
  return blocks.flatMap((b) => b.hooks.map((h) => h.command));
}

export function shouldOverwriteNotificationKey(
  key: NotificationHookKey,
  existingBlocks: HookBlock[] | undefined,
  force: boolean,
): { ok: true } | { ok: false; message: string } {
  if (force) return { ok: true };
  const commands = hookBlockCommands(existingBlocks);
  if (commands.length === 0) return { ok: true };
  if (commands.every(isManagedNotificationCommand)) return { ok: true };
  return {
    ok: false,
    message: `Hook "${key}" tiene comandos que no son de Smart Code Proxy. Use --force para sobrescribir.`,
  };
}

export function applyNotificationsInstall(
  settings: ClaudeSettings,
  proxyRoot: string,
  force: boolean,
): ClaudeSettings | { error: string } {
  const root = resolve(proxyRoot);
  const notificationHooks = buildGlobalNotificationHooksBlock(root);
  const existingHooks = (settings.hooks ?? {}) as Record<string, HookBlock[]>;

  for (const key of NOTIFICATION_HOOK_KEYS) {
    const check = shouldOverwriteNotificationKey(key, existingHooks[key], force);
    if (!check.ok) return { error: check.message };
  }

  const next: ClaudeSettings = { ...settings };
  const mergedHooks = { ...existingHooks, ...notificationHooks };
  next.hooks = mergedHooks;
  if (!next.env) next.env = {};
  next.env[SMART_CODE_PROXY_ROOT_KEY] = root;
  return next;
}

export function applyNotificationsUninstall(settings: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const existingHooks = { ...((settings.hooks ?? {}) as Record<string, HookBlock[]>) };

  for (const key of NOTIFICATION_HOOK_KEYS) {
    const blocks = existingHooks[key];
    if (!blocks) continue;
    const commands = hookBlockCommands(blocks);
    if (commands.length === 0 || !commands.every(isManagedNotificationCommand)) continue;
    delete existingHooks[key];
  }

  if (Object.keys(existingHooks).length === 0) {
    delete next.hooks;
  } else {
    next.hooks = existingHooks;
  }
  return next;
}

export interface InstallNotificationsRunOptions {
  root: string;
  dryRun: boolean;
  force: boolean;
  uninstall: boolean;
}

export function runInstallNotifications(options: InstallNotificationsRunOptions): number {
  const proxyRoot = resolve(options.root);

  try {
    if (!options.uninstall) {
      validateProxyRootForNotifications(proxyRoot);
    }
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }

  const settings = readClaudeSettings();

  if (options.uninstall) {
    const next = applyNotificationsUninstall(settings);
    if (options.dryRun) {
      console.log(chalk.yellow('[dry-run] Se quitarían hooks de notificación Smart Code Proxy'));
      console.log(JSON.stringify({ hooks: next.hooks }, null, 2));
      return 0;
    }
    writeClaudeSettings(next);
    console.log(chalk.green('Hooks de notificación desinstalados.'));
    return 0;
  }

  const result = applyNotificationsInstall(settings, proxyRoot, options.force);
  if ('error' in result) {
    console.error(chalk.red(result.error));
    return 1;
  }

  const notificationHooks = buildGlobalNotificationHooksBlock(proxyRoot);
  if (options.dryRun) {
    console.log(chalk.yellow('[dry-run] Hooks que se escribirían:'));
    console.log(JSON.stringify({ hooks: notificationHooks, env: result.env }, null, 2));
    return 0;
  }

  writeClaudeSettings(result);
  console.log(chalk.green('Notificaciones globales instaladas correctamente.'));
  console.log(chalk.cyan(`  env.${SMART_CODE_PROXY_ROOT_KEY}: ${proxyRoot}`));
  console.log(chalk.cyan(`  hooks: ${NOTIFICATION_HOOK_KEYS.join(', ')}`));
  console.log(
    chalk.cyan(
      '\nReinicie Claude Code para aplicar los cambios. Si mueve el repositorio, vuelva a ejecutar npm run install:notifications.',
    ),
  );
  return 0;
}

const program = new Command();

program
  .name('install-notifications')
  .description(
    'Instala hooks globales de notificación (npx tsx cli.ts) en ~/.claude/settings.json',
  )
  .option('--root <path>', 'Raíz del repositorio del proxy', process.cwd())
  .option('--dry-run', 'Muestra los valores sin escribir en settings.json')
  .option('--force', 'Sobrescribe hooks ajenos en las 11 claves de notificación')
  .option('--uninstall', 'Elimina hooks Smart Code Proxy / legacy PS1 de notificación')
  .action((opts: { root: string; dryRun?: boolean; force?: boolean; uninstall?: boolean }) => {
    const code = runInstallNotifications({
      root: opts.root,
      dryRun: Boolean(opts.dryRun),
      force: Boolean(opts.force),
      uninstall: Boolean(opts.uninstall),
    });
    if (code !== 0) process.exit(code);
  });

const entryPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === invokedPath) {
  program.parse();
}
