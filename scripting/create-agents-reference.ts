import { existsSync, unlinkSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

const cwd = process.cwd();
const source = join(cwd, 'CLAUDE.md');
const target = join(cwd, 'AGENTS.md');

if (!existsSync(source)) {
  console.error(chalk.red('Error: CLAUDE.md no se encontró en la raíz del proyecto.'));
  process.exit(1);
}

console.log(chalk.cyan('=== Crear referencia multi-agente ==='));
console.log(chalk.cyan(`Origen:    ${source}`));
console.log(chalk.cyan(`Destino:   ${target}`));
console.log('');

if (existsSync(target)) {
  unlinkSync(target);
  console.log(chalk.yellow('  AVISO: existía un archivo AGENTS.md previo. Se sobrescribirá.'));
}

linkSync(source, target);
console.log(chalk.green('  OK: hardlink AGENTS.md → CLAUDE.md creado.'));

console.log('');
console.log(chalk.cyan('Listo. AGENTS.md apunta a CLAUDE.md.'));
