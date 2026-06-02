import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectsDir } from './shared/paths.js';
import { countCorruptThinkingBlocks, repairJsonlFile } from './shared/thinking-sanitize.js';
import { printSanitizeScanTable } from './shared/output.js';
import { SessionManagerError } from './archive.js';

export interface SanitizeScanRow {
  index: number;
  sessionId: string;
  project: string;
  corruptBlocks: number;
  totalLines: number;
}

export async function scanCorruptSessions(): Promise<SanitizeScanRow[]> {
  const projectsDir = getProjectsDir();
  const results: SanitizeScanRow[] = [];

  if (!existsSync(projectsDir)) return results;

  for (const projectSlug of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!projectSlug.isDirectory()) continue;
    const projectPath = join(projectsDir, projectSlug.name);

    for (const file of readdirSync(projectPath)) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionFile = join(projectPath, file);
      const sid = file.replace(/\.jsonl$/, '');
      try {
        const corrupt = await countCorruptThinkingBlocks(sessionFile);
        if (corrupt > 0) {
          const content = readFileSync(sessionFile, 'utf-8');
          const totalLines = content.split('\n').filter((l) => l.trim()).length;
          results.push({
            index: results.length + 1,
            sessionId: sid,
            project: projectSlug.name,
            corruptBlocks: corrupt,
            totalLines,
          });
        }
      } catch {
        /* ignore per-file errors */
      }
    }
  }

  return results.map((r, i) => ({ ...r, index: i + 1 }));
}

function findSessionJsonl(sessionId: string): { path: string; projectSlug: string } | null {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return null;

  for (const projectSlug of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!projectSlug.isDirectory()) continue;
    const candidate = join(projectsDir, projectSlug.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) {
      return { path: candidate, projectSlug: projectSlug.name };
    }
  }
  return null;
}

async function countSubagentCorrupt(sessionId: string, projectDir: string): Promise<number> {
  const subagentsDir = join(projectDir, sessionId, 'subagents');
  if (!existsSync(subagentsDir)) return 0;

  let total = 0;
  for (const file of readdirSync(subagentsDir)) {
    if (!file.endsWith('.jsonl')) continue;
    total += await countCorruptThinkingBlocks(join(subagentsDir, file));
  }
  return total;
}

async function repairSubagents(sessionId: string, projectDir: string): Promise<{
  files: number;
  blocksRemoved: number;
}> {
  const subagentsDir = join(projectDir, sessionId, 'subagents');
  if (!existsSync(subagentsDir)) return { files: 0, blocksRemoved: 0 };

  let files = 0;
  let blocksRemoved = 0;
  for (const file of readdirSync(subagentsDir)) {
    if (!file.endsWith('.jsonl')) continue;
    files++;
    blocksRemoved += await repairJsonlFile(join(subagentsDir, file));
  }
  return { files, blocksRemoved };
}

export async function sanitizeSession(sessionId: string): Promise<{
  sessionId: string;
  project: string;
  mainBlocksRemoved: number;
  subagentFiles: number;
  subagentBlocksRemoved: number;
  wasClean: boolean;
}> {
  const found = findSessionJsonl(sessionId);
  if (!found) {
    throw new SessionManagerError(`Sesión no encontrada: ${sessionId}`, 'not_found');
  }

  const projectDir = join(getProjectsDir(), found.projectSlug);
  const corruptCount = await countCorruptThinkingBlocks(found.path);
  const subagentCorrupt = await countSubagentCorrupt(sessionId, projectDir);

  if (corruptCount === 0 && subagentCorrupt === 0) {
    return {
      sessionId,
      project: found.projectSlug,
      mainBlocksRemoved: 0,
      subagentFiles: 0,
      subagentBlocksRemoved: 0,
      wasClean: true,
    };
  }

  const mainBlocksRemoved = await repairJsonlFile(found.path);
  const sub = await repairSubagents(sessionId, projectDir);

  return {
    sessionId,
    project: found.projectSlug,
    mainBlocksRemoved,
    subagentFiles: sub.files,
    subagentBlocksRemoved: sub.blocksRemoved,
    wasClean: false,
  };
}

export async function sanitizeAllSessions(): Promise<
  Array<{
    sessionId: string;
    mainBlocksRemoved: number;
    subagentBlocksRemoved: number;
    error?: string;
  }>
> {
  const scan = await scanCorruptSessions();
  const summary: Array<{
    sessionId: string;
    mainBlocksRemoved: number;
    subagentBlocksRemoved: number;
    error?: string;
  }> = [];

  for (const row of scan) {
    try {
      const result = await sanitizeSession(row.sessionId);
      summary.push({
        sessionId: row.sessionId,
        mainBlocksRemoved: result.mainBlocksRemoved,
        subagentBlocksRemoved: result.subagentBlocksRemoved,
      });
    } catch (err) {
      summary.push({
        sessionId: row.sessionId,
        mainBlocksRemoved: 0,
        subagentBlocksRemoved: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

export async function runSanitizeScan(): Promise<void> {
  const rows = await scanCorruptSessions();
  printSanitizeScanTable(rows);
}

export function printSanitizeResult(result: Awaited<ReturnType<typeof sanitizeSession>>): void {
  if (result.wasClean) {
    console.log(chalk.green(`Sesión ${result.sessionId} no tenía bloques corruptos.`));
    return;
  }

  console.log(chalk.green('Sesión sanitizada:'));
  console.log(`  Session ID: ${result.sessionId}`);
  console.log(`  Proyecto:   ${result.project}`);
  console.log(`  Bloques removidos (principal): ${result.mainBlocksRemoved}`);
  console.log(`  Archivos subagente: ${result.subagentFiles}`);
  console.log(`  Bloques removidos (subagentes): ${result.subagentBlocksRemoved}`);
  console.log(chalk.cyan(`\nReanudar con: claude --resume ${result.sessionId}`));
}

export function printSanitizeAllSummary(
  summary: Awaited<ReturnType<typeof sanitizeAllSessions>>,
): void {
  const ok = summary.filter((s) => !s.error);
  const failed = summary.filter((s) => s.error);
  const totalMain = ok.reduce((a, s) => a + s.mainBlocksRemoved, 0);
  const totalSub = ok.reduce((a, s) => a + s.subagentBlocksRemoved, 0);

  console.log(chalk.bold(`\nResumen: ${ok.length} sanitizada(s), ${failed.length} error(es)`));
  console.log(`  Bloques removidos (total): ${totalMain + totalSub}`);
  for (const s of failed) {
    console.log(chalk.red(`  ${s.sessionId}: ${s.error}`));
  }
}
