#!/usr/bin/env node
/**
 * Pruebas headless TTS por proveedor — modo aislado.
 * Levanta un proxy de test en un puerto dedicado (default 8788) con el provider
 * inyectado por entorno, sin mutar ~/.claude/settings.json ni configs/.env, y sin
 * tocar el proxy principal (8787) del que puede depender la sesión que lanza la suite.
 * Logs y auditoría de test van a archivos/directorios separados.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type ProviderTestResult } from './headless-tts-gateway-test/types.js';
import {
  EXCLUDED_PROVIDERS,
  resolveTestProviders,
} from './headless-tts-gateway-test/providers.js';
import {
  analyzeLogsFromOffset,
  filterActionableTtsFallbacks,
  formatExpectedFallbackNotes,
  formatFallbackErrors,
  hasAnyTtsHttpFailure,
  inferMessageType,
} from './headless-tts-gateway-test/log-analyzer.js';
import {
  announceProviderEnd,
  announceProviderStart,
} from './headless-tts-gateway-test/local-announce.js';
import { waitForGatewayTtsDrain } from './headless-tts-gateway-test/wait-for-tts.js';
import {
  killProcessOnPort,
  startProxy,
  stopProxy,
  waitHealth,
  sleep,
  getLogPath,
} from './headless-tts-gateway-test/proxy-lifecycle.js';
import { getProxyPort, getLogByteOffset } from './headless-tts-gateway-test/env-utils.js';
import { buildIsolatedProviderEnv } from './headless-tts-gateway-test/provider-env.js';
import { runClaudeHeadless } from './headless-tts-gateway-test/run-claude-headless.js';
import {
  findLatestTranscriptPath,
  verifyPromptInTranscript,
  extractLastUserPrompt,
} from './headless-tts-gateway-test/verify-prompt.js';

const PROJECT_ROOT = process.cwd();
const DEFAULT_PROMPT = 'Hola, resume en una frase qué dices';
/** Puerto dedicado del proxy de test; nunca el del proxy principal (configs/.env). */
const DEFAULT_TEST_PORT = 8788;
/** Log separado para no mezclar la auditoría de test con server/logs.jsonl. */
const TEST_LOG_FILENAME = 'logs-headless-tts.jsonl';
/** Auditoría de sesiones de test aislada (debe terminar en "sessions"). */
const TEST_AUDIT_BASE_DIR = join('server', 'headless-tts', 'sessions');

interface CliOptions {
  providers: string[];
  excludeProviders: string[];
  prompt: string;
  port?: number;
  claudeTimeout: number;
  healthTimeout: number;
  ttsSettleMs: number;
  ttsDrainTimeoutMs: number;
  ttsExtraDrainMs: number;
  skipClaude: boolean;
  voiceAnnounce: boolean;
  json: boolean;
  allowPartial: boolean;
}

function checkPrerequisites(): string[] {
  const errors: string[] = [];

  if (!existsSync(join(PROJECT_ROOT, 'src', 'index.ts'))) {
    errors.push('Ejecutar desde la raíz del repositorio Smart Code Proxy.');
  }

  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    errors.push('CLI `claude` no encontrado en PATH.');
  }

  return errors;
}

function warnMissingSecrets(provider: string): void {
  const secretsPath = join(PROJECT_ROOT, 'routing', 'providers', provider, 'secrets.json');
  if (provider !== 'default' && provider !== 'anthropic' && !existsSync(secretsPath)) {
    console.log(
      chalk.yellow(
        `  [AVISO] secrets.json no encontrado para "${provider}"; configure usará placeholders.`,
      ),
    );
  }
}

/** Verifica en el transcript que Claude recibió el prompt íntegro. */
function verifyPromptDelivered(
  expectedPrompt: string,
  minMtimeMs: number,
): { ok: boolean; actual: string | null } {
  const transcriptPath = findLatestTranscriptPath(PROJECT_ROOT, minMtimeMs);
  if (!transcriptPath) {
    return { ok: false, actual: null };
  }
  const actual = extractLastUserPrompt(transcriptPath);
  return { ok: verifyPromptInTranscript(transcriptPath, expectedPrompt), actual };
}

