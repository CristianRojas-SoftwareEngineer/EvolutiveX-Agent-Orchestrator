import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { createAgentsReferenceManager } from './utils/create-agents-reference.js';

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

const manager = createAgentsReferenceManager();
manager.create(source, target);

console.log('');
console.log(chalk.cyan('Listo. AGENTS.md apunta a CLAUDE.md.'));
