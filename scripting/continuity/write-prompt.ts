import { openSync, readSync, writeFileSync, closeSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Escribe contenido al archivo `.claude/continuity-prompt.md` en el cwd.
 *
 * Entrada (en orden de prioridad):
 *   1. stdin  → cat archivo.md | npm run continuity:write
 *   2. argv[2] → npm run continuity:write -- "contenido"
 *
 * Tested en: Bash, Git Bash, PowerShell. Compatible con contenido multilínea
 * y caracteres especiales (< > &).
 */
const CONTENT_ARG_INDEX = 2;

function main(): void {
  let content = process.argv[CONTENT_ARG_INDEX];

  // Si argv[2] no se proporciono, leer stdin via file descriptor 0.
  if (!content && !process.stdin.isTTY) {
    const BUFSIZE = 8192;
    const bufs: Buffer[] = [];
    // En Windows (Git Bash) /dev/stdin no existe; usar fd 0 directamente.
    const fd = process.platform === 'win32'
      ? 0   // fd 0 funciona en todas partes en Windows
      : openSync('/dev/stdin', 'r');
    try {
      const buf = Buffer.alloc(BUFSIZE);
      let n: number;
      while ((n = readSync(fd, buf, 0, BUFSIZE, null)) > 0) {
        bufs.push(Buffer.from(buf.subarray(0, n)));
      }
    } finally {
      if (process.platform !== 'win32') closeSync(fd);
    }
    content = Buffer.concat(bufs).toString('utf-8').trim();
  }

  if (!content) {
    const help = [
      'Error: se requiere el contenido via stdin o argv[2].',
      'Uso (stdin):     cat archivo.md | npm run continuity:write',
      'Uso (argv[2]):   npm run continuity:write -- "contenido"',
    ].join('\n');
    console.error(help);
    process.exit(1);
  }

  const outputPath = join(process.cwd(), '.claude', 'continuity-prompt.md');

  try {
    writeFileSync(outputPath, content, 'utf-8');
    console.log(`Prompt de continuidad escrito en: ${outputPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error al escribir ${outputPath}: ${msg}`);
    process.exit(1);
  }
}

main();
