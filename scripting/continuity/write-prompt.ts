import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Escribe el contenido pasado como segundo argumento al archivo
 * `.claude/continuity-prompt.md` en el directorio de trabajo actual.
 *
 * Invocación multiplataforma (funciona en bash, PowerShell, cmd):
 *   npm run continuity:write -- "contenido del prompt"
 *
 * El guión doble `--` es necesario para que npm pase el argumento al script
 * sin interpretarlo como opción de npm.
 */
const CONTENT_ARG_INDEX = 2;

function main(): void {
  const content = process.argv[CONTENT_ARG_INDEX];

  if (!content) {
    console.error(
      'Error: se requiere el contenido como argumento.\n' +
        'Uso: npm run continuity:write -- "contenido del prompt"\n' +
        'Nota: usar -- para separar los argumentos de npm.',
    );
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
