#!/usr/bin/env tsx
/**
 * Parchea @fission-ai/openspec para aceptar `created` ISO 8601 completo en .openspec.yaml.
 * Idempotente; ejecutar tras npm install si el paquete se reinstala.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = join(
  REPO_ROOT,
  'node_modules',
  '@fission-ai',
  'openspec',
  'dist',
  'core',
  'change-metadata',
  'schema.js',
);

const OLD_SNIPPET = `    created: z
        .string()
        .regex(/^\\d{4}-\\d{2}-\\d{2}$/, {
        message: 'created must be YYYY-MM-DD format',
    })
        .optional(),`;

const NEW_SNIPPET = `    created: z
        .string()
        .regex(/^\\d{4}-\\d{2}-\\d{2}(T[\\d:.+-]+Z?)?$/, {
        message: 'created must be YYYY-MM-DD or ISO 8601 format',
    })
        .optional(),`;

function main(): void {
  let content: string;
  try {
    content = readFileSync(SCHEMA_PATH, 'utf8');
  } catch {
    console.warn('openspec no instalado; omitiendo parche de metadata');
    process.exit(0);
  }

  if (content.includes("message: 'created must be YYYY-MM-DD or ISO 8601 format'")) {
    console.log('openspec change-metadata ya parcheado (dual YYYY-MM-DD / ISO 8601)');
    return;
  }
  if (!content.includes(OLD_SNIPPET)) {
    console.error(
      'No se encontró el fragmento esperado en schema.js; revisar versión de @fission-ai/openspec',
    );
    process.exit(1);
  }
  writeFileSync(SCHEMA_PATH, content.replace(OLD_SNIPPET, NEW_SNIPPET), 'utf8');
  console.log('Parcheado openspec change-metadata: created acepta YYYY-MM-DD o ISO 8601 completo');
}

main();
