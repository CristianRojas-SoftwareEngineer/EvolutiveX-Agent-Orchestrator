import { Command } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  readClaudeSettings,
  writeClaudeSettings,
  STATUSLINE_ROUTER_DETAILS_KEY,
  type ClaudeSettings,
} from './shared/claude-settings.js';

export type RouterDetailsAction = 'on' | 'off' | 'toggle';

export function applyRouterDetails(
  settings: ClaudeSettings,
  action: RouterDetailsAction,
): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  if (!next.env) next.env = {};

  let value: string;
  if (action === 'toggle') {
    value = next.env[STATUSLINE_ROUTER_DETAILS_KEY]?.trim().toLowerCase() === 'on' ? 'off' : 'on';
  } else {
    value = action;
  }

  next.env = { ...next.env, [STATUSLINE_ROUTER_DETAILS_KEY]: value };
  return next;
}

export interface RouterDetailsRunOptions {
  action: RouterDetailsAction;
  dryRun: boolean;
}

export function runRouterDetails({ action, dryRun }: RouterDetailsRunOptions): number {
  const settings = readClaudeSettings();
  const next = applyRouterDetails(settings, action);
  const resultValue = next.env![STATUSLINE_ROUTER_DETAILS_KEY];

  if (dryRun) {
    console.log(chalk.yellow(`[dry-run] ${STATUSLINE_ROUTER_DETAILS_KEY} quedaría: ${resultValue}`));
    return 0;
  }

  writeClaudeSettings(next);
  console.log(
    chalk.green(`${STATUSLINE_ROUTER_DETAILS_KEY} = ${resultValue}`),
  );
  console.log(chalk.cyan('El statusline refleja el cambio en el siguiente refresh.'));
  return 0;
}

const program = new Command();

program
  .name('statusline-router-details')
  .description('Controla la visibilidad de la Tabla 2 del statusline (Trabajo por niveles de razonamiento)')
  .option('--dry-run', 'Muestra el valor resultante sin escribir en settings.json');

program
  .command('on')
  .description('Muestra la Tabla 2 en el statusline')
  .action(() => {
    const code = runRouterDetails({ action: 'on', dryRun: Boolean(program.opts().dryRun) });
    if (code !== 0) process.exit(code);
  });

program
  .command('off')
  .description('Oculta la Tabla 2 en el statusline')
  .action(() => {
    const code = runRouterDetails({ action: 'off', dryRun: Boolean(program.opts().dryRun) });
    if (code !== 0) process.exit(code);
  });

program
  .command('toggle')
  .description('Alterna la visibilidad de la Tabla 2 (on→off, off/ausente→on)')
  .action(() => {
    const code = runRouterDetails({ action: 'toggle', dryRun: Boolean(program.opts().dryRun) });
    if (code !== 0) process.exit(code);
  });

const entryPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === invokedPath) {
  program.parse();
}
