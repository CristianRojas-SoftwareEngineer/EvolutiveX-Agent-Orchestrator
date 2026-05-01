import { existsSync, unlinkSync, linkSync } from 'node:fs';
import chalk from 'chalk';

// ── Interfaz ──────────────────────────────────────────────────

export interface IAgentsReferenceManager {
  create(source: string, target: string): void;
}

// ── Implementación (hardlink multiplataforma) ────────────────

class AgentsReferenceManager implements IAgentsReferenceManager {
  create(source: string, target: string): void {
    if (existsSync(target)) {
      unlinkSync(target);
      console.log(chalk.yellow('  AVISO: existía un archivo AGENTS.md previo. Se sobrescribirá.'));
    }

    linkSync(source, target);
    console.log(chalk.green('  OK: hardlink AGENTS.md → CLAUDE.md creado.'));
  }
}

// ── Factory ──────────────────────────────────────────────────

export function createAgentsReferenceManager(): IAgentsReferenceManager {
  return new AgentsReferenceManager();
}
