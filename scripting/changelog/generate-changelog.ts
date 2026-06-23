#!/usr/bin/env node
// scripting/changelog/generate-changelog.ts — regenera CHANGELOG.md desde el historial
// de conventional commits (Keep a Changelog). Estado derivado: nunca editar
// CHANGELOG.md a mano. Fuente de verdad = historial git.
//
// Uso: tsx scripting/changelog/generate-changelog.ts
// No hace commit ni amend. El hook post-commit se encarga.

import { execFileSync } from 'child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type CommitSection = 'added' | 'changed' | 'fixed' | 'documentation';

export interface ParsedCommitLine {
  refs: string;
  subject: string;
  date: string;
  tag: string | null;
}

// ---------------------------------------------------------------------------
// Función pura: clasifica el subject según conventional commit
// ---------------------------------------------------------------------------

/**
 * Extrae el tipo de commit del subject.
 * feat->added, fix->fixed, perf|refactor->changed, docs->documentation.
 * El resto (chore, test, build, ci, style) retorna null (se descarta).
 * Maneja scopes opcionales: `feat(api): add endpoint` -> 'added'.
 */
export function classifyCommitType(subject: string): CommitSection | null {
  const type = subject.split(':')[0]!.split('(')[0]!.trimEnd();
  switch (type) {
    case 'feat':
      return 'added';
    case 'fix':
      return 'fixed';
    case 'perf':
    case 'refactor':
      return 'changed';
    case 'docs':
      return 'documentation';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Función pura: parsea una línea de git log
// ---------------------------------------------------------------------------

/**
 * Parsea una línea `refs|subject|date` del formato --pretty='%D|%s|%as'.
 * El subject puede contener pipes. La división es: primer `|` -> refs,
 * último `|` -> date, lo que queda en medio -> subject.
 */
export function parseCommitLine(line: string): ParsedCommitLine {
  const firstSep = line.indexOf('|');
  const lastSep = line.lastIndexOf('|');

  const refs = firstSep >= 0 ? line.slice(0, firstSep) : '';
  const date = lastSep > firstSep ? line.slice(lastSep + 1) : '';
  const subject = firstSep < lastSep ? line.slice(firstSep + 1, lastSep) : line.slice(firstSep + 1);

  let tag: string | null = null;
  const tagMatch = /tag: ([^, ]+)/.exec(refs);
  if (tagMatch) {
    tag = tagMatch[1]!;
  }

  return { refs, subject: subject.trim(), date: date.trim(), tag };
}

// ---------------------------------------------------------------------------
// Función pura: formatea el CHANGELOG completo
// ---------------------------------------------------------------------------

export interface Commit {
  section: CommitSection;
  description: string;
}

export interface BlockEntry {
  tag: string | null; // null = unreleased
  date: string;
  commits: Commit[];
}

/**
 * Formatea la lista de entradas agrupadas por bloque en CHANGELOG.md.
 * Mantiene el orden de aparición de los bloques.
 */
export function formatChangelog(
  blocks: Array<{ key: string; tag: string | null; date: string; sections: Map<CommitSection, string[]> }>,
): string {
  const lines: string[] = [
    '# Changelog',
    '',
    'All notable changes are derived from conventional commits. Do not edit by hand.',
  ];

  const sectionLabels: Record<CommitSection, string> = {
    added: '### Added',
    changed: '### Changed',
    fixed: '### Fixed',
    documentation: '### Documentation',
  };

  for (const block of blocks) {
    lines.push('');
    if (block.tag === null) {
      lines.push('## [Unreleased]');
    } else {
      lines.push(`## [${block.tag.replace(/^v/, '')}] -- ${block.date}`);
    }

    for (const [section, label] of Object.entries(sectionLabels)) {
      const entries = block.sections.get(section as CommitSection);
      if (!entries || entries.length === 0) continue;
      lines.push(label);
      for (const entry of entries) {
        lines.push(`- ${entry}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI main
// ---------------------------------------------------------------------------

function main(): void {
  if (process.argv.length > 2) {
    console.error('Error: argumento eliminado: el script no acepta flags');
    process.exit(1);
  }

  const logOutput = execFileSync('git', ['log', '--pretty=format:%D|%s|%as'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  // Agrupación por bloque (unreleased o tag)
  const blockMap = new Map<string, BlockEntry>();
  const order: string[] = [];
  let currentKey = 'unreleased';
  let currentBlock = blockMap.get(currentKey);
  if (!currentBlock) {
    currentBlock = { tag: null, date: '', commits: [] };
    blockMap.set(currentKey, currentBlock);
    order.push(currentKey);
  }

  for (const line of logOutput.split('\n')) {
    if (!line.trim()) continue;

    const { refs, subject, date } = parseCommitLine(line);

    // Detectar cambio de bloque por tag
    if (refs.includes('tag:')) {
      const tagMatch = /tag: ([^, ]+)/.exec(refs);
      if (tagMatch) {
        const newKey = tagMatch[1]!;
        if (newKey !== currentKey) {
          currentKey = newKey;
          if (!blockMap.has(currentKey)) {
            blockMap.set(currentKey, { tag: currentKey, date, commits: [] });
            order.push(currentKey);
          }
          currentBlock = blockMap.get(currentKey)!;
        }
      }
    }

    const section = classifyCommitType(subject);
    if (section === null) continue;

    const desc = subject.split(':').slice(1).join(':').trim();
    currentBlock!.commits.push({ section, description: desc });
  }

  // Construir bloques con secciones agrupadas, preservando orden de tags
  const formattedBlocks = order.map((key) => {
    const block = blockMap.get(key)!;
    const sections = new Map<CommitSection, string[]>();
    for (const commit of block.commits) {
      if (!sections.has(commit.section)) {
        sections.set(commit.section, []);
      }
      sections.get(commit.section)!.push(commit.description);
    }
    return { key, tag: block.tag, date: block.date, sections };
  });

  const changelog = formatChangelog(formattedBlocks);
  const outPath = join(process.cwd(), 'CHANGELOG.md');
  writeFileSync(outPath, changelog, 'utf-8');
}

main();
