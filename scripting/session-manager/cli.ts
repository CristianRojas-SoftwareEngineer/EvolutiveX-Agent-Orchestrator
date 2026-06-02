#!/usr/bin/env tsx
import { Command } from 'commander';
import chalk from 'chalk';
import {
  archiveSession,
  deleteSession,
  handleArchiveError,
  listArchivedSessions,
  listSessions,
  parseSessionIds,
  restoreSession,
} from './archive.js';
import {
  printSanitizeAllSummary,
  printSanitizeResult,
  runSanitizeScan,
  sanitizeAllSessions,
  sanitizeSession,
} from './sanitize.js';

const args = process.argv.slice(2);

/** `sanitize <sessionId>` sin subcomando (npm run sessions:sanitize -- <id>). */
async function trySanitizeById(): Promise<boolean> {
  if (args[0] !== 'sanitize' || !args[1] || ['scan', 'all'].includes(args[1])) {
    return false;
  }
  try {
    const result = await sanitizeSession(args[1]);
    printSanitizeResult(result);
    return true;
  } catch (err) {
    handleArchiveError(err);
    return true;
  }
}

const program = new Command();

program
  .name('session-manager')
  .description(
    'Gestión de sesiones Claude Code (~/.claude/projects): listar, archivar, eliminar, restaurar y sanitizar.',
  );

program
  .command('list')
  .description('Lista sesiones del proyecto actual (o --project)')
  .option('-p, --project <path>', 'Ruta del proyecto', process.cwd())
  .action(async (opts: { project: string }) => {
    try {
      await listSessions(opts.project);
    } catch (err) {
      handleArchiveError(err);
    }
  });

program
  .command('archive')
  .description('Archiva una o más sesiones (mueve a ~/.claude/archived-sessions/)')
  .argument('[sessionIds...]', 'ID(s) de sesión (o prefijo único)')
  .option('-p, --project <path>', 'Ruta del proyecto', process.cwd())
  .option('--ids <csv>', 'IDs separados por coma')
  .action(async (positional: string[], opts: { project: string; ids?: string }) => {
    const ids = parseSessionIds(opts.ids, positional);
    if (ids.length === 0) {
      console.error(chalk.red('Indica al menos un session ID.'));
      process.exit(1);
    }
    try {
      for (const id of ids) {
        const result = await archiveSession(id, opts.project);
        console.log(chalk.green(`Archivada: ${result.sessionId}`));
        console.log(chalk.gray(`  → ${result.destination}`));
      }
    } catch (err) {
      handleArchiveError(err);
    }
  });

program
  .command('delete')
  .description('Elimina permanentemente una o más sesiones (requiere --force)')
  .argument('[sessionIds...]', 'ID(s) de sesión')
  .option('-p, --project <path>', 'Ruta del proyecto', process.cwd())
  .option('--ids <csv>', 'IDs separados por coma')
  .option('-f, --force', 'Confirmar eliminación irreversible')
  .action(async (positional: string[], opts: { project: string; ids?: string; force?: boolean }) => {
    if (!opts.force) {
      console.error(
        chalk.red(
          'Eliminación irreversible. Repite con --force / -f.\nEjemplo: npm run sessions:delete -- <id> --force',
        ),
      );
      process.exit(1);
    }
    const ids = parseSessionIds(opts.ids, positional);
    if (ids.length === 0) {
      console.error(chalk.red('Indica al menos un session ID.'));
      process.exit(1);
    }
    try {
      for (const id of ids) {
        await deleteSession(id, opts.project);
        console.log(chalk.green(`Eliminada: ${id}`));
      }
    } catch (err) {
      handleArchiveError(err);
    }
  });

program
  .command('list-archived')
  .description('Lista sesiones en ~/.claude/archived-sessions/')
  .action(async () => {
    try {
      await listArchivedSessions();
    } catch (err) {
      handleArchiveError(err);
    }
  });

program
  .command('restore')
  .description('Restaura una sesión archivada al proyecto de origen')
  .argument('<sessionId>', 'ID de sesión (o prefijo único)')
  .action(async (sessionId: string) => {
    try {
      const result = await restoreSession(sessionId);
      console.log(chalk.green(`Restaurada: ${result.sessionId}`));
      console.log(`  Proyecto: ${result.project}`);
      console.log(chalk.gray(`  → ${result.destination}`));
    } catch (err) {
      handleArchiveError(err);
    }
  });

const sanitizeCmd = program
  .command('sanitize')
  .description(
    'Thinking blocks con firma inválida (p. ej. tras Smart Code Proxy) — scan | all | <sessionId>',
  );

sanitizeCmd
  .command('scan')
  .description('Lista sesiones con thinking blocks de firma inválida')
  .action(async () => {
    try {
      await runSanitizeScan();
    } catch (err) {
      handleArchiveError(err);
    }
  });

sanitizeCmd
  .command('all')
  .description('Sanitiza todas las sesiones detectadas por scan')
  .option('-f, --force', 'Confirmar sanitización en lote')
  .action(async (opts: { force?: boolean }) => {
    if (!opts.force) {
      console.error(
        chalk.red('Requiere --force. Ejemplo: npm run sessions:sanitize:all -- --force'),
      );
      process.exit(1);
    }
    try {
      const summary = await sanitizeAllSessions();
      printSanitizeAllSummary(summary);
    } catch (err) {
      handleArchiveError(err);
    }
  });

async function main(): Promise<void> {
  if (await trySanitizeById()) return;
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
