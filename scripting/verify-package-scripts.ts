#!/usr/bin/env tsx

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

interface StepResult {
  number: number;
  scriptName: string;
  status: string;
  exitCode: string;
  observations: string;
  packageScript: boolean;
  durationMs: number;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

const results: StepResult[] = [];
const warnings: string[] = [];

const STARTUP_WAIT_SECONDS = 15;

// --- Utility Functions ---

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseExecSyncFailure(error: unknown): ProcessResult {
  if (error && typeof error === 'object') {
    const err = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
    };
  }
  return { exitCode: 1, stdout: '', stderr: String(error) };
}

function getShortText(text: string, maxLength = 180): string {
  if (!text || text.trim().length === 0) return '';
  const value = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength - 1) + '…';
}

function getFirstMeaningfulLine(text: string): string {
  if (!text || text.trim().length === 0) return '';
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) return line.trim();
  }
  return '';
}

function invokeExternalCommand(filePath: string, argumentList: string[]): ProcessResult {
  try {
    const output = execSync(`${filePath} ${argumentList.join(' ')}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { exitCode: 0, stdout: output, stderr: '' };
  } catch (error: unknown) {
    return parseExecSyncFailure(error);
  }
}

function addStepResult(
  number: number,
  scriptName: string,
  status: string,
  exitCode: string,
  observations: string,
  packageScript = true,
  durationMs = 0,
): void {
  results.push({
    number,
    scriptName,
    status,
    exitCode,
    observations,
    packageScript,
    durationMs,
  });
}

function invokeBlockingStep(
  number: number,
  scriptName: string,
  argumentList: string[],
  verifier: (result: ProcessResult) => string,
  packageScript = true,
  treatEpermAsSuccess = false,
): void {
  const header = `[${number}/19] Probando script "${scriptName}"`;
  const underline = '─'.repeat(header.length);
  console.log(header);
  console.log(underline);
  console.log('» Iniciando prueba.');
  const startTime = Date.now();
  try {
    const processResult = invokeExternalCommand('npm', argumentList);

    if (
      processResult.exitCode !== 0 &&
      !(treatEpermAsSuccess && processResult.stderr.includes('EPERM'))
    ) {
      throw new Error(`Command exited with code ${processResult.exitCode}.`);
    }

    let observations = verifier(processResult);
    if (!observations || observations.trim().length === 0) {
      observations = getShortText(processResult.stdout + '\n' + processResult.stderr);
    }

    const durationMs = Date.now() - startTime;
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
    console.log('');
    addStepResult(
      number,
      scriptName,
      '✅',
      String(processResult.exitCode),
      observations,
      packageScript,
      durationMs,
    );
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
    console.log('');
    const exitCode = '—';
    const snippet = getShortText(getErrorMessage(error));
    addStepResult(number, scriptName, '❌', exitCode, snippet, packageScript, durationMs);
  }
}

async function invokeBackgroundStep(
  number: number,
  scriptName: string,
  argumentList: string[],
  successPatterns: string[],
  retryCount = 0,
  waitSeconds = STARTUP_WAIT_SECONDS,
): Promise<void> {
  const header = `[${number}/19] Probando script "${scriptName}" (background)`;
  const underline = '─'.repeat(header.length);
  console.log(header);
  console.log(underline);
  console.log('» Iniciando prueba.');
  const stepStartTime = Date.now();
  // Generate random port for this test to avoid conflicts (cross-platform)
  const randomPort = Math.floor(Math.random() * 10000) + 10000;

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const command = `${npmCmd} ${argumentList.join(' ')}`;
  const childProcess = spawn(command, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      PORT: String(randomPort),
    },
  });

  let stdout = '';
  let stderr = '';
  let matchedPattern: string | null = null;
  let processExited = false;

  childProcess.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
    if (!matchedPattern) {
      for (const pattern of successPatterns) {
        if (stdout.match(pattern)) {
          matchedPattern = pattern;
          break;
        }
      }
    }
  });

  childProcess.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  childProcess.on('exit', (_code) => {
    processExited = true;
  });

  childProcess.on('error', (err) => {
    processExited = true;
    addStepResult(number, scriptName, '❌', '—', getShortText(err.message));
  });

  // Wait for startup pattern or timeout
  const startTime = Date.now();
  while (Date.now() - startTime < waitSeconds * 1000) {
    if (matchedPattern) break;
    if (processExited) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!matchedPattern) {
    try {
      childProcess.kill();
    } catch {
      // Ignore kill errors
    }

    // Check if it's a port conflict and retry
    if (stderr.includes('EADDRINUSE') && retryCount < 3) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return invokeBackgroundStep(
        number,
        scriptName,
        argumentList,
        successPatterns,
        retryCount + 1,
        waitSeconds,
      );
    }

    addStepResult(
      number,
      scriptName,
      '❌',
      '—',
      `Startup pattern not found after ${waitSeconds} seconds. Output: ${(stdout + '\n' + stderr).substring(0, 200)}`,
      true,
      Date.now() - stepStartTime,
    );
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${((Date.now() - stepStartTime) / 1000).toFixed(2)} segundos`);
    console.log('');
    return;
  }

  // Terminate process - no need to verify port release since we use random ports
  try {
    childProcess.kill();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const durationMs = Date.now() - stepStartTime;
    addStepResult(
      number,
      scriptName,
      '✅',
      '—',
      `Matched '${matchedPattern}'; process started on port ${randomPort} and terminated successfully.`,
      true,
      durationMs,
    );
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
    console.log('');
  } catch (error: unknown) {
    const durationMs = Date.now() - stepStartTime;
    addStepResult(
      number,
      scriptName,
      '❌',
      '—',
      getShortText(getErrorMessage(error)),
      true,
      durationMs,
    );
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
    console.log('');
  }
}

