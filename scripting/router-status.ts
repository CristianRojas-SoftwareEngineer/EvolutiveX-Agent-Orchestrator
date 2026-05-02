/**
 * Statusline de Claude Code para Smart Code Proxy.
 *
 * Renderiza 2-3 tablas Unicode según el contexto:
 *  - Tabla 1: Sesión y proveedor activo
 *  - Tabla 2: Métricas de interacciones por nivel de razonamiento
 *  - Tabla 3: Rate limits (solo si authMethod === 'oauth')
 *
 * Lee stdin como JSON con el contexto de Claude Code ($ctx).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Tipos ───────────────────────────────────────────────────────

interface ClaudeCodeContext {
  session_id?: string;
  model?: {
    display_name?: string;
  };
  context_window?: {
    context_window_size?: number;
    used_percentage?: number;
  };
  rate_limits?: {
    requests?: {
      limit_5h?: { used?: number; remaining?: number; reset?: number };
      limit_7d?: { used?: number; remaining?: number; reset?: number };
    };
  } | null;
}

interface ProviderConfig {
  ANTHROPIC_BASE_URL?: string;
  [key: string]: unknown;
}

interface ModelMetadata {
  modelId: string;
  displayName?: string;
}

interface InteractionMeta {
  interactionType?: string;
  totals?: {
    inputTokens?: number;
    cacheReadInputTokens?: number;
    outputTokens?: number;
  } | null;
}

interface InteractionRequest {
  model?: string;
}

interface TokenMetrics {
  inputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  count: number;
}

// ── Constantes ──────────────────────────────────────────────────

const PROJECT_ROOT = join(process.cwd());
const ROUTING_PATH = join(PROJECT_ROOT, 'routing', 'providers');
const SESSIONS_PATH = join(PROJECT_ROOT, 'sessions');
const ENV_PATH = join(PROJECT_ROOT, 'configs', '.env');
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  ml: '├', mr: '┤', mt: '┬', mb: '┴', mm: '┼',
};

// ── Helpers de renderizado ──────────────────────────────────────

function pad(str: string, len: number): string {
  // Eliminar caracteres de control ANSI para calcular longitud real
  const stripped = str.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}

function bar(percentage: number, width: number = 10): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  let colorFn: (s: string) => string = (s) => s;
  if (percentage <= 39) {
    colorFn = (s) => `\x1B[32m${s}\x1B[0m`; // verde
  } else if (percentage <= 69) {
    colorFn = (s) => `\x1B[33m${s}\x1B[0m`; // ámbar
  } else {
    colorFn = (s) => `\x1B[31m${s}\x1B[0m`; // rojo
  }
  return colorFn('█'.repeat(filled)) + '\x1B[90m' + '░'.repeat(empty) + '\x1B[0m';
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('es').format(n);
}

function formatTimeRemaining(resetEpoch?: number): string {
  if (!resetEpoch) return 'N/A';
  const diffMs = resetEpoch * 1000 - Date.now();
  if (diffMs <= 0) return 'Ahora';
  const diffMin = Math.ceil(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffH < 24) return remMin > 0 ? `${diffH}h ${remMin}m` : `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  const remH = diffH % 24;
  return remH > 0 ? `${diffD}d ${remH}h` : `${diffD}d`;
}

function boxLine(cells: string[], widths: number[]): string {
  const content = cells.map((c, i) => pad(c, widths[i])).join(' │ ');
  return `${BOX.v} ${content} ${BOX.v}`;
}

function boxTop(widths: number[]): string {
  return BOX.tl + widths.map((w) => BOX.h.repeat(w + 2)).join(BOX.mt) + BOX.tr;
}

function boxMid(widths: number[]): string {
  return BOX.ml + widths.map((w) => BOX.h.repeat(w + 2)).join(BOX.mm) + BOX.mr;
}

function boxBot(widths: number[]): string {
  return BOX.bl + widths.map((w) => BOX.h.repeat(w + 2)).join(BOX.mb) + BOX.br;
}

// ── Lógica de resolución ────────────────────────────────────────

function readDotEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(ENV_PATH)) return result;
  const content = readFileSync(ENV_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

function resolveActiveProvider(): { providerName: string; upstreamOrigin: string } {
  const envVars = readDotEnv();
  const upstreamOrigin = envVars['UPSTREAM_ORIGIN'] || '';

  if (!upstreamOrigin) {
    return { providerName: 'Desconocido', upstreamOrigin: '' };
  }

  if (!existsSync(ROUTING_PATH)) {
    return { providerName: 'Desconocido', upstreamOrigin };
  }

  const providers = readdirSync(ROUTING_PATH, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROUTING_PATH, d.name, 'config.json')));

  for (const provider of providers) {
    try {
      const configPath = join(ROUTING_PATH, provider.name, 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as ProviderConfig;
      if (config.ANTHROPIC_BASE_URL === upstreamOrigin) {
        return { providerName: provider.name, upstreamOrigin };
      }
    } catch {
      // Ignorar providers con config corrupta
    }
  }

  return { providerName: 'Desconocido', upstreamOrigin };
}

function resolveAuthMethod(): 'api_key' | 'bearer' | 'oauth' {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

  if (apiKey && apiKey.trim() !== '') return 'api_key';
  if (authToken && authToken.trim() !== '') return 'bearer';
  return 'oauth';
}

function resolveSessionPath(sessionId?: string): string | null {
  if (!existsSync(SESSIONS_PATH)) return null;

  const sessions = readdirSync(SESSIONS_PATH, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  if (sessions.length === 0) return null;

  // Buscar por prefijo del session_id
  if (sessionId) {
    const match = sessions.find((s) => s.name.startsWith(sessionId));
    if (match) return join(SESSIONS_PATH, match.name);
  }

  // Fallback: directorio más reciente
  let newest: { name: string; mtime: number } | null = null;
  for (const s of sessions) {
    const stat = statSync(join(SESSIONS_PATH, s.name));
    if (!newest || stat.mtimeMs > newest.mtime) {
      newest = { name: s.name, mtime: stat.mtimeMs };
    }
  }

  return newest ? join(SESSIONS_PATH, newest.name) : null;
}

function loadDisplayName(modelId: string): string {
  if (!existsSync(ROUTING_PATH)) return modelId;

  const providers = readdirSync(ROUTING_PATH, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const provider of providers) {
    const modelsDir = join(ROUTING_PATH, provider.name, 'models');
    if (!existsSync(modelsDir)) continue;

    const models = readdirSync(modelsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const model of models) {
      const metadataPath = join(modelsDir, model.name, 'metadata.json');
      if (!existsSync(metadataPath)) continue;
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ModelMetadata;
        if (metadata.modelId === modelId) {
          return metadata.displayName || modelId;
        }
      } catch {
        // Ignorar metadata corrupta
      }
    }
  }

  return modelId;
}

function classifyModel(modelId: string): 'lite' | 'standard' | 'reasoning' {
  const haiku = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '';
  const sonnet = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '';
  const opus = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '';

  // Extraer el nombre del modelo de la ruta (ej. "models/claude-haiku-4-5" → "claude-haiku-4-5")
  const modelBase = modelId.split('/').pop() || modelId;

  if (haiku && (modelId.includes(haiku) || modelBase.includes('haiku'))) return 'lite';
  if (opus && (modelId.includes(opus) || modelBase.includes('opus'))) return 'reasoning';
  if (sonnet && (modelId.includes(sonnet) || modelBase.includes('sonnet'))) return 'standard';

  // Fallback: clasificar por nombre
  if (modelBase.includes('haiku') || modelBase.includes('flash') || modelBase.includes('mini')) return 'lite';
  if (modelBase.includes('opus') || modelBase.includes('pro') || modelBase.includes('reasoning')) return 'reasoning';
  return 'standard';
}

function aggregateInteractionMetrics(sessionPath: string): {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
} {
  const empty: TokenMetrics = { inputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0, count: 0 };
  const metrics = { lite: { ...empty }, standard: { ...empty }, reasoning: { ...empty } };

  const interactionsPath = join(sessionPath, 'interactions');
  if (!existsSync(interactionsPath)) return metrics;

  const interactions = readdirSync(interactionsPath, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const interaction of interactions) {
    const metaPath = join(interactionsPath, interaction.name, 'meta.json');
    if (!existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as InteractionMeta;

      // Solo contar agentic-turn y side-request
      if (meta.interactionType !== 'agentic-turn' && meta.interactionType !== 'side-request') continue;

      // Leer model del request
      const bodyPath = join(interactionsPath, interaction.name, 'request', 'body.json');
      let modelId = '';
      if (existsSync(bodyPath)) {
        try {
          const body = JSON.parse(readFileSync(bodyPath, 'utf-8')) as InteractionRequest;
          modelId = body.model || '';
        } catch {
          // Ignorar body corrupto
        }
      }

      if (!modelId) continue;

      const level = classifyModel(modelId);
      const levelMetrics = metrics[level];

      levelMetrics.count++;
      if (meta.totals) {
        levelMetrics.inputTokens += meta.totals.inputTokens || 0;
        levelMetrics.cacheReadInputTokens += meta.totals.cacheReadInputTokens || 0;
        levelMetrics.outputTokens += meta.totals.outputTokens || 0;
      }
    } catch {
      // Ignorar meta.json corrupto
    }
  }

  return metrics;
}

// ── Renderizado de tablas ───────────────────────────────────────

function renderSessionTable(ctx: ClaudeCodeContext): string {
  const lines: string[] = [];
  const widths = [18, 30];

  lines.push(boxTop(widths));
  lines.push(boxLine(['Sesión', 'Proveedor'], widths));
  lines.push(boxMid(widths));

  const provider = resolveActiveProvider();
  const sessionId = ctx.session_id || 'N/A';
  const sessionDisplay = sessionId.length > 28 ? sessionId.slice(0, 25) + '...' : sessionId;
  lines.push(boxLine([sessionDisplay, provider.providerName], widths));

  lines.push(boxMid(widths));

  const modelName = ctx.model?.display_name || 'N/A';
  const contextSize = ctx.context_window?.context_window_size;
  const usedPct = ctx.context_window?.used_percentage;

  const contextDisplay = contextSize ? `${formatNumber(contextSize)} tokens` : 'N/A';
  const pctDisplay = usedPct !== undefined && usedPct !== null ? `${usedPct.toFixed(1)}%` : 'N/A';

  lines.push(boxLine(['Modelo activo', modelName], widths));
  lines.push(boxMid(widths));
  lines.push(boxLine(['Ventana ctx', contextDisplay], widths));
  lines.push(boxMid(widths));

  // Barra de progreso
  const pctBar = usedPct !== undefined && usedPct !== null
    ? `${bar(usedPct)} ${pctDisplay}`
    : 'N/A';
  lines.push(boxLine(['Uso ctx', pctBar], widths));

  lines.push(boxBot(widths));

  return lines.join('\n');
}

function renderTokenTable(metrics: {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
}): string {
  const lines: string[] = [];
  const widths = [10, 18, 6, 12, 14, 12];

  lines.push(boxTop(widths));
  lines.push(boxLine(['Nivel', 'Modelo', 'N.º', 'Tokens Input', 'Cache Input', 'Tokens Output'], widths));
  lines.push(boxMid(widths));

  const levels: Array<{ key: keyof typeof metrics; label: string; modelExample: string }> = [
    { key: 'lite', label: 'Lite', modelExample: 'Haiku/Flash' },
    { key: 'standard', label: 'Standard', modelExample: 'Sonnet' },
    { key: 'reasoning', label: 'Reasoning', modelExample: 'Opus/Pro' },
  ];

  let totalInput = 0;
  let totalCache = 0;
  let totalOutput = 0;
  let totalCount = 0;

  for (const level of levels) {
    const m = metrics[level.key];
    totalInput += m.inputTokens;
    totalCache += m.cacheReadInputTokens;
    totalOutput += m.outputTokens;
    totalCount += m.count;

    lines.push(boxLine([
      level.label,
      level.modelExample,
      String(m.count),
      formatNumber(m.inputTokens),
      formatNumber(m.cacheReadInputTokens),
      formatNumber(m.outputTokens),
    ], widths));

    if (level.key !== 'reasoning') {
      lines.push(boxMid(widths));
    }
  }

  lines.push(boxMid(widths));
  lines.push(boxLine([
    'Total',
    '-',
    String(totalCount),
    formatNumber(totalInput),
    formatNumber(totalCache),
    formatNumber(totalOutput),
  ], widths));
  lines.push(boxBot(widths));

  return lines.join('\n');
}

function renderRateLimitTable(ctx: ClaudeCodeContext): string | null {
  if (!ctx.rate_limits?.requests) return null;

  const { limit_5h, limit_7d } = ctx.rate_limits.requests;
  if (!limit_5h && !limit_7d) return null;

  const lines: string[] = [];
  const widths = [12, 22, 14];

  lines.push(boxTop(widths));
  lines.push(boxLine(['Cuota', 'Barra de uso', 'Reinicio'], widths));
  lines.push(boxMid(widths));

  if (limit_5h) {
    const used = limit_5h.used || 0;
    const remaining = limit_5h.remaining || 0;
    const total = used + remaining;
    const pct = total > 0 ? (used / total) * 100 : 0;
    const barStr = `${bar(pct)} ${formatNumber(used)}/${formatNumber(total)}`;
    lines.push(boxLine(['5 horas', barStr, formatTimeRemaining(limit_5h.reset)], widths));
    lines.push(boxMid(widths));
  }

  if (limit_7d) {
    const used = limit_7d.used || 0;
    const remaining = limit_7d.remaining || 0;
    const total = used + remaining;
    const pct = total > 0 ? (used / total) * 100 : 0;
    const barStr = `${bar(pct)} ${formatNumber(used)}/${formatNumber(total)}`;
    lines.push(boxLine(['7 días', barStr, formatTimeRemaining(limit_7d.reset)], widths));
  } else {
    // Eliminar la última línea de separación si no hay limit_7d
    lines.pop();
  }

  lines.push(boxBot(widths));

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────

function main(): void {
  // Leer stdin
  const chunks: string[] = [];
  process.stdin.on('data', (chunk) => chunks.push(String(chunk)));
  process.stdin.on('end', () => {
    const input = chunks.join('').trim();

    let ctx: ClaudeCodeContext = {};
    if (input) {
      try {
        ctx = JSON.parse(input) as ClaudeCodeContext;
      } catch {
        // Si no hay JSON válido, mostrar tablas con datos vacíos
      }
    }

    const output: string[] = [];

    // Tabla 1: Sesión y proveedor
    output.push(renderSessionTable(ctx));

    // Tabla 2: Métricas de interacciones
    const sessionPath = resolveSessionPath(ctx.session_id);
    if (sessionPath) {
      const metrics = aggregateInteractionMetrics(sessionPath);
      output.push('');
      output.push(renderTokenTable(metrics));
    }

    // Tabla 3: Rate limits (solo OAuth)
    const authMethod = resolveAuthMethod();
    if (authMethod === 'oauth') {
      const rateLimitTable = renderRateLimitTable(ctx);
      if (rateLimitTable) {
        output.push('');
        output.push(rateLimitTable);
      }
    }

    console.log(output.join('\n'));
  });
}

main();