async function testProvider(
  provider: string,
  opts: CliOptions,
): Promise<ProviderTestResult> {
  const port = opts.port ?? DEFAULT_TEST_PORT;
  const logPath = getLogPath(PROJECT_ROOT, TEST_LOG_FILENAME);
  const errors: string[] = [];

  console.log(chalk.cyan(`\n========== Proveedor: ${provider} ==========`));

  if (opts.voiceAnnounce) {
    try {
      await announceProviderStart(provider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  [AVISO] Anuncio de inicio falló: ${msg}`));
    }
  }

  // Solo liberar el puerto de TEST; jamás el del proxy principal.
  killProcessOnPort(port);
  await sleep(1000);

  warnMissingSecrets(provider);

  // Resolución en memoria: sin mutar settings.json ni configs/.env
  let providerEnv: ReturnType<typeof buildIsolatedProviderEnv>;
  try {
    providerEnv = buildIsolatedProviderEnv(provider, port);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      provider,
      upstreamOrigin: '',
      mainSessionStatus: null,
      ttsStatus: null,
      ttsStatuses: [],
      ttsCallCount: 0,
      anyTtsFallback: false,
      stopUsedFallback: false,
      ttsFallbacks: [],
      ttsWorked: false,
      messageType: 'unknown',
      claudeExitCode: 1,
      claudeError: true,
      has402: false,
      ttsDrainMs: 0,
      promptVerified: false,
      errors: [`Fallo al resolver configuración del provider: ${msg}`],
    };
  }

  const { upstreamOrigin, claudeEnv, proxyEnv } = providerEnv;
  console.log(chalk.gray(`  UPSTREAM_ORIGIN=${upstreamOrigin} (proxy test :${port}, aislado)`));

  let proxyHandle: ReturnType<typeof startProxy> | null = null;

  try {
    proxyHandle = startProxy(PROJECT_ROOT, port, {
      ...proxyEnv,
      LOG_FILE: logPath,
      AUDIT_BASE_DIR: join(PROJECT_ROOT, TEST_AUDIT_BASE_DIR),
    });
    const healthy = await waitHealth(port, opts.healthTimeout);

    if (!healthy) {
      errors.push('Proxy no respondió en /health a tiempo');
      return buildResult(
        provider,
        upstreamOrigin,
        {
          mainSessionStatus: null,
          ttsStatus: null,
          ttsStatuses: [],
          has402: false,
          ttsFallbacks: [],
          stopUsedFallback: false,
        },
        false,
        1,
        true,
        0,
        false,
        errors,
      );
    }

    console.log(chalk.green(`  Proxy listo en puerto ${port}`));

    if (opts.skipClaude) {
      return buildResult(
        provider,
        upstreamOrigin,
        {
          mainSessionStatus: null,
          ttsStatus: null,
          ttsStatuses: [],
          has402: false,
          ttsFallbacks: [],
          stopUsedFallback: false,
        },
        false,
        0,
        false,
        0,
        true,
        errors,
      );
    }

    const logOffset = getLogByteOffset(logPath);
    const claudeStartedAt = Date.now();
    const claudeResult = await runClaudeHeadless(
      opts.prompt,
      PROJECT_ROOT,
      opts.claudeTimeout,
      claudeEnv,
    );

    if (claudeResult.isError) {
      errors.push(`Claude: ${claudeResult.resultText || 'error'}`);
    }

    await sleep(500);
    const promptCheck = verifyPromptDelivered(opts.prompt, claudeStartedAt);
    if (!promptCheck.ok) {
      const detail =
        promptCheck.actual === null
          ? 'transcript no encontrado'
          : `recibido "${promptCheck.actual}"`;
      errors.push(`Prompt no entregado íntegro a Claude (${detail})`);
      console.log(chalk.red(`  Prompt esperado: "${opts.prompt}"`));
    } else {
      console.log(chalk.gray('  Prompt verificado en transcript'));
    }

    // Esperar llamadas TTS en logs y dejar reproducir el audio antes de detener el proxy
    console.log(chalk.gray('  Esperando síntesis de voz del gateway...'));
    const drain = await waitForGatewayTtsDrain(logPath, logOffset, {
      settleMs: opts.ttsSettleMs,
      pollMs: 500,
      timeoutMs: opts.ttsDrainTimeoutMs,
      extraDrainMs: opts.ttsExtraDrainMs,
      fallbackChars: 80,
    });
    console.log(
      chalk.gray(
        `  Drenaje TTS: ${drain.ttsCount} llamada(s), ${Math.round(drain.drainMs / 1000)}s de espera`,
      ),
    );

    const logAnalysis = analyzeLogsFromOffset(logPath, logOffset);
    const actionableFallbacks = filterActionableTtsFallbacks(logAnalysis.ttsFallbacks);
    const silentFallback = actionableFallbacks.length > 0;
    const httpFailure = hasAnyTtsHttpFailure(logAnalysis.ttsStatuses);
    const messageType = inferMessageType(logAnalysis.ttsStatus, logAnalysis.ttsFallbacks);

    // Éxito: Stop dinámico (sin fallback accionable) y TTS HTTP 200.
    // UserPromptSubmit sin historial (no-messages/no-token) es esperado al primer prompt.
    const ttsWorked =
      promptCheck.ok &&
      !silentFallback &&
      !logAnalysis.stopUsedFallback &&
      logAnalysis.ttsStatus === 200;

    if (silentFallback) {
      errors.push(...formatFallbackErrors(logAnalysis.ttsFallbacks));
    }
    if (httpFailure && !silentFallback) {
      errors.push('Llamada TTS HTTP con status distinto de 200');
    }
    if (logAnalysis.stopUsedFallback) {
      errors.push(
        `Stop reprodujo mensaje genérico: "${logAnalysis.ttsFallbacks.find((f) => f.eventName === 'Stop')?.fallbackText ?? 'El asistente terminó su turno.'}"`,
      );
    }

    const result = buildResult(
      provider,
      upstreamOrigin,
      logAnalysis,
      ttsWorked,
      claudeResult.exitCode,
      claudeResult.isError,
      drain.drainMs,
      promptCheck.ok,
      errors,
      messageType,
    );

    if (opts.voiceAnnounce) {
      try {
        await announceProviderEnd(provider, ttsWorked);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.yellow(`  [AVISO] Anuncio de cierre falló: ${msg}`));
      }
    }

    return result;
  } finally {
    if (proxyHandle) {
      await stopProxy(proxyHandle);
      console.log(chalk.gray('  Proxy detenido'));
    }
  }
}

function buildResult(
  provider: string,
  upstreamOrigin: string,
  logAnalysis: ReturnType<typeof analyzeLogsFromOffset>,
  ttsWorked: boolean,
  claudeExitCode: number,
  claudeError: boolean,
  ttsDrainMs: number,
  promptVerified: boolean,
  errors: string[],
  messageType?: ProviderTestResult['messageType'],
): ProviderTestResult {
  const { mainSessionStatus, ttsStatuses, ttsFallbacks, stopUsedFallback, has402 } = logAnalysis;
  const ttsStatus = ttsStatuses.at(-1) ?? null;
  return {
    provider,
    upstreamOrigin,
    mainSessionStatus,
    ttsStatus,
    ttsStatuses,
    ttsCallCount: ttsStatuses.length,
    anyTtsFallback:
      filterActionableTtsFallbacks(ttsFallbacks).length > 0 ||
      hasAnyTtsHttpFailure(ttsStatuses),
    stopUsedFallback,
    ttsFallbacks,
    ttsWorked,
    messageType: messageType ?? inferMessageType(ttsStatus, ttsFallbacks),
    claudeExitCode,
    claudeError,
    has402,
    ttsDrainMs,
    promptVerified,
    errors,
  };
}

/**
 * Escenario de fallback sin clave TTS: arranca el proxy con OPENROUTER_SECRETS_PATH
 * apuntando a una ruta inexistente, corre un prompt headless y verifica que el log
 * emite [TTS-FALLBACK] reason: no-openrouter-key. No produce TTS de voz (fallback).
 * Devuelve true si el escenario pasó.
 */
async function testFallbackScenario(opts: CliOptions): Promise<boolean> {
  const port = opts.port ?? DEFAULT_TEST_PORT;
  const logPath = getLogPath(PROJECT_ROOT, TEST_LOG_FILENAME);

  console.log(chalk.cyan('\n========== Escenario: fallback sin clave TTS =========='));

  killProcessOnPort(port);
  await sleep(1000);

  // Provider de sesión: default (OAuth) — no importa; lo que cambia es que el proxy
  // no puede leer la clave TTS de OpenRouter.
  let providerEnv: ReturnType<typeof buildIsolatedProviderEnv>;
  try {
    providerEnv = buildIsolatedProviderEnv('default', port);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Fallo al resolver configuración: ${msg}`));
    return false;
  }

  const { upstreamOrigin, claudeEnv, proxyEnv } = providerEnv;
  console.log(chalk.gray(`  UPSTREAM_ORIGIN=${upstreamOrigin} (sin clave TTS)`));

  let proxyHandle: ReturnType<typeof startProxy> | null = null;
  let passed = false;

  try {
    // OPENROUTER_SECRETS_PATH a ruta inexistente → resolveTtsApiKey devuelve undefined
    proxyHandle = startProxy(PROJECT_ROOT, port, {
      ...proxyEnv,
      LOG_FILE: logPath,
      AUDIT_BASE_DIR: join(PROJECT_ROOT, TEST_AUDIT_BASE_DIR),
      OPENROUTER_SECRETS_PATH: '/nonexistent/tts-secrets.json',
    });
    const healthy = await waitHealth(port, opts.healthTimeout);
    if (!healthy) {
      console.log(chalk.red('  Proxy no respondió en /health'));
      return false;
    }
    console.log(chalk.green(`  Proxy listo en puerto ${port} (sin clave TTS)`));

    const logOffset = getLogByteOffset(logPath);
    const claudeResult = await runClaudeHeadless(
      opts.prompt,
      PROJECT_ROOT,
      opts.claudeTimeout,
      claudeEnv,
    );

    if (claudeResult.isError) {
      console.log(chalk.yellow(`  Claude: ${claudeResult.resultText || 'error'}`));
    }

    await sleep(500);
    const drain = await waitForGatewayTtsDrain(logPath, logOffset, {
      settleMs: opts.ttsSettleMs,
      pollMs: 500,
      timeoutMs: opts.ttsDrainTimeoutMs,
      extraDrainMs: opts.ttsExtraDrainMs,
      fallbackChars: 80,
    });
    console.log(chalk.gray(`  Drenaje TTS: ${drain.ttsCount} llamada(s), ${Math.round(drain.drainMs / 1000)}s`));

    const logAnalysis = analyzeLogsFromOffset(logPath, logOffset);
    const noKeyFallback = logAnalysis.ttsFallbacks.some((f) => f.reason === 'no-openrouter-key');

    if (noKeyFallback) {
      console.log(chalk.green('  ✓ Fallback no-openrouter-key detectado'));
      passed = true;
    } else {
      console.log(chalk.red('  ✗ No se detectó [TTS-FALLBACK] reason: no-openrouter-key'));
      console.log(chalk.gray(`  Fallbacks encontrados: ${JSON.stringify(logAnalysis.ttsFallbacks.map((f) => f.reason))}`));
    }
  } finally {
    if (proxyHandle) {
      await stopProxy(proxyHandle);
      console.log(chalk.gray('  Proxy detenido'));
    }
  }

  return passed;
}