function assertPathPresent(paths: string[], label: string): void {
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(', ')}`);
  }
}

function assertPathAbsent(paths: string[], label: string): void {
  const existing = paths.filter((p) => existsSync(p));
  if (existing.length > 0) {
    throw new Error(`${label} still present: ${existing.join(', ')}`);
  }
}

function assertAnyFilesExist(path: string, filter: string, label: string): void {
  if (!existsSync(path)) {
    throw new Error(`No ${label} files found under ${path} (directory missing)`);
  }
  const files = readdirSync(path).filter((f) => f.endsWith(filter));
  if (files.length === 0) {
    throw new Error(`No ${label} files found under ${path}`);
  }
}

function formatReportTable(entries: StepResult[]): string {
  const headers = ['#', 'Script', 'Status', 'Exit Code', 'Duration', 'Observations'];

  const rows = entries.map((entry) => [
    String(entry.number),
    entry.scriptName,
    entry.status,
    entry.exitCode,
    `${(entry.durationMs / 1000).toFixed(2)}s`,
    entry.observations,
  ]);

  const widths = headers.map((header, i) => {
    const maxCellWidth = rows.reduce((max, row) => {
      if (i < row.length && row[i].length > max) {
        return row[i].length;
      }
      return max;
    }, 0);
    return Math.max(header.length, maxCellWidth);
  });

  function formatRow(values: string[]): string {
    const parts = values.map((value, i) => value.padEnd(widths[i]));
    return '| ' + parts.join(' | ') + ' |';
  }

  const lines: string[] = [];
  lines.push(formatRow(headers));

  const separatorParts = widths.map((w) => '-'.repeat(w));
  lines.push('| ' + separatorParts.join(' | ') + ' |');

  for (const row of rows) {
    lines.push(formatRow(row));
  }

  return lines.join('\n');
}

// --- Main Execution ---

async function main() {
  const scriptStartTime = Date.now();
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at: ${packageJsonPath}`);
  }

  const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const availableScripts = Object.keys(packageJson.scripts || {});

  // Prerequisites
  if (availableScripts.length === 0) {
    warnings.push('No scripts were found in package.json.');
  } else {
    const expectedWorkflowScripts = [
      'help',
      'configure:provider',
      'create:agents-reference',
      'lint',
      'typecheck',
      'test:unit',
      'test:integration',
      'format',
      'lint:fix',
      'clean:dist',
      'build:js',
      'build:types',
      'build',
      'test:quick',
      'test',
      'start',
      'dev',
      'test:watch',
      'clean:sessions',
      'clean:logs',
    ];

    const missingFromPackage = expectedWorkflowScripts.filter((s) => !availableScripts.includes(s));
    if (missingFromPackage.length > 0) {
      warnings.push(`package.json is missing expected script(s): ${missingFromPackage.join(', ')}`);
    }
  }

  const nodeModulesPath = join(projectRoot, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    console.log('node_modules/ is missing. Running npm install first...');
    const installResult = invokeExternalCommand('npm', ['install']);
    if (installResult.exitCode !== 0) {
      throw new Error(`Initial npm install failed with exit code ${installResult.exitCode}.`);
    }
  }

  for (const warning of warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  // --- Step execution ---

  invokeBlockingStep(1, 'help', ['run', 'help'], (r) => {
    if (!r.stdout || r.stdout.trim().length === 0) {
      throw new Error('No output captured.');
    }
    return 'Reference panel printed correctly.';
  });

  invokeBlockingStep(
    2,
    'configure:provider',
    ['run', 'configure:provider', '--', '--show-current'],
    (r) => getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(3, 'create:agents-reference', ['run', 'create:agents-reference'], (_r) => {
    const agents = join(projectRoot, 'AGENTS.md');
    const claude = join(projectRoot, 'CLAUDE.md');
    assertPathPresent([agents, claude], 'AGENTS/CLAUDE reference files');
    return 'AGENTS.md created (hardlink expected by package script).';
  });

  invokeBlockingStep(4, 'lint', ['run', 'lint'], (r) =>
    getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(5, 'typecheck', ['run', 'typecheck'], (r) =>
    getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(6, 'format', ['run', 'format'], (r) =>
    getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(7, 'test:unit', ['run', 'test:unit'], (r) =>
    getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(8, 'test:integration', ['run', 'test:integration'], (r) =>
    getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(9, 'build', ['run', 'build'], (_r) => {
    const jsFile = join(projectRoot, 'dist/index.js');
    assertPathPresent([join(projectRoot, 'dist')], 'dist/');
    if (!existsSync(jsFile)) {
      throw new Error('dist/index.js missing after build.');
    }
    assertAnyFilesExist(join(projectRoot, 'dist'), '.d.ts', '.d.ts');
    return 'Composite build completed successfully.';
  });

  invokeBlockingStep(
    10,
    'test:quick',
    ['run', 'test:quick'],
    (_r) => 'Quick validation pipeline completed.',
  );

  invokeBlockingStep(11, 'test', ['test'], (_r) => 'Full validation pipeline completed.');

  // --- Phase 6: Server scripts ---

  await invokeBackgroundStep(12, 'start', ['start'], ['listening', 'Proxy levantado']);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await invokeBackgroundStep(13, 'dev', ['run', 'dev'], ['listening', 'Proxy levantado']);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await invokeBackgroundStep(14, 'test:watch', ['run', 'test:watch'], ['RUN'], 0, 30);

  // --- Phase 7: Destructive cleanup scripts ---

  invokeBlockingStep(15, 'clean:sessions', ['run', 'clean:sessions'], (_r) => {
    assertPathAbsent([join(projectRoot, 'sessions')], 'sessions/');
    return 'sessions/ cleaned.';
  });

  invokeBlockingStep(16, 'clean:logs', ['run', 'clean:logs'], (_r) => {
    assertPathAbsent([join(projectRoot, 'logs')], 'logs/');
    return 'logs/ cleaned.';
  });

  invokeBlockingStep(17, 'clean:dist', ['run', 'clean:dist'], (_r) => {
    assertPathAbsent([join(projectRoot, 'dist')], 'dist/');
    return 'dist/ removed.';
  });

  invokeBlockingStep(18, 'lint:fix', ['run', 'lint:fix'], (r) =>
    getShortText(getFirstMeaningfulLine(r.stdout)),
  );

  invokeBlockingStep(19, 'build', ['run', 'build'], (_r) => {
    const jsFile = join(projectRoot, 'dist/index.js');
    assertPathPresent([join(projectRoot, 'dist')], 'dist/');
    if (!existsSync(jsFile)) {
      throw new Error('dist/index.js was not regenerated.');
    }
    assertAnyFilesExist(join(projectRoot, 'dist'), '.d.ts', '.d.ts');
    return 'dist/ regenerated.';
  });

  // --- Report ---

  const table = formatReportTable(results);
  console.log('');
  console.log(table);
  console.log('');

  const passCount = results.filter((r) => r.status === '✅').length;
  const failCount = results.filter((r) => r.status === '❌').length;
  const executedScriptNames = [
    ...new Set(results.filter((r) => r.packageScript).map((r) => r.scriptName)),
  ];
  const coverageTotal =
    availableScripts.length > 0 ? availableScripts.length : executedScriptNames.length;
  const coverage = `${executedScriptNames.length}/${coverageTotal}`;

  const workspaceState =
    existsSync(nodeModulesPath) && existsSync(join(projectRoot, 'dist'))
      ? 'restored correctly'
      : 'with restoration errors';

  const totalDurationMs = Date.now() - scriptStartTime;
  const totalDurationSecs = (totalDurationMs / 1000).toFixed(2);

  console.log(`Total: ${passCount}/${results.length} steps PASS, ${failCount} FAIL.`);
  console.log(`Total duration: ${totalDurationSecs}s`);
  console.log(`Scripts verified: ${coverage} from package.json.`);
  console.log(`Workspace: ${workspaceState}.`);

  if (failCount > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
