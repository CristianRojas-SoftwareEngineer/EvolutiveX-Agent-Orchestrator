import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readClaudeSettings,
  writeClaudeSettings,
  CLAUDE_SETTINGS_PATH,
} from './shared/claude-settings.js';
import { validateProxyRoot, applyStatuslineInstall, applyStatuslineUninstall } from './install-statusline.js';
import {
  validateProxyRootForNotifications,
  applyNotificationsInstall,
  applyNotificationsUninstall,
} from './install-notifications.js';
import { applyVoiceInstall, applyVoiceUninstall } from './install-voice.js';
import { runSetupHooks, validateScpRoot } from './setup-hooks.js';

export interface SetupRunOptions {
  root: string;
  statusline: boolean;
  notifications: boolean;
  voice: boolean;
  hooks: boolean;
  voiceMode: 'hold' | 'tap';
  uninstall: boolean;
  dryRun: boolean;
  force: boolean;
}

export function runSetup(options: SetupRunOptions): number {
  const proxyRoot = resolve(options.root);

  const anyFeatureFlag = options.statusline || options.notifications || options.voice || options.hooks;
  const doStatusline = anyFeatureFlag ? options.statusline : true;
  const doNotifications = anyFeatureFlag ? options.notifications : true;
  const doVoice = anyFeatureFlag ? options.voice : true;
  const doHooks = options.hooks;

  if (!options.uninstall) {
    try {
      if (doStatusline) validateProxyRoot(proxyRoot);
      if (doNotifications) validateProxyRootForNotifications(proxyRoot);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      return 1;
    }
  }

  let settings = readClaudeSettings();

  if (options.uninstall) {
    if (doStatusline) settings = applyStatuslineUninstall(settings);
    if (doNotifications) settings = applyNotificationsUninstall(settings);
    if (doVoice) settings = applyVoiceUninstall(settings);
    if (doHooks) {
      const hooksResult = runSetupHooks({
        root: proxyRoot,
        dryRun: options.dryRun,
        force: false,
        uninstall: true,
      });
      if (hooksResult !== 0) return hooksResult;
    }

    if (options.dryRun) {
      console.log(chalk.yellow('[dry-run] Valores que quedarían tras desinstalar:'));
      console.log(JSON.stringify(settings, null, 2));
      return 0;
    }

    writeClaudeSettings(settings);
    const features: string[] = [];
    if (doStatusline) features.push('statusline');
    if (doNotifications) features.push('notificaciones');
    if (doVoice) features.push('voz');
    if (doHooks) features.push('hooks');
    console.log(chalk.green(`Desinstalado: ${features.join(', ')}.`));
    return 0;
  }

  if (doStatusline) {
    const result = applyStatuslineInstall(settings, proxyRoot, options.force);
    if ('error' in result) {
      console.error(chalk.red(result.error));
      return 1;
    }
    settings = result;
  }

  if (doNotifications) {
    const result = applyNotificationsInstall(settings, proxyRoot, options.force);
    if ('error' in result) {
      console.error(chalk.red(result.error));
      return 1;
    }
    settings = result;
  }

  if (doVoice) {
    settings = applyVoiceInstall(settings, {
      mode: options.voiceMode,
    });
  }

  if (doHooks) {
    try {
      validateScpRoot(proxyRoot);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      return 1;
    }
    const hooksResult = runSetupHooks({
      root: proxyRoot,
      dryRun: options.dryRun,
      force: options.force,
      uninstall: options.uninstall,
    });
    if (hooksResult !== 0) return hooksResult;
  }

  if (options.dryRun) {
    console.log(chalk.yellow('[dry-run] Valores que se escribirían:'));
    console.log(JSON.stringify(settings, null, 2));
    return 0;
  }

  writeClaudeSettings(settings);

  const features: string[] = [];
  if (doStatusline) features.push('statusline');
  if (doNotifications) features.push('notificaciones');
  if (doVoice) features.push('voz');
  if (doHooks) features.push('hooks');
  console.log(chalk.green(`Instalado: ${features.join(', ')}.`));
  console.log(chalk.cyan(`  settings.json: ${CLAUDE_SETTINGS_PATH}`));
  console.log(chalk.cyan('\nReinicie Claude Code para aplicar los cambios.'));
  return 0;
}

const program = new Command();

program
  .name('setup')
  .description('Instala o desinstala statusline, notificaciones, voz y hooks de Claude Code (unificado)')
  .option('--statusline', 'Operar solo sobre statusline')
  .option('--notifications', 'Operar solo sobre notificaciones')
  .option('--voice', 'Operar solo sobre voz')
  .option('--hooks', 'Operar solo sobre hooks')
  .option('--voice-mode <hold|tap>', 'Modo de activación de voz', 'hold')
  .option('--uninstall', 'Desinstalar las features seleccionadas')
  .option('--dry-run', 'Muestra los valores sin escribir en settings.json')
  .option('--force', 'Sobrescribe configuración ajena')
  .option('--root <path>', 'Raíz del repositorio del proxy', process.cwd())
  .action(
    (opts: {
      statusline?: boolean;
      notifications?: boolean;
      voice?: boolean;
      hooks?: boolean;
      voiceMode?: string;
      uninstall?: boolean;
      dryRun?: boolean;
      force?: boolean;
      root: string;
    }) => {
      const code = runSetup({
        root: opts.root,
        statusline: Boolean(opts.statusline),
        notifications: Boolean(opts.notifications),
        voice: Boolean(opts.voice),
        hooks: Boolean(opts.hooks),
        voiceMode: (opts.voiceMode === 'tap' ? 'tap' : 'hold') as 'hold' | 'tap',
        uninstall: Boolean(opts.uninstall),
        dryRun: Boolean(opts.dryRun),
        force: Boolean(opts.force),
      });
      if (code !== 0) process.exit(code);
    },
  );

const entryPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === invokedPath) {
  program.parse();
}
