#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { resolveDefaultChangesDir } from './change-id.js';

/**
 * Orden canónico del DAG: los cuatro primeros son artefactos de planificación;
 * 'synchronized' es el único nivel post-plan (estado del change tras synchronize).
 */
const ARTIFACT_ORDER = ['proposal', 'specs', 'design', 'tasks', 'synchronized'] as const;
type Artifact = (typeof ARTIFACT_ORDER)[number];

function parseArgs(argv: string[]): { changeName: string | null; through: string | null } {
  let changeName: string | null = null;
  let through: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--change' && argv[i + 1]) {
      changeName = argv[++i];
    } else if (arg.startsWith('--change=')) {
      changeName = arg.slice('--change='.length);
    } else if (arg === '--through' && argv[i + 1]) {
      through = argv[++i];
    } else if (arg.startsWith('--through=')) {
      through = arg.slice('--through='.length);
    }
  }
  return { changeName, through };
}

/** Resuelve la doneness por artefacto leyendo `openspec status --change <name> --json`. */
function readArtifactStatus(changeName: string): Map<string, string> {
  const cli = join(process.cwd(), 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
  const raw = execFileSync(process.execPath, [cli, 'status', '--change', changeName, '--json'], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(raw) as { artifacts?: Array<{ id: string; status: string }> };
  const byId = new Map<string, string>();
  for (const artifact of parsed.artifacts ?? []) {
    byId.set(artifact.id, artifact.status);
  }
  return byId;
}

/** Lee un archivo y devuelve su contenido recortado, o null si no existe. */
function readTrimmed(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, 'utf8').trim();
}

/** Recolecta recursivamente los `*.md` bajo un directorio. */
function collectSpecFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) {
    return out;
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSpecFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/** Clase estructural del delta resuelta desde la sección Capabilities del proposal. */
type DeltaClass = 'behavioral' | 'non-canonical' | 'invalid';

interface DeltaClassification {
  klass: DeltaClass;
  /** Capabilities declaradas bajo New/Modified (tokens kebab-case). */
  declaredCapabilities: string[];
  /** Items no canónicos (retiros o adiciones) listados bajo `### Non-canonical change`. */
  nonCanonicalItems: string[];
}

/** Un bullet es placeholder (no aporta item real) si es cursiva pura o declara «ninguna». */
function isPlaceholderBullet(text: string): boolean {
  const t = text.trim();
  return /^[_*].*[_*]$/.test(t) || /\b(ninguna|ninguno|none|n\/a)\b/i.test(t);
}

/**
 * Clasifica el delta parseando la sección Capabilities del proposal. New/Modified
 * Capabilities con ≥1 item marcan delta *conductual*; una subsección
 * `### Non-canonical change` (o el histórico `### No behavioral change`) con ≥1 item
 * marca delta *no canónico*; declarar ambas a la vez es *invalid*. Un item de capability
 * aporta un token kebab-case (preferentemente entre backticks); los placeholders en
 * cursiva («_(ninguna …)_») no aportan ninguno.
 */
function classifyDelta(proposal: string): DeltaClassification {
  const caps = new Set<string>();
  const nonCanonical: string[] = [];
  const lines = proposal.split(/\r?\n/);
  type Subsection = 'capabilities' | 'non-canonical' | null;
  let subsection: Subsection = null;
  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.*)$/);
    if (heading) {
      const title = heading[1].toLowerCase();
      if (/new capabilities|modified capabilities/.test(title)) {
        subsection = 'capabilities';
      } else if (/non-canonical change|no behavioral change/.test(title)) {
        subsection = 'non-canonical';
      } else {
        subsection = null;
      }
      continue;
    }
    if (!subsection) {
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (!bullet) {
      continue;
    }
    if (subsection === 'capabilities') {
      const backtick = bullet[1].match(/`([a-z0-9][a-z0-9-]*)`/);
      const token = backtick ? backtick[1] : bullet[1].match(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/)?.[1];
      if (token) {
        caps.add(token);
      }
    } else if (!isPlaceholderBullet(bullet[1])) {
      nonCanonical.push(bullet[1].trim());
    }
  }

  const hasBehavioral = caps.size > 0;
  const hasNonCanonical = nonCanonical.length > 0;
  let klass: DeltaClass;
  if (hasBehavioral && hasNonCanonical) {
    klass = 'invalid';
  } else if (hasNonCanonical) {
    klass = 'non-canonical';
  } else {
    klass = 'behavioral';
  }
  return { klass, declaredCapabilities: [...caps], nonCanonicalItems: nonCanonical };
}