function printSuitePlan(
  providers: string[],
  excluded: string[],
  explicitList: boolean,
): void {
  console.log(chalk.cyan('\n=== Suite headless TTS ==='));
  console.log(chalk.gray(`  Proveedores a probar (${providers.length}): ${providers.join(', ')}`));
  if (!explicitList && excluded.length > 0) {
    console.log(chalk.gray(`  Omitidos por defecto: ${excluded.join(', ')}`));
  }
  console.log('');
}

/** Imprime el resultado de un proveedor (mismo formato que el reporte final). */
function printProviderResult(r: ProviderTestResult): void {
  const ttsLabel = r.ttsWorked ? chalk.green('Sí') : chalk.red('No');
  const statusLabel = r.ttsStatus !== null ? String(r.ttsStatus) : chalk.gray('N/A');
  const msgLabel =
    r.messageType === 'dynamic'
      ? chalk.green('dinámico')
      : r.messageType === 'fallback'
        ? chalk.yellow('genérico (fallback)')
        : chalk.gray('sin llamada TTS');
  const outcomeLine = r.ttsWorked
    ? chalk.green('  Resultado: síntesis de voz exitosa (Stop dinámico)')
    : chalk.red('  Resultado: síntesis de voz fallida');

  console.log(chalk.cyan(`\n--- Resultado: ${r.provider} ---`));
  console.log(outcomeLine);
  console.log(`${chalk.bold(r.provider)}`);
  console.log(`  UPSTREAM_ORIGIN: ${r.upstreamOrigin}`);
  console.log(`  Sesión principal: ${r.mainSessionStatus ?? 'N/A'}`);
  console.log(`  ¿TTS funcionó?: ${ttsLabel}`);
  console.log(`  StatusCode TTS: ${statusLabel}`);
  console.log(`  Llamadas TTS HTTP: ${r.ttsCallCount}`);
  console.log(`  Mensaje Stop: ${msgLabel}`);
  console.log(
    r.promptVerified
      ? chalk.gray('  Prompt headless: verificado')
      : chalk.red('  Prompt headless: truncado o no verificado'),
  );
  if (r.stopUsedFallback) {
    console.log(chalk.red('  Stop con fallback genérico (error silencioso)'));
  }
  const expectedNotes = formatExpectedFallbackNotes(r.ttsFallbacks);
  for (const note of expectedNotes) {
    console.log(chalk.gray(`  ${note}`));
  }
  const actionable = filterActionableTtsFallbacks(r.ttsFallbacks);
  for (const f of actionable) {
    console.log(chalk.yellow(`  Fallback ${f.eventName}: ${f.reason} → "${f.fallbackText}"`));
  }
  if (r.ttsDrainMs > 0) {
    console.log(`  Espera audio: ${Math.round(r.ttsDrainMs / 1000)}s`);
  }
  if (r.errors.length > 0) {
    console.log(chalk.yellow(`  Errores: ${r.errors.join('; ')}`));
  }
  console.log('');
}

