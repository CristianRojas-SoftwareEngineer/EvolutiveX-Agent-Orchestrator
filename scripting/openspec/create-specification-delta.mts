#!/usr/bin/env tsx
/**
 * Scaffold canónico de un specification-delta (etapa create del pipeline).
 * Única vía de materializar un change nuevo con slug c<NNNNN>-<slug>.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { computeNextChangeId, resolveDefaultChangesDir } from './change-id.js';

const TARGET_SCHEMA = 'sequential-spec-driven-design';
const WORKBENCH_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPENSPEC_BIN = join(WORKBENCH_ROOT, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
const CONVERSATION_STUB = '## Conversation\n\n### user\n\n';

type Options = {
  cwd: string;
  slug: string;
  title?: string;
  json: boolean;
  dryRun: boolean;
};

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildOpenspecYaml(schema: string, title: string, now: Date): string {
  const iso = now.toISOString();
  return [
    `schema: ${schema}`,
    `created: ${iso}`,
    `title: ${title}`,
    `status: proposed`,
    `updated: ${iso}`,
    '',
  ].join('\n');
}

function readProjectSchema(cwd: string): string {
  const configPath = join(cwd, 'openspec', 'config.yaml');
  if (!existsSync(configPath)) return TARGET_SCHEMA;
  const match = readFileSync(configPath, 'utf8').match(/^schema:\s*(\S+)\s*$/m);
  return match?.[1] ?? TARGET_SCHEMA;
}

function parseArgs(argv: string[]): Options {
  let cwd = process.cwd();
  let slug = '';
  let title: string | undefined;
  let json = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cwd' && argv[i + 1]) {
      cwd = resolve(argv[++i]);
    } else if (arg === '--slug' && argv[i + 1]) {
      slug = argv[++i].trim();
    } else if (arg === '--title' && argv[i + 1]) {
      title = argv[++i].trim();
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-') && !slug) {
      slug = arg.trim();
    } else {
      console.error(chalk.red(`Argumento desconocido: ${arg}`));
      printHelp();
      process.exit(1);
    }
  }

  if (!slug) {
    console.error(chalk.red('Falta --slug <kebab-case>'));
    printHelp();
    process.exit(1);
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(chalk.red(`Slug inválido (kebab-case): ${slug}`));
    process.exit(1);
  }

  return { cwd, slug, title, json, dryRun };
}

function printHelp(): void {
  console.log(`
Uso: npm run openspec:create-specification-delta -- --slug <kebab-slug> [opciones]

Crea openspec/changes/c<NNNNN>-<slug>/ con .openspec.yaml enriquecido y conversation.md stub.

Opciones:
  --slug <kebab>   Slug descriptivo (obligatorio)
  --title <texto>  Título humano (default: derivado del slug)
  --cwd <ruta>     Raíz del proyecto (default: cwd)
  --json           Salida JSON { changeName, changeDir }
  --dry-run        Muestra acciones sin escribir
  -h, --help       Ayuda
`);
}

function runStatusGate(cwd: string, changeName: string): void {
  const cmd = existsSync(OPENSPEC_BIN)
    ? `node "${OPENSPEC_BIN}" status --change "${changeName}" --json`
    : `npx openspec status --change "${changeName}" --json`;
  execSync(cmd, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const { cwd, slug, title: titleOpt, json, dryRun } = options;

  const changesDir = resolveDefaultChangesDir(cwd);
  const id = computeNextChangeId(changesDir);
  const changeName = `${id}-${slug}`;
  const changeDir = join(changesDir, changeName);
  const title = titleOpt ?? slugToTitle(slug);
  const schema = readProjectSchema(cwd);
  const now = new Date();

  if (existsSync(changeDir)) {
    console.error(chalk.red(`El change ya existe: ${changeDir}`));
    process.exit(1);
  }

  if (dryRun) {
    const payload = { changeName, changeDir, schema, title };
    if (json) {
      console.log(JSON.stringify(payload));
    } else {
      console.log(chalk.cyan('[dry-run] Crearía:'));
      console.log(`  ${changeDir}`);
      console.log(`  .openspec.yaml (schema, created, title, status, updated)`);
      console.log(`  conversation.md (stub)`);
    }
    return;
  }

  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, '.openspec.yaml'), buildOpenspecYaml(schema, title, now), 'utf8');
  writeFileSync(join(changeDir, 'conversation.md'), CONVERSATION_STUB, 'utf8');

  try {
    runStatusGate(cwd, changeName);
  } catch (error) {
    console.error(chalk.red(`Gate openspec status falló para ${changeName}`));
    throw error;
  }

  if (json) {
    console.log(JSON.stringify({ changeName, changeDir }));
  } else {
    console.log(changeName);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`\nError: ${message}`));
  process.exit(1);
}
