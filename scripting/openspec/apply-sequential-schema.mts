import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const SOURCE_SCHEMA = 'spec-driven';
const TARGET_SCHEMA = 'sequential-spec-driven-design';

/** Repo donde vive el script (fuente canónica del schema local). */
const SOURCE_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const CANONICAL_FILES = [
  {
    label: 'schema.yaml',
    source: join(SOURCE_REPO_ROOT, 'openspec', 'schemas', TARGET_SCHEMA, 'schema.yaml'),
    dest: (cwd: string) => join(cwd, 'openspec', 'schemas', TARGET_SCHEMA, 'schema.yaml'),
  },
  {
    label: 'templates/tasks.md',
    source: join(
      SOURCE_REPO_ROOT,
      'openspec',
      'schemas',
      TARGET_SCHEMA,
      'templates',
      'tasks.md',
    ),
    dest: (cwd: string) =>
      join(cwd, 'openspec', 'schemas', TARGET_SCHEMA, 'templates', 'tasks.md'),
  },
] as const;

type Options = {
  cwd: string;
  force: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Options {
  let cwd = process.cwd();
  let force = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cwd' && argv[i + 1]) {
      cwd = resolve(argv[++i]);
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(chalk.red(`Argumento desconocido: ${arg}`));
      printHelp();
      process.exit(1);
    }
  }

  return { cwd, force, dryRun };
}

function printHelp(): void {
  console.log(`
Uso: tsx scripting/openspec/apply-sequential-openspec-schema.mts [opciones]

Aplica el schema local ${TARGET_SCHEMA} en un proyecto con @fission-ai/openspec 1.4.x:
fork del built-in → copia schema.yaml y templates/tasks.md desde este repositorio.

Opciones:
  --cwd <ruta>   Directorio raíz del proyecto destino (default: cwd actual)
  --force        Sobrescribe el fork del schema si ya existe
  --dry-run      Muestra las acciones sin ejecutarlas
  -h, --help     Muestra esta ayuda
`);
}

function logStep(message: string): void {
  console.log(chalk.cyan(`  → ${message}`));
}

function logOk(message: string): void {
  console.log(chalk.green(`  OK: ${message}`));
}

function logWarn(message: string): void {
  console.log(chalk.yellow(`  AVISO: ${message}`));
}

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function normalizeFileContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function assertCanonicalSchemaSourcesExist(): void {
  for (const file of CANONICAL_FILES) {
    if (!existsSync(file.source)) {
      throw new Error(
        `Falta el schema canónico en este repositorio: ${file.source}\n` +
          'Edita openspec/schemas/ aquí y vuelve a ejecutar el script en el proyecto destino.',
      );
    }
  }
}

function assertPrerequisites(cwd: string): void {
  const openspecDir = join(cwd, 'openspec');
  const configPath = join(openspecDir, 'config.yaml');

  if (!existsSync(openspecDir) && !existsSync(configPath)) {
    throw new Error(
      'OpenSpec no está inicializado: falta openspec/ o openspec/config.yaml en el proyecto destino.',
    );
  }

  assertCanonicalSchemaSourcesExist();

  try {
    const version = run('npx openspec --version', cwd).trim();
    logOk(`OpenSpec ${version} detectado`);
    if (!version.startsWith('1.4.')) {
      logWarn(`Se esperaba OpenSpec 1.4.x; versión detectada: ${version}`);
    }
  } catch {
    throw new Error('No se pudo ejecutar npx openspec. ¿Está @fission-ai/openspec instalado?');
  }
}

function schemaPath(cwd: string): string {
  return join(cwd, 'openspec', 'schemas', TARGET_SCHEMA, 'schema.yaml');
}

function isSchemaSynced(cwd: string): boolean {
  return CANONICAL_FILES.every((file) => {
    const dest = file.dest(cwd);
    if (!existsSync(dest)) return false;
    const canonical = normalizeFileContent(readFileSync(file.source, 'utf8'));
    const current = normalizeFileContent(readFileSync(dest, 'utf8'));
    return current === canonical;
  });
}

function syncCanonicalSchema(cwd: string, dryRun: boolean): string[] {
  const updated: string[] = [];

  for (const file of CANONICAL_FILES) {
    const canonical = normalizeFileContent(readFileSync(file.source, 'utf8'));
    const dest = file.dest(cwd);
    const current = existsSync(dest) ? normalizeFileContent(readFileSync(dest, 'utf8')) : '';

    if (current === canonical) continue;

    if (dryRun) {
      logStep(`[dry-run] Sincronizar ${file.label} → ${dest}`);
      updated.push(file.label);
      continue;
    }

    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, canonical, 'utf8');
    updated.push(file.label);
  }

  return updated;
}