function printResultsSummary(results: ProviderTestResult[]): void {
  const passed = results.filter((r) => r.ttsWorked).length;
  const total = results.length;
  const summary =
    passed === total
      ? chalk.green(`${passed}/${total} proveedores OK`)
      : chalk.red(`${passed}/${total} proveedores OK`);
  console.log(chalk.cyan('\n=== Resumen final ==='));
  console.log(chalk.bold(`  ${summary}`));
}

function printJsonReport(results: ProviderTestResult[]): void {
  console.log(JSON.stringify({ results }, null, 2));
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('headless-tts-gateway-test')
    .description(
      'Pruebas headless TTS por proveedor con ciclo de vida del proxy entre cada iteración.',
    )
    .option(
      '--providers <list>',
      `Proveedores CSV (default: catálogo menos ${EXCLUDED_PROVIDERS.join(',')})`,
    )
    .option(
      '--exclude-providers <list>',
      'Exclusiones adicionales al descubrir proveedores automáticamente',
      '',
    )
    .option('--prompt <text>', 'Prompt headless', DEFAULT_PROMPT)
    .option(
      '--port <number>',
      `Puerto del proxy de TEST (default: ${DEFAULT_TEST_PORT}; debe diferir del proxy principal)`,
    )
    .option('--claude-timeout <ms>', 'Timeout sesión claude', '180000')
    .option('--health-timeout <ms>', 'Timeout arranque proxy', '30000')
    .option('--tts-settle-ms <ms>', 'Ms sin nuevas llamadas TTS antes de drenar', '2000')
    .option('--tts-drain-timeout <ms>', 'Timeout esperando llamadas TTS en logs', '60000')
    .option('--tts-extra-drain-ms <ms>', 'Margen extra tras estimar reproducción', '2000')
    .option('--no-voice-announce', 'Sin anuncios de voz al inicio/fin de cada proveedor')
    .option('--skip-claude', 'Solo configure + lifecycle (smoke)')
    .option('--json', 'Salida JSON')
    .option('--allow-partial', 'Exit 0 aunque fallen algunos proveedores');

  program.parse();
  const raw = program.opts<{
    providers?: string;
    excludeProviders: string;
    prompt: string;
    port?: string;
    claudeTimeout: string;
    healthTimeout: string;
    ttsSettleMs: string;
    ttsDrainTimeout: string;
    ttsExtraDrainMs: string;
    voiceAnnounce?: boolean;
    skipClaude?: boolean;
    json?: boolean;
    allowPartial?: boolean;
  }>();

  const explicitProviders = raw.providers
    ? raw.providers.split(',').map((p) => p.trim()).filter(Boolean)
    : null;
  const extraExclude = raw.excludeProviders
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const resolved = resolveTestProviders({
    projectRoot: PROJECT_ROOT,
    explicit: explicitProviders ?? undefined,
    extraExclude,
  });

  if (resolved.warnings.length > 0) {
    for (const w of resolved.warnings) {
      console.log(chalk.yellow(`[AVISO] ${w}`));
    }
  }

  const opts: CliOptions = {
    providers: resolved.providers,
    excludeProviders: extraExclude,
    prompt: raw.prompt,
    port: raw.port ? parseInt(raw.port, 10) : undefined,
    claudeTimeout: parseInt(raw.claudeTimeout, 10),
    healthTimeout: parseInt(raw.healthTimeout, 10),
    ttsSettleMs: parseInt(raw.ttsSettleMs, 10),
    ttsDrainTimeoutMs: parseInt(raw.ttsDrainTimeout, 10),
    ttsExtraDrainMs: parseInt(raw.ttsExtraDrainMs, 10),
    skipClaude: raw.skipClaude === true,
    voiceAnnounce: raw.voiceAnnounce !== false,
    json: raw.json === true,
    allowPartial: raw.allowPartial === true,
  };

  const prereqErrors = checkPrerequisites();
  if (prereqErrors.length > 0) {
    for (const err of prereqErrors) {
      console.error(chalk.red(err));
    }
    process.exit(1);
  }

  // Guard de aislamiento: el puerto de test no puede ser el del proxy principal,
  // del que puede depender la sesión de Claude Code que lanza esta suite.
  const mainProxyPort = getProxyPort();
  const testPort = opts.port ?? DEFAULT_TEST_PORT;
  if (testPort === mainProxyPort) {
    console.error(
      chalk.red(
        `El puerto de test (${testPort}) coincide con el del proxy principal (${mainProxyPort}, configs/.env). ` +
          'Use --port con un puerto distinto para no interrumpir la sesión principal.',
      ),
    );
    process.exit(1);
  }

  if (resolved.providers.length === 0) {
    console.error(chalk.red('No hay proveedores que probar tras aplicar exclusiones.'));
    process.exit(1);
  }

  if (!opts.json) {
    printSuitePlan(resolved.providers, resolved.excludedByDefault, explicitProviders !== null);
  }

  const results: ProviderTestResult[] = [];

  for (const provider of opts.providers) {
    const result = await testProvider(provider, opts);
    results.push(result);
    if (!opts.json) {
      printProviderResult(result);
    }
  }

  // Escenario adicional: fallback sin clave TTS (se salta si --skip-claude)
  let fallbackScenarioPassed = true;
  if (!opts.skipClaude) {
    fallbackScenarioPassed = await testFallbackScenario(opts);
    if (!opts.json) {
      if (fallbackScenarioPassed) {
        console.log(chalk.green('  Escenario fallback sin clave: OK'));
      } else {
        console.log(chalk.red('  Escenario fallback sin clave: FALLIDO'));
      }
    }
  }

  if (opts.json) {
    printJsonReport(results);
  } else {
    printResultsSummary(results);
  }

  const anyTtsFailed = results.some((r) => !r.ttsWorked && !opts.skipClaude);
  const fallbackScenarioFailed = !opts.skipClaude && !fallbackScenarioPassed;
  if ((anyTtsFailed || fallbackScenarioFailed) && !opts.allowPartial) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(msg));
  process.exit(1);
});
