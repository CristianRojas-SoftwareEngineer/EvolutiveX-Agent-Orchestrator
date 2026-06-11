import { join } from 'node:path';
import { killProcessOnPort, startProxy, stopProxy, waitHealth, sleep, getLogPath } from './proxy-lifecycle.js';
import { runClaudeHeadless } from './run-claude.js';
import { buildIsolatedProviderEnv } from './provider-env.js';
import { getProxyPort } from './env-utils.js';

export interface HeadlessSessionOptions {
  provider: string;
  prompt: string;
  port?: number;
  maxTurns?: number;
  claudeTimeoutMs?: number;
  healthTimeoutMs?: number;
  logFile?: string;
  auditDir?: string;
  /** Variables de entorno extra inyectadas en el proxy de test (p.ej. para simular clave TTS ausente). */
  extraProxyEnv?: Record<string, string>;
}

export interface HeadlessSessionResult {
  output: string;
  exitCode: number;
  isError: boolean;
  logPath: string;
  sessionDir: string;
  claudeStartedAt: number;
}

const DEFAULT_PORT = 8788;
const DEFAULT_LOG_FILE = 'logs-headless.jsonl';
const DEFAULT_AUDIT_DIR = join('sessions', 'headless');
const DEFAULT_CLAUDE_TIMEOUT_MS = 180_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;

/**
 * Lanza una sesión aislada Smart Code Proxy + Claude Code de forma no interactiva.
 * Garantiza que ni ~/.claude/settings.json ni configs/.env sean mutados, y que el
 * proxy principal no sea interrumpido.
 */
export async function runHeadlessSession(opts: HeadlessSessionOptions): Promise<HeadlessSessionResult> {
  const projectRoot = process.cwd();
  const port = opts.port ?? DEFAULT_PORT;
  const claudeTimeoutMs = opts.claudeTimeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS;
  const healthTimeoutMs = opts.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const logFile = opts.logFile ?? DEFAULT_LOG_FILE;
  const auditDir = opts.auditDir ?? DEFAULT_AUDIT_DIR;
  const logPath = getLogPath(projectRoot, logFile);
  const sessionDir = join(projectRoot, auditDir);

  // Guard de aislamiento: el puerto de test no puede coincidir con el del proxy principal.
  const mainPort = getProxyPort();
  if (port === mainPort) {
    throw new Error(
      `Puerto de test (${port}) coincide con el del proxy principal (${mainPort}). ` +
      'Usa un puerto distinto con la opción port.',
    );
  }

  const { claudeEnv, proxyEnv, upstreamOrigin: _ } = buildIsolatedProviderEnv(opts.provider, port);

  killProcessOnPort(port);
  await sleep(1000);

  const proxyHandle = startProxy(projectRoot, port, {
    ...proxyEnv,
    ...(opts.extraProxyEnv ?? {}),
    LOG_FILE: logPath,
    AUDIT_BASE_DIR: sessionDir,
  });

  try {
    const healthy = await waitHealth(port, healthTimeoutMs);
    if (!healthy) {
      return {
        output: `Proxy no respondió en /health dentro de ${healthTimeoutMs}ms`,
        exitCode: 1,
        isError: true,
        logPath,
        sessionDir,
        claudeStartedAt: 0,
      };
    }

    const claudeStartedAt = Date.now();
    const result = await runClaudeHeadless(opts.prompt, projectRoot, claudeTimeoutMs, claudeEnv, opts.maxTurns ?? 1);

    return {
      output: result.resultText,
      exitCode: result.exitCode,
      isError: result.isError,
      logPath,
      sessionDir,
      claudeStartedAt,
    };
  } finally {
    await stopProxy(proxyHandle);
  }
}
