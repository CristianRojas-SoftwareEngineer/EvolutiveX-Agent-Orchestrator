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

export { SMART_CODE_PROXY_ROOT_KEY };
const ROUTER_STATUS_SEGMENT = 'scripting/router-status.ts';

export function isSmartCodeStatusLine(command: string | undefined): boolean {
  return typeof command === 'string' && command.includes(ROUTER_STATUS_SEGMENT);
}

export function buildStatusLineCommand(proxyRoot: string): string {
  return buildNpxTsxCommand(proxyRoot, ROUTER_STATUS_SEGMENT);
}

export function validateProxyRoot(proxyRoot: string): void {
  const root = resolve(proxyRoot);
  const scriptPath = join(root, ROUTER_STATUS_SEGMENT);
  const providersPath = join(root, 'routing', 'providers');
  if (!existsSync(scriptPath)) {
    throw new Error(`No se encontró ${scriptPath}. Ejecute el instalador desde la raíz del proxy.`);
  }
  if (!existsSync(providersPath)) {
    throw new Error(
      `No se encontró ${providersPath}. Compruebe --root o el directorio de trabajo.`,
    );
  }
}

export function shouldOverwriteStatusLine(
  existingCommand: string | undefined,
  force: boolean,
): { ok: true } | { ok: false; message: string } {
  if (force) return { ok: true };
  if (!existingCommand) return { ok: true };
  if (isSmartCodeStatusLine(existingCommand)) return { ok: true };
  return {
    ok: false,
    message:
      'Ya existe un statusLine que no es de Smart Code Proxy. Use --force para sobrescribirlo.',
  };
}

export function buildStatusLineBlock(command: string): NonNullable<ClaudeSettings['statusLine']> {
  return {
    type: 'command',
    command,
    padding: 0,
  };
}

export function applyStatuslineInstall(
  settings: ClaudeSettings,
  proxyRoot: string,
  force: boolean,
): ClaudeSettings | { error: string } {
  const check = shouldOverwriteStatusLine(settings.statusLine?.command, force);
  if (!check.ok) return { error: check.message };

  const command = buildStatusLineCommand(proxyRoot);
  const root = resolve(proxyRoot);
  const next: ClaudeSettings = { ...settings };
  next.statusLine = buildStatusLineBlock(command);
  if (!next.env) next.env = {};
  next.env[SMART_CODE_PROXY_ROOT_KEY] = root;
  return next;
}

export function applyStatuslineUninstall(settings: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  delete next.statusLine;
  if (next.env) {
    delete next.env[SMART_CODE_PROXY_ROOT_KEY];
    if (Object.keys(next.env).length === 0) {
      delete next.env;
    }
  }
  return next;
}

export interface InstallStatuslineRunOptions {
  root: string;
  dryRun: boolean;
  force: boolean;
  uninstall: boolean;
}

export function runInstallStatusline(options: InstallStatuslineRunOptions): number {
  const proxyRoot = resolve(options.root);

  try {
    if (!options.uninstall) {
      validateProxyRoot(proxyRoot);
    }
  } catch (err) {
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }

  const settings = readClaudeSettings();

  if (options.uninstall) {
    const next = applyStatuslineUninstall(settings);
    if (options.dryRun) {
      console.log(chalk.yellow('[dry-run] Se eliminarían statusLine y SMART_CODE_PROXY_ROOT'));
      return 0;
    }
    writeClaudeSettings(next);
    console.log(chalk.green('Statusline de Smart Code Proxy desinstalado.'));
    return 0;
  }

  const command = buildStatusLineCommand(proxyRoot);
  const result = applyStatuslineInstall(settings, proxyRoot, options.force);
  if ('error' in result) {
    console.error(chalk.red(result.error));
    return 1;
  }

  if (options.dryRun) {
    console.log(chalk.yellow('[dry-run] Valores que se escribirían:'));
    console.log(JSON.stringify({ statusLine: result.statusLine, env: result.env }, null, 2));
    return 0;
  }

  writeClaudeSettings(result);
  console.log(chalk.green('Statusline instalado correctamente.'));
  console.log(chalk.cyan(`  statusLine.command: ${command}`));
  console.log(chalk.cyan(`  env.${SMART_CODE_PROXY_ROOT_KEY}: ${resolve(proxyRoot)}`));
  console.log(
    chalk.cyan(
      '\nReinicie Claude Code para aplicar los cambios. Si mueve el repositorio, vuelva a ejecutar npm run install:statusline.',
    ),
  );
  return 0;
}

const program = new Command();

program
  .name('install-statusline')
  .description(
    'Instala o desinstala el statusline de Smart Code Proxy en ~/.claude/settings.json',
  )
  .option('--root <path>', 'Raíz del repositorio del proxy', process.cwd())
  .option('--dry-run', 'Muestra los valores sin escribir en settings.json')
  .option('--force', 'Sobrescribe un statusLine ajeno al proxy')
  .option('--uninstall', 'Elimina statusLine y SMART_CODE_PROXY_ROOT del proxy')
  .action((opts: { root: string; dryRun?: boolean; force?: boolean; uninstall?: boolean }) => {
    const code = runInstallStatusline({
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