function readProjectSchema(cwd: string): string | null {
  const configPath = join(cwd, 'openspec', 'config.yaml');
  if (!existsSync(configPath)) return null;
  const match = readFileSync(configPath, 'utf8').match(/^schema:\s*(\S+)\s*$/m);
  return match?.[1] ?? null;
}

function runFork(cwd: string, force: boolean, dryRun: boolean): void {
  const schemaDir = join(cwd, 'openspec', 'schemas', TARGET_SCHEMA);
  const exists = existsSync(schemaDir);

  if (exists && !force && isSchemaSynced(cwd)) {
    logOk(`Schema ${TARGET_SCHEMA} ya está sincronizado con el origen`);
    return;
  }

  const forceFlag = force || exists ? ' --force' : '';
  const cmd = `npx openspec schema fork ${SOURCE_SCHEMA} ${TARGET_SCHEMA}${forceFlag}`;

  if (dryRun) {
    logStep(`[dry-run] ${cmd}`);
    return;
  }

  if (exists && !force) {
    logStep(`Schema existente; omitiendo fork (usa --force para sobrescribir)`);
    return;
  }

  logStep(`Ejecutando: ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
  logOk(`Fork ${SOURCE_SCHEMA} → ${TARGET_SCHEMA} completado`);
}

function updateProjectConfig(cwd: string, dryRun: boolean): boolean {
  const configPath = join(cwd, 'openspec', 'config.yaml');
  const desired = `schema: ${TARGET_SCHEMA}\n`;
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';

  if (current === desired) {
    logOk('openspec/config.yaml ya apunta al schema correcto');
    return false;
  }

  if (dryRun) {
    logStep(`[dry-run] Escribir ${configPath} → schema: ${TARGET_SCHEMA}`);
    return true;
  }

  mkdirSync(join(cwd, 'openspec'), { recursive: true });
  writeFileSync(configPath, desired, 'utf8');
  logOk(`openspec/config.yaml actualizado → ${TARGET_SCHEMA}`);
  return true;
}

function buildOpenSpecSection(): string[] {
  return [
    '## OpenSpec',
    '',
    `Este proyecto usa [OpenSpec](https://www.npmjs.com/package/@fission-ai/openspec) con el schema local **\`${TARGET_SCHEMA}\`**, definido en [\`openspec/schemas/${TARGET_SCHEMA}/\`](./openspec/schemas/${TARGET_SCHEMA}/). El override vive en el repositorio para sobrevivir a \`openspec update\`.`,
    '',
    'Los artefactos de un cambio se generan en secuencia estricta:',
    '',
    '**proposal → specs → design → tasks**',
    '',
    'La configuración activa está en [`openspec/config.yaml`](./openspec/config.yaml).',
  ];
}

function extractOpenSpecSectionLines(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line === '## OpenSpec');
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function readmeHasCanonicalOpenSpecSection(content: string): boolean {
  const lines = content.split(/\r?\n/);
  const bounds = extractOpenSpecSectionLines(lines);
  if (!bounds) return false;

  const current = lines.slice(bounds.start, bounds.end).join('\n');
  const canonical = buildOpenSpecSection().join('\n');
  return current === canonical || current.startsWith(`${canonical}\n`);
}

function updateReadmeOpenSpecSection(cwd: string, dryRun: boolean): boolean {
  const readmePath = join(cwd, 'README.md');
  if (!existsSync(readmePath)) {
    logWarn('README.md no encontrado; omitiendo actualización de documentación');
    return false;
  }

  const content = readFileSync(readmePath, 'utf8');
  if (readmeHasCanonicalOpenSpecSection(content)) {
    logOk('README.md ya contiene la sección OpenSpec actualizada');
    return false;
  }

  const section = buildOpenSpecSection();
  const lines = content.split(/\r?\n/);
  const bounds = extractOpenSpecSectionLines(lines);

  let nextLines: string[];
  if (bounds) {
    const current = lines.slice(bounds.start, bounds.end).join('\n');
    const canonical = section.join('\n');
    if (current === canonical || current.startsWith(`${canonical}\n`)) {
      logOk('README.md ya contiene la sección OpenSpec actualizada');
      return false;
    }

    let end = bounds.end;
    for (let i = bounds.start + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        end = i;
        break;
      }
    }
    nextLines = [...lines.slice(0, bounds.start), ...section, '', ...lines.slice(end)];
  } else {
    const agentesIndex = lines.findIndex((line) => line === '## Agentes');
    if (agentesIndex >= 0) {
      nextLines = [...lines.slice(0, agentesIndex), ...section, '', ...lines.slice(agentesIndex)];
    } else {
      const trimmed = lines.join('\n').trimEnd();
      nextLines = [...trimmed.split(/\r?\n/), '', ...section];
    }
  }

  const next = `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;

  if (next.trimEnd() === content.trimEnd()) {
    logOk('README.md ya contiene la sección OpenSpec actualizada');
    return false;
  }

  if (dryRun) {
    logStep('[dry-run] Actualizar sección ## OpenSpec en README.md');
    return true;
  }

  writeFileSync(readmePath, next, 'utf8');
  logOk('README.md actualizado con sección OpenSpec');
  return true;
}

function verifySchema(cwd: string, dryRun: boolean): void {
  if (dryRun) {
    logStep('[dry-run] openspec schema validate / which / templates');
    return;
  }

  const validateOut = run(`npx openspec schema validate ${TARGET_SCHEMA}`, cwd);
  if (!validateOut.includes('valid')) {
    throw new Error(`Validación de schema falló:\n${validateOut}`);
  }
  logOk(`Schema ${TARGET_SCHEMA} válido`);

  const whichOut = run(`npx openspec schema which ${TARGET_SCHEMA}`, cwd);
  if (!/Source:\s*project/i.test(whichOut)) {
    throw new Error(`El schema no resuelve desde el proyecto:\n${whichOut}`);
  }
  if (!whichOut.includes(join('openspec', 'schemas', TARGET_SCHEMA))) {
    throw new Error(`Ruta de schema inesperada:\n${whichOut}`);
  }
  logOk('Resolución local confirmada (Source: project)');

  const templatesOut = run(`npx openspec templates --schema ${TARGET_SCHEMA}`, cwd);
  if (/node_modules/i.test(templatesOut)) {
    throw new Error(`Templates resueltos desde node_modules:\n${templatesOut}`);
  }
  if (!templatesOut.includes(join('openspec', 'schemas', TARGET_SCHEMA))) {
    throw new Error(`Rutas de templates inesperadas:\n${templatesOut}`);
  }
  logOk('Templates resueltos bajo openspec/schemas/');

  console.log('');
  console.log(chalk.cyan('Rutas de templates:'));
  for (const line of templatesOut.split(/\r?\n/)) {
    if (line.includes(':\\') || line.includes('openspec')) {
      console.log(chalk.gray(`  ${line.trim()}`));
    }
  }
  console.log('');
  console.log(chalk.cyan('Grafo de dependencias:'));
  console.log(chalk.gray('  proposal → specs → design → tasks'));
}

function isFullyApplied(cwd: string): boolean {
  const readmePath = join(cwd, 'README.md');
  const readmeOk =
    !existsSync(readmePath) || readmeHasCanonicalOpenSpecSection(readFileSync(readmePath, 'utf8'));

  return (
    isSchemaSynced(cwd) &&
    readProjectSchema(cwd) === TARGET_SCHEMA &&
    existsSync(schemaPath(cwd)) &&
    readmeOk
  );
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const { cwd, force, dryRun } = options;

  console.log(chalk.cyan('=== Aplicar DAG secuencial OpenSpec ==='));
  console.log(chalk.cyan(`Proyecto:  ${cwd}`));
  if (dryRun) console.log(chalk.yellow('Modo:      dry-run'));
  console.log('');

  assertPrerequisites(cwd);

  if (!force && !dryRun && isFullyApplied(cwd)) {
    logOk('El proyecto ya tiene el schema secuencial sincronizado');
    verifySchema(cwd, false);
    console.log('');
    console.log(chalk.cyan('Listo. Sin cambios necesarios.'));
    return;
  }

  runFork(cwd, force, dryRun);

  if (!dryRun && !existsSync(schemaPath(cwd))) {
    throw new Error(`No se encontró ${schemaPath(cwd)} tras el fork`);
  }

  const synced = syncCanonicalSchema(cwd, dryRun);
  if (dryRun) {
    if (synced.length === 0) {
      logStep('[dry-run] schema.yaml y templates/tasks.md ya coinciden con el origen');
    }
  } else if (synced.length === 0) {
    logOk('schema.yaml y templates/tasks.md ya coinciden con el origen');
  } else {
    logOk(`Sincronizado desde el repo origen: ${synced.join(', ')}`);
  }

  updateProjectConfig(cwd, dryRun);
  updateReadmeOpenSpecSection(cwd, dryRun);
  verifySchema(cwd, dryRun);

  console.log('');
  console.log(chalk.cyan('Listo. DAG secuencial OpenSpec aplicado.'));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`\nError: ${message}`));
  process.exit(1);
}
