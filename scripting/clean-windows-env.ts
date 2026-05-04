import { execSync } from 'node:child_process';
import chalk from 'chalk';

const MANAGED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
];

if (process.platform !== 'win32') {
  console.log(chalk.yellow('Este script solo aplica en Windows. Nada que limpiar.'));
  process.exit(0);
}

console.log(chalk.cyan('\n=== Limpieza de variables Claude Code en entorno de usuario de Windows ===\n'));

for (const name of MANAGED_ENV_VARS) {
  try {
    const value = execSync(
      `powershell -Command "[Environment]::GetEnvironmentVariable('${name}', 'User')"`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();

    if (!value || value === 'null') {
      console.log(chalk.gray(`  [WIN-SKIP]   ${name}`));
      continue;
    }

    execSync(
      `powershell -Command "[Environment]::SetEnvironmentVariable('${name}', $null, 'User')"`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log(chalk.green(`  [WIN-REMOVE] ${name} = ${value}`));
  } catch {
    console.warn(chalk.yellow(`  [WIN-WARN]   No se pudo limpiar ${name} del entorno de usuario de Windows.`));
  }
}

console.log(chalk.cyan('\nLimpieza completada.\n'));
