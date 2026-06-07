#!/usr/bin/env tsx

/**
 * Verificador programático de scripts de `package.json`.
 *
 * Este script itera sobre `VERIFY_STEPS` (declarado en `./verify-config.ts`),
 * ejecuta cada paso según su `kind` (`blocking`, `background`, `destructive`,
 * `restore`), aplica el verificador post-ejecución y emite dos artefactos:
 *
 *   1. Tabla ASCII en stdout (preservada para compatibilidad con la CLI).
 *   2. `verify-report.json` con la forma documentada en
 *      `./verify-report-schema.md`.
 *
 * El reporte JSON es el contrato que consume `.claude/commands/verify-scripts.md`.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { VERIFY_STEPS, VERIFIERS, type VerifyStep, type VerifierContext } from './verify-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const STARTUP_WAIT_SECONDS = 15;
const REPORT_VERSION = 1;
const REPORT_PATH = join(projectRoot, 'verify-report.json');

// --- Tipos del reporte ---

type StepStatus = 'pass' | 'fail' | 'skip';

interface StepReport {
  id: string;
  script: string;
  kind: VerifyStep['kind'];
  status: StepStatus;
  durationMs: number;
  failureReason: string | null;
  skippedReason: string | null;
}

interface FailureReport {
  stepId: string;
  reason: string;
}

interface CoverageReport {
  declaredInConfig: string[];
  declaredInPackageJson: string[];
  missingFromConfig: string[];
  missingFromPackageJson: string[];
}

interface WorkspaceState {
  nodeModulesRestored: boolean;
  buildArtifactsPresent: boolean;
  destructiveStepsRan: string[];
}

interface VerifyReport {
  schemaVersion: number;
  startedAt: string;
  finishedAt: string;
  steps: StepReport[];
  coverage: CoverageReport;
  failures: FailureReport[];
  workspaceState: WorkspaceState;
}

// --- Argumentos de línea de comandos ---

interface CliArgs {
  source: 'auto' | 'config';
  strictCoverage: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    source: 'auto',
    strictCoverage: false,
    json: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--source=auto') args.source = 'auto';
    else if (arg === '--source=config') args.source = 'config';
    else if (arg === '--strict-coverage') args.strictCoverage = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Uso: tsx verify-package-scripts.ts [--source=auto|config] [--strict-coverage] [--json]',
      );
      process.exit(0);
    }
  }
  return args;
}

// --- Utilidades ---

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseExecSyncFailure(error: unknown): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  if (error && typeof error === 'object') {
    const err = error as { status?: number; stdout?: string; stderr?: string; message?: string };
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

function invokeExternalCommand(
  filePath: string,
  argumentList: string[],
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
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

function invokeBlocking(
  step: VerifyStep,
  stepNumber: number,
  stepTotal: number,
  verifierCtx: VerifierContext,
): StepReport {
  const header = `[${stepNumber}/${stepTotal}] Probando script "${step.script || step.args.join(' ')}"`;
  console.log(header);
  console.log('─'.repeat(header.length));
  console.log('» Iniciando prueba.');
  const startTime = Date.now();

  try {
    const result = invokeExternalCommand('npm', step.args);

    // El verificador es la autoridad sobre pass/fail. Si está declarado, lo
    // invocamos siempre (incluso cuando el comando subyacente salió ≠0) para
    // soportar pasos cuyo verificador ESPERA un exit no-cero (p.ej.
    // `expect-non-zero-exit` en pasos de error-path). Si el verificador lanza,
    // lo capturamos abajo como failureReason.
    if (step.verifier) {
      const verifier = VERIFIERS[step.verifier];
      if (!verifier) {
        throw new Error(`Verifier desconocido: "${step.verifier}" para paso "${step.id}".`);
      }
      verifier(result, verifierCtx);
    } else if (result.exitCode !== 0) {
      // Sin verificador declarado, un exit no-cero es siempre un fallo.
      throw new Error(`Comando salió con código ${result.exitCode}.`);
    }

    const durationMs = Date.now() - startTime;
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
    console.log('');
    return {
      id: step.id,
      script: step.script,
      kind: step.kind,
      status: 'pass',
      durationMs,
      failureReason: null,
      skippedReason: null,
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    console.log('» Finalizando prueba.');
    console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
    console.log('');
    return {
      id: step.id,
      script: step.script,
      kind: step.kind,
      status: 'fail',
      durationMs,
      failureReason: getShortText(getErrorMessage(error), 240),
      skippedReason: null,
    };
  }
}

async function invokeBackground(
  step: VerifyStep,
  stepNumber: number,
  stepTotal: number,
): Promise<StepReport> {
  const patterns = step.successPatterns ?? [];
  const header = `[${stepNumber}/${stepTotal}] Probando script "${step.script || step.args.join(' ')}" (background)`;
  console.log(header);
  console.log('─'.repeat(header.length));
  console.log('» Iniciando prueba.');
  const stepStartTime = Date.now();
  const randomPort = Math.floor(Math.random() * 10000) + 10000;

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const command = `${npmCmd} ${step.args.join(' ')}`;
  const childProcess = spawn(command, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, PORT: String(randomPort) },
  });

  let stdout = '';
  let stderr = '';
  let matchedPattern: string | null = null;
  let processExited = false;

  childProcess.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
    if (!matchedPattern) {
      for (const pattern of patterns) {
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
  childProcess.on('exit', () => {
    processExited = true;
  });
  childProcess.on('error', () => {
    processExited = true;
  });

  const startTime = Date.now();
  while (Date.now() - startTime < STARTUP_WAIT_SECONDS * 1000) {
    if (matchedPattern) break;
    if (processExited) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  try {
    childProcess.kill();
  } catch {
    // Ignorar errores de kill
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const durationMs = Date.now() - stepStartTime;
  console.log('» Finalizando prueba.');
  console.log(`» Duración: ${(durationMs / 1000).toFixed(2)} segundos`);
  console.log('');

  if (!matchedPattern) {
    return {
      id: step.id,
      script: step.script,
      kind: step.kind,
      status: 'fail',
      durationMs,
      failureReason: `Patrón de arranque no encontrado tras ${STARTUP_WAIT_SECONDS}s. Salida: ${(stdout + '\n' + stderr).substring(0, 200)}`,
      skippedReason: null,
    };
  }
  return {
    id: step.id,
    script: step.script,
    kind: step.kind,
    status: 'pass',
    durationMs,
    failureReason: null,
    skippedReason: `Coincidió patrón '${matchedPattern}'; proceso arrancado en puerto ${randomPort} y terminado.`,
  };
}

function computeCoverage(steps: VerifyStep[], packageScripts: string[]): CoverageReport {
  const referencedScripts = new Set<string>();
  for (const step of steps) {
    if (step.script) referencedScripts.add(step.script);
  }
  const declaredInConfig = Array.from(referencedScripts).sort();
  const declaredInPackageJson = [...packageScripts].sort();
  const packageSet = new Set(packageScripts);
  const configSet = new Set(declaredInConfig);
  return {
    declaredInConfig,
    declaredInPackageJson,
    missingFromConfig: declaredInPackageJson.filter((s) => !configSet.has(s)),
    missingFromPackageJson: declaredInConfig.filter((s) => !packageSet.has(s)),
  };
}

function formatReportTable(steps: StepReport[]): string {
  const headers = ['#', 'ID', 'Script', 'Tipo', 'Status', 'Duración', 'Observaciones'];
  const rows = steps.map((step, index) => [
    String(index + 1),
    step.id,
    step.script || '—',
    step.kind,
    step.status === 'pass' ? '✅' : step.status === 'fail' ? '❌' : '⏭️',
    `${(step.durationMs / 1000).toFixed(2)}s`,
    step.failureReason ?? step.skippedReason ?? '',
  ]);

  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? '').length)),
  );

  const fmt = (values: string[]): string =>
    '| ' + values.map((v, i) => v.padEnd(widths[i])).join(' | ') + ' |';

  const lines: string[] = [];
  lines.push(fmt(headers));
  lines.push('| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |');
  for (const row of rows) lines.push(fmt(row));
  return lines.join('\n');
}

// --- Ejecución principal ---

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const scriptStartTime = Date.now();
  const startedAt = new Date().toISOString();

  // Precondición: package.json existe
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(`package.json no encontrado en: ${packageJsonPath}`);
    process.exit(1);
  }
  const packageJson: { scripts?: Record<string, string> } = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  );
  const availableScripts = Object.keys(packageJson.scripts ?? {});

  // Precondición: node_modules existe (instalar si falta)
  const nodeModulesPath = join(projectRoot, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    console.log('node_modules/ ausente. Ejecutando npm install primero...');
    const installResult = invokeExternalCommand('npm', ['install']);
    if (installResult.exitCode !== 0) {
      console.error(`npm install inicial falló con código ${installResult.exitCode}.`);
      process.exit(1);
    }
  }

  const verifierCtx: VerifierContext = { projectRoot };

  // Estado de pasos completados por id (para resolver dependsOn)
  const completed: Map<string, StepStatus> = new Map();
  const stepReports: StepReport[] = [];
  const failures: FailureReport[] = [];
  const destructiveStepsRan: string[] = [];

  const stepTotal = VERIFY_STEPS.length;
  for (let i = 0; i < stepTotal; i++) {
    const step = VERIFY_STEPS[i]!;
    const stepNumber = i + 1;

    // ¿Skip explícito en la config?
    if (step.skip) {
      const report: StepReport = {
        id: step.id,
        script: step.script,
        kind: step.kind,
        status: 'skip',
        durationMs: 0,
        failureReason: null,
        skippedReason: step.skipReason ?? 'skip explícito en config.',
      };
      stepReports.push(report);
      completed.set(step.id, 'skip');
      console.log(
        `[${stepNumber}/${stepTotal}] ⏭️  Saltando "${step.id}": ${report.skippedReason}`,
      );
      continue;
    }

    // ¿Dependencias satisfechas?
    if (step.dependsOn && step.dependsOn.length > 0) {
      const unmet = step.dependsOn.filter((dep) => completed.get(dep) !== 'pass');
      if (unmet.length > 0) {
        const report: StepReport = {
          id: step.id,
          script: step.script,
          kind: step.kind,
          status: 'skip',
          durationMs: 0,
          failureReason: null,
          skippedReason: `Dependencias no satisfechas: ${unmet.join(', ')}.`,
        };
        stepReports.push(report);
        completed.set(step.id, 'skip');
        console.log(
          `[${stepNumber}/${stepTotal}] ⏭️  Saltando "${step.id}": ${report.skippedReason}`,
        );
        continue;
      }
    }

    // Ejecutar según kind
    let report: StepReport;
    if (step.kind === 'background') {
      report = await invokeBackground(step, stepNumber, stepTotal);
    } else {
      report = invokeBlocking(step, stepNumber, stepTotal, verifierCtx);
    }
    stepReports.push(report);
    completed.set(step.id, report.status);
    if (report.status === 'fail') {
      failures.push({ stepId: report.id, reason: report.failureReason ?? 'Sin razón' });
    }
    if (report.status === 'pass' && step.kind === 'destructive') {
      destructiveStepsRan.push(step.id);
    }
  }

  // Cobertura
  const coverage = computeCoverage(VERIFY_STEPS, availableScripts);

  // Estado del workspace
  const finalNodeModules = existsSync(nodeModulesPath);
  const finalDist = existsSync(join(projectRoot, 'dist/index.js'));
  const workspaceState: WorkspaceState = {
    nodeModulesRestored: finalNodeModules,
    buildArtifactsPresent: finalDist,
    destructiveStepsRan,
  };

  // Reporte JSON
  const report: VerifyReport = {
    schemaVersion: REPORT_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps: stepReports,
    coverage,
    failures,
    workspaceState,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  // Tabla ASCII (compatibilidad CLI)
  console.log('');
  console.log(formatReportTable(stepReports));
  console.log('');

  const passCount = stepReports.filter((s) => s.status === 'pass').length;
  const failCount = stepReports.filter((s) => s.status === 'fail').length;
  const skipCount = stepReports.filter((s) => s.status === 'skip').length;
  const totalDurationMs = Date.now() - scriptStartTime;
  const totalDurationSecs = (totalDurationMs / 1000).toFixed(2);

  console.log(
    `Total: ${passCount}/${stepReports.length} pasos PASS, ${failCount} FAIL, ${skipCount} SKIP.`,
  );
  console.log(`Duración total: ${totalDurationSecs}s`);
  console.log(
    `Cobertura: ${coverage.declaredInConfig.length} scripts referenciados en config / ${coverage.declaredInPackageJson.length} declarados en package.json.`,
  );
  if (coverage.missingFromConfig.length > 0) {
    console.log(`Cobertura — ausentes de config: ${coverage.missingFromConfig.join(', ')}`);
  }
  if (coverage.missingFromPackageJson.length > 0) {
    console.log(
      `Cobertura — ausentes de package.json: ${coverage.missingFromPackageJson.join(', ')}`,
    );
  }
  console.log(`Reporte JSON: ${REPORT_PATH}`);

  // Códigos de salida
  if (args.strictCoverage && coverage.missingFromPackageJson.length > 0) {
    process.exit(2);
  }
  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
