import chalk from 'chalk';

export interface SessionRow {
  index: number;
  sessionId: string;
  title: string;
  messages: string;
  size: string;
  created: string;
  modified: string;
  active: boolean;
}

export function printSessionTable(rows: SessionRow[], emptyMessage?: string): void {
  if (rows.length === 0) {
    console.log(chalk.yellow(emptyMessage ?? 'No hay sesiones.'));
    return;
  }

  const headers = ['#', 'Session ID', 'Nombre', 'Msgs', 'Tamaño', 'Creado', 'Modificado', ''];
  const colWidths = [4, 38, 32, 6, 10, 18, 18, 10];

  const pad = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w));

  console.log(chalk.bold(headers.map((h, i) => pad(h, colWidths[i]!)).join(' ')));
  console.log(chalk.gray('─'.repeat(colWidths.reduce((a, b) => a + b + 1, 0))));

  for (const row of rows) {
    const activeLabel = row.active ? chalk.red('[ACTIVA]') : '';
    console.log(
      [
        pad(String(row.index), colWidths[0]!),
        pad(row.sessionId, colWidths[1]!),
        pad(row.title.replace(/[|\r\n]/g, ' '), colWidths[2]!),
        pad(row.messages, colWidths[3]!),
        pad(row.size, colWidths[4]!),
        pad(row.created, colWidths[5]!),
        pad(row.modified, colWidths[6]!),
        activeLabel,
      ].join(' '),
    );
  }

  const activeCount = rows.filter((r) => r.active).length;
  if (activeCount > 0) {
    console.log(
      chalk.yellow(
        `\n${activeCount} sesión(es) activa(s): no se pueden archivar ni eliminar hasta cerrarlas.`,
      ),
    );
  }
}

export function printSanitizeScanTable(
  rows: Array<{
    index: number;
    sessionId: string;
    project: string;
    corruptBlocks: number;
    totalLines: number;
  }>,
): void {
  if (rows.length === 0) {
    console.log(chalk.green('No se encontraron sesiones con thinking blocks inválidos.'));
    return;
  }

  console.log(chalk.bold(`Sesiones con firmas inválidas (${rows.length}):\n`));
  for (const r of rows) {
    console.log(
      `  ${r.index}. ${chalk.cyan(r.sessionId)}  ${chalk.gray(r.project)}  ` +
        `bloques=${r.corruptBlocks}  líneas=${r.totalLines}`,
    );
  }
}