/** Verifica que un spec tenga ≥1 `### Requirement:` y ≥1 `#### Scenario:`. */
function specHasRequirementWithScenario(content: string): boolean {
  const hasRequirement = /^###\s+Requirement:/m.test(content);
  const hasScenario = /^####\s+Scenario:/m.test(content);
  return hasRequirement && hasScenario;
}

/** Normaliza un nombre de requisito para comparación whitespace-insensitive. */
function normalizeRequirementName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Extrae los nombres de `### Requirement:` de un contenido markdown. */
function parseRequirementNames(content: string): string[] {
  const names: string[] = [];
  for (const match of content.matchAll(/^###\s+Requirement:\s*(.+?)\s*$/gm)) {
    names.push(normalizeRequirementName(match[1]));
  }
  return names;
}

interface DeltaOperations {
  /** Nombres de requisito bajo `## REMOVED`/`## MODIFIED` y FROM de `## RENAMED`. */
  canonReferences: string[];
}

/**
 * Parsea las operaciones de un delta-spec que DEBEN casar con el canon: cada
 * `### Requirement:` bajo `## REMOVED`/`## MODIFIED` y cada `FROM:` bajo `## RENAMED`.
 */
function parseCanonReferences(content: string): DeltaOperations {
  const refs: string[] = [];
  const lines = content.split(/\r?\n/);
  let op: 'removed' | 'modified' | 'renamed' | 'other' = 'other';
  for (const line of lines) {
    const section = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\b/i);
    if (section) {
      const kind = section[1].toUpperCase();
      op =
        kind === 'REMOVED'
          ? 'removed'
          : kind === 'MODIFIED'
            ? 'modified'
            : kind === 'RENAMED'
              ? 'renamed'
              : 'other';
      continue;
    }
    if (line.startsWith('## ')) {
      op = 'other';
      continue;
    }
    if (op === 'removed' || op === 'modified') {
      const req = line.match(/^###\s+Requirement:\s*(.+?)\s*$/);
      if (req) {
        refs.push(normalizeRequirementName(req[1]));
      }
    } else if (op === 'renamed') {
      const from = line.match(/FROM:\s*(?:###\s*Requirement:\s*)?(.+?)\s*$/i);
      if (from) {
        refs.push(normalizeRequirementName(from[1]));
      }
    }
  }
  return { canonReferences: refs };
}

/** ¿Contiene el contenido alguna cabecera de operación canónica `## ADDED/MODIFIED/REMOVED/RENAMED`? */
function hasCanonicalOperationHeader(content: string): boolean {
  return /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\b/im.test(content);
}

const { changeName, through } = parseArgs(process.argv.slice(2));

if (!changeName) {
  console.error(
    'Uso: npm run openspec:verify-stage-completion -- --change <cNNNNN-slug> --through <proposal|specs|design|tasks|synchronized>',
  );
  process.exit(1);
}

const throughArtifact = (through ?? 'tasks') as Artifact;
if (!ARTIFACT_ORDER.includes(throughArtifact)) {
  console.error(
    `El valor de --through "${throughArtifact}" no es válido. Debe ser uno de: ${ARTIFACT_ORDER.join(', ')}.`,
  );
  process.exit(1);
}

const changesDir = resolveDefaultChangesDir();
const changeRoot = join(changesDir, changeName);

if (statSync(changeRoot, { throwIfNoEntry: false })?.isDirectory() !== true) {
  console.error(
    `CRITICAL: no se encontró el directorio del change "${changeName}" bajo ${changesDir}`,
  );
  process.exit(1);
}

const requiredArtifacts = ARTIFACT_ORDER.slice(0, ARTIFACT_ORDER.indexOf(throughArtifact) + 1);

let status: Map<string, string>;
try {
  status = readArtifactStatus(changeName);
} catch (error) {
  console.error(
    `CRITICAL: no se pudo resolver el estado de "${changeName}" vía openspec status --json.`,
  );
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const failures: string[] = [];

// 1. Doneness por artefacto (DAG hasta --through inclusive).
// Solo verifica artefactos que existen en el status JSON. 'synchronized' es un
// estado del change, no un artefacto de archivo, luego se verifica por su presencia
// en .openspec.yaml (sección 4), no aquí.
for (const artifact of requiredArtifacts) {
  if (!status.has(artifact)) {
    // Artefacto no existe en el status JSON — es un estado (ej. 'synchronized').
    // Se verifica por el campo status en .openspec.yaml (sección 4).
    continue;
  }
  if (status.get(artifact) !== 'done') {
    failures.push(
      `artefacto "${artifact}" no está en estado done (estado: ${status.get(artifact) ?? 'ausente'}).`,
    );
  }
}

// 2. No-vacuidad de los artefactos de archivo único.
const proposalContent = readTrimmed(join(changeRoot, 'proposal.md'));
if (requiredArtifacts.includes('proposal') && !proposalContent) {
  failures.push('proposal.md está ausente o vacío.');
}

if (requiredArtifacts.includes('design')) {
  const designContent = readTrimmed(join(changeRoot, 'design.md'));
  if (!designContent) {
    failures.push('design.md está ausente o vacío.');
  }
}

if (requiredArtifacts.includes('tasks')) {
  const tasksContent = readTrimmed(join(changeRoot, 'tasks.md'));
  if (!tasksContent) {
    failures.push('tasks.md está ausente o vacío.');
  } else if (!/^\s*-\s*\[[ xX]\]/m.test(tasksContent)) {
    failures.push('tasks.md no contiene ningún checkbox `- [ ]` rastreable.');
  }
}

// 3. Specs: clase del delta (conductual vs no canónica) y verificación por clase.
if (requiredArtifacts.includes('specs')) {
  const specsDir = join(changeRoot, 'specs');
  const specFiles = collectSpecFiles(specsDir);
  const canonicalSpecsDir = join(changesDir, '..', 'specs');

  const classification = proposalContent
    ? classifyDelta(proposalContent)
    : ({
        klass: 'behavioral',
        declaredCapabilities: [],
        nonCanonicalItems: [],
      } as DeltaClassification);

  // El glob de specs nunca puede estar vacío, sea cual sea la clase.
  if (specFiles.length === 0) {
    failures.push(
      'specs/ está vacío: el glob `specs/**/*.md` no matchea ningún archivo. Un delta conductual escribe delta-specs; uno no canónico escribe un registro no canónico — nunca specs/ vacío.',
    );
  }

  if (classification.klass === 'invalid') {
    failures.push(
      'el proposal declara a la vez capabilities New/Modified y una subsección `### Non-canonical change`: un delta es conductual o no canónico, no ambos.',
    );
  } else if (classification.klass === 'non-canonical') {
    // Rama no canónica: ≥1 ítem declarado, ≥1 registro no vacío, sin operaciones canónicas.
    if (classification.nonCanonicalItems.length === 0) {
      failures.push(
        'la subsección `### Non-canonical change` no lista ningún ítem no canónico (≥1 requerido).',
      );
    }
    for (const file of specFiles) {
      const content = readFileSync(file, 'utf8').trim();
      const rel = file.slice(changeRoot.length + 1);
      if (!content) {
        failures.push(`el registro no canónico "${rel}" está vacío.`);
      } else if (hasCanonicalOperationHeader(content)) {
        failures.push(
          `el registro no canónico "${rel}" contiene cabeceras de operación canónica (## ADDED/MODIFIED/REMOVED/RENAMED): un delta no canónico registra los cambios en prosa, sin operaciones que \`synchronize\` promovería al canon.`,
        );
      }
    }
  } else {
    // Rama conductual: buena forma de cada delta-spec, paridad proposal↔specs y casado contra el canon.
    for (const file of specFiles) {
      const content = readFileSync(file, 'utf8').trim();
      const rel = file.slice(changeRoot.length + 1);
      if (!content) {
        failures.push(`spec "${rel}" está vacío.`);
        continue;
      }
      if (!specHasRequirementWithScenario(content)) {
        failures.push(
          `spec "${rel}" no contiene ≥1 \`### Requirement:\` con ≥1 \`#### Scenario:\`.`,
        );
      }
      // El nombre de la capability es el directorio padre del spec relativo a specs/.
      const relParts = file.slice(specsDir.length + 1).split(/[\\/]/);
      const cap = relParts.length > 1 ? relParts[0] : null;
      const { canonReferences } = parseCanonReferences(content);
      if (canonReferences.length > 0) {
        const canonSpec = cap ? readTrimmed(join(canonicalSpecsDir, cap, 'spec.md')) : null;
        const canonNames = new Set(
          (canonSpec ? parseRequirementNames(canonSpec) : []).map(normalizeRequirementName),
        );
        for (const ref of canonReferences) {
          if (!canonNames.has(ref)) {
            failures.push(
              `el requisito "${ref}" referenciado bajo REMOVED/MODIFIED/RENAMED en "${rel}" no existe en \`openspec/specs/${cap ?? '<cap>'}/spec.md\`: una operación sobre el canon DEBE casar con un requisito existente (sin REMOVED huérfanos).`,
            );
          }
        }
      }
    }

    // Paridad proposal↔specs: cada capability declarada en el proposal tiene su spec bien formado.
    for (const cap of classification.declaredCapabilities) {
      const capSpec = join(specsDir, cap, 'spec.md');
      const capContent = readTrimmed(capSpec);
      if (!capContent) {
        failures.push(
          `la capability "${cap}" declarada en proposal.md no tiene su \`specs/${cap}/spec.md\` (paridad rota).`,
        );
      } else if (!specHasRequirementWithScenario(capContent)) {
        failures.push(
          `el spec de la capability "${cap}" no contiene ≥1 \`### Requirement:\` con ≥1 \`#### Scenario:\`.`,
        );
      }
    }
  }
}

// 4. Verificación del estado 'synchronized' (nivel post-plan).
if (throughArtifact === 'synchronized') {
  // Lee el .openspec.yaml del change y verifica que status === 'synchronized'.
  const opspecYaml = readTrimmed(join(changeRoot, '.openspec.yaml'));
  if (!opspecYaml) {
    failures.push(
      `el archivo ".openspec.yaml" del change "${changeName}" está ausente o vacío — no se puede verificar el estado synchronized.`,
    );
  } else {
    // Extrae el campo status del YAML de forma robusta (sin dependencia de parser YAML).
    const statusMatch = opspecYaml.match(/^status:\s*(\S+)/m);
    const changeStatus = statusMatch ? statusMatch[1].replace(/['"]/g, '') : null;
    if (changeStatus !== 'synchronized') {
      failures.push(
        `el campo "status" en .openspec.yaml es "${changeStatus ?? 'ausente'}" pero se esperaba "synchronized". ` +
          `Synchronize debe completarse antes de archivar.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    `CRITICAL: la planificación de "${changeName}" hasta "${throughArtifact}" está incompleta (${failures.length} incumplimiento(s)):`,
  );
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

process.exit(0);
