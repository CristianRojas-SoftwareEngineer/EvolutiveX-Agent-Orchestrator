/**
 * Instalador universal de Smart Code Proxy.
 *
 * Único entry point para configurar `~/.claude/settings.json`.
 * Aplica el patrón seguro S1-S5 a todas las features:
 * - S1: Valida archivos del repo por feature antes de tocar settings.json
 * - S2: Backup timestamped único antes de la primera escritura
 * - S3: Una sola lectura y una sola escritura de settings.json
 * - S4: Merge selectivo que preserva configuración ajena del usuario
 * - S5: buildNpxTsxCommand garantiza quoting multiplataforma
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { resolvePosixAbsolutePath } from './shared/npx-tsx-command.js';
import {
  readClaudeSettings,
  writeClaudeSettings,
  CLAUDE_SETTINGS_PATH,
  resolveRefreshInterval,
} from './shared/claude-settings.js';
import {
  validateProxyRoot,
  applyStatuslineInstall,
  applyStatuslineUninstall,
} from './features/statusline.js';
import { applyVoiceInstall, applyVoiceUninstall } from './features/voice.js';
import {
  validateScpRoot,
  mergeHooks,
  unmergeHooks,
  readCanonicalHooks,
  backupSettings,
} from './features/hooks.js';

export interface SetupRunOptions {
  root: string;
  uninstall: boolean;
  statusline: boolean;
  voice: boolean;
  hooks: boolean;
  voiceMode: 'hold' | 'tap';
  voiceAutoSubmit: boolean;
  dryRun: boolean;
  force: boolean;
}

export function runSetup(options: SetupRunOptions): number {
  const proxyRoot = resolvePosixAbsolutePath(options.root);
  const isUninstall = options.uninstall;

  // Determinar features activas (sin flag = las 3)
  const anyFeatureFlag = options.statusline || options.voice || options.hooks;
  const doStatusline = anyFeatureFlag ? options.statusline : true;
  const doVoice = anyFeatureFlag ? options.voice : true;
  const doHooks = anyFeatureFlag ? options.hooks : true;

  // S1: Validar archivos del repo por feature activa (solo en install)
  if (!isUninstall) {
    try {
      if (doStatusline) validateProxyRoot(proxyRoot);
      if (doHooks) validateScpRoot(proxyRoot);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      return 1;
    }
  }

  // S3: Leer settings una sola vez
  let settings = readClaudeSettings();

  if (isUninstall) {
    // Aplicar desinstalaciones en cadena sobre el mismo objeto
    if (doStatusline) settings = applyStatuslineUninstall(settings, options.force);
    if (doVoice) settings = applyVoiceUninstall(settings);
    if (doHooks) {
      const canonical = readCanonicalHooks(proxyRoot);
      settings = unmergeHooks(settings, canonical, proxyRoot);
    }

    if (options.dryRun) {
      console.log(chalk.yellow('[dry-run] Valores que quedarían tras desinstalar:'));
      console.log(JSON.stringify(settings, null, 2));
      return 0;
    }

    // S2: Backup único antes de escribir
    backupSettings(settings);
    // S3: Escribir una sola vez
    writeClaudeSettings(settings);

    const features: string[] = [];
    if (doStatusline) features.push('statusline');
    if (doVoice) features.push('voz');
    if (doHooks) features.push('hooks');
    console.log(chalk.green(`Desinstalado: ${features.join(', ')}.`));
    return 0;
  }

  // INSTALL: Aplicar instalaciones en cadena sobre el mismo objeto
  if (doStatusline) {
    const result = applyStatuslineInstall(
      settings,
      proxyRoot,
      options.force,
      resolveRefreshInterval(process.env),
    );
    if ('error' in result) {
      console.error(chalk.red(result.error));
      return 1;
    }
    settings = result;
  }

  if (doVoice) {
    settings = applyVoiceInstall(settings, {
      mode: options.voiceMode,
      autoSubmit: options.voiceAutoSubmit,
    });
  }

  if (doHooks) {
    const canonical = readCanonicalHooks(proxyRoot);
    settings = mergeHooks(settings, canonical, proxyRoot, options.force);
  }

  if (options.dryRun) {
    console.log(chalk.yellow('[dry-run] Valores que se escribirían:'));
    console.log(JSON.stringify(settings, null, 2));
    return 0;
  }

  // S2: Backup único antes de escribir
  backupSettings(settings);
  // S3: Escribir una sola vez
  writeClaudeSettings(settings);

  const features: string[] = [];
  if (doStatusline) features.push('statusline');
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
  .description('Instala o desinstala las features de Smart Code Proxy en ~/.claude/settings.json')
  .option('--uninstall', 'Desinstalar las features seleccionadas')
  .option('--statusline', 'Operar solo sobre statusline')
  .option('--voice', 'Operar solo sobre voz')
  .option('--hooks', 'Operar solo sobre hooks (gateway + stop UX + notificaciones)')
  .option('--voice-mode <hold|tap>', 'Modo de activación de voz', 'hold')
  .option('--no-voice-auto-submit', 'Desactiva autoSubmit de voz')
  .option('--dry-run', 'Muestra los valores sin escribir en settings.json')
  .option('--force', 'Sobrescribe configuración ajena')
  .option('--root <path>', 'Raíz del repositorio del proxy', process.cwd())
  .action(
    (opts: {
      uninstall?: boolean;
      statusline?: boolean;
      voice?: boolean;
      hooks?: boolean;
      voiceMode?: string;
      voiceAutoSubmit?: boolean;
      dryRun?: boolean;
      force?: boolean;
      root: string;
    }) => {
      const code = runSetup({
        root: opts.root,
        uninstall: Boolean(opts.uninstall),
        statusline: Boolean(opts.statusline),
        voice: Boolean(opts.voice),
        hooks: Boolean(opts.hooks),
        voiceMode: opts.voiceMode === 'tap' ? 'tap' : 'hold',
        voiceAutoSubmit: opts.voiceAutoSubmit !== false,
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
