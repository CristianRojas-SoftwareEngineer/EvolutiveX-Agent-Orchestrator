/**
 * Statusline de Claude Code para Smart Code Proxy.
 *
 * Renderiza 2-3 tablas según el contexto:
 *  - Tabla 1: Sesión y proveedor activo (formato compacto con colores)
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

// ── Colores ANSI ────────────────────────────────────────────────

const C = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  // Headers
  header: '\x1B[1;36m',    // cyan bold
  // Valores
  value: '\x1B[1;33m',     // amarillo bold (para valores importantes)
  provider: '\x1B[1;32m',  // verde bold
  model: '\x1B[1;35m',     // magenta bold
  // Niveles
  lite: '\x1B[32m',        // verde
  standard: '\x1B[33m',    // amarillo
  reasoning: '\x1B[31m',   // rojo
  total: '\x1B[1;37m',     // blanco bold
  // Barra de progreso
  barGreen: '\x1B[32m',
  barAmber: '\x1B[33m',
  barRed: '\x1B[31m',
  barEmpty: '\x1B[90m',    // gris
  // Tabla
  separator: '\x1B[90m',   // gris
  label: '\x1B[37m',       // blanco
};

// ── Helpers de renderizado ──────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('es').format(n);
}

function formatTokens(n: number): string {
  if (n === 0) return '-';
  return formatNumber(n);
}

function formatContextSize(size?: number): string {
  if (!size) return 'N/A';
  if (size >= 1000000) return `${(size / 1000000).toFixed(0)}M`;
  if (size >= 1000) return `${Math.round(size / 1000)}K`;
  return String(size);
}

function renderBar(percentage: number, width: number = 10): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  let colorFn: (s: string) => string;
  if (percentage <= 39) {
    colorFn = (s) => `${C.barGreen}${s}${C.reset}`;
  } else if (percentage <= 69) {
    colorFn = (s) => `${C.barAmber}${s}${C.reset}`;
  } else {
    colorFn = (s) => `${C.barRed}${s}${C.reset}`;
  }

  const filledBar = '█'.repeat(filled);
  const emptyBar = `${C.barEmpty}${'░'.repeat(empty)}${C.reset}`;
  return `${colorFn(filledBar)}${emptyBar}`;
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
  const provider = resolveActiveProvider();
  const sessionId = ctx.session_id || 'N/A';
  const modelName = ctx.model?.display_name || 'N/A';
  const contextSize = ctx.context_window?.context_window_size;
  const usedPct = ctx.context_window?.used_percentage;

  const contextDisplay = formatContextSize(contextSize);
  const pctDisplay = usedPct !== undefined && usedPct !== null ? `${usedPct.toFixed(0)}%` : 'N/A';
  const barDisplay = usedPct !== undefined && usedPct !== null
    ? `\`${renderBar(usedPct)} ${pctDisplay}\``
    : 'N/A';

  // Truncar session_id si es muy largo
  const sessionDisplay = sessionId.length > 36
    ? sessionId.slice(0, 33) + '...'
    : sessionId;

  const lines: string[] = [];
  lines.push(`${C.header}### Sesión actual «${sessionDisplay}»${C.reset}`);
  lines.push('');
  lines.push(`| ${C.label}Proveedor${C.reset} | ${C.provider}${provider.providerName}${C.reset} | ${C.label}Modelo activo${C.reset} | ${C.model}${modelName}${C.reset} | ${C.label}Ventana de contexto${C.reset} | ${C.value}${contextDisplay}${C.reset} | ${C.label}Porcentaje de uso${C.reset} | ${barDisplay} |`);
  lines.push(`|${C.separator}---|---|---|---|---|---|---|---${C.reset}|`);

  return lines.join('\n');
}

function renderTokenTable(metrics: {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
}): string {
  const levels: Array<{ key: keyof typeof metrics; label: string; modelExample: string; color: string }> = [
    { key: 'lite', label: 'Lite', modelExample: 'MiMo 2 Omni', color: C.lite },
    { key: 'standard', label: 'Standard', modelExample: 'MiMo 2.5', color: C.standard },
    { key: 'reasoning', label: 'Reasoning', modelExample: 'MiMo 2.5 Pro', color: C.reasoning },
  ];

  const lines: string[] = [];
  lines.push(`${C.header}### Interacciones por niveles de razonamiento y consumo de tokens${C.reset}`);
  lines.push('');
  lines.push(`| ${C.label}Nivel${C.reset} | ${C.label}Modelo${C.reset} | ${C.label}Número de Interacciones${C.reset} | ${C.label}Tokens de Input${C.reset} | ${C.label}Tokens de Input Cacheado${C.reset} | ${C.label}Tokens de Output${C.reset} |`);
  lines.push(`|${C.separator}---|---|---:|---:|---:|---:${C.reset}|`);

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

    lines.push(`| ${level.color}${level.label}${C.reset} | ${level.color}${level.modelExample}${C.reset} | ${C.value}${m.count}${C.reset} | ${C.value}${formatTokens(m.inputTokens)}${C.reset} | ${C.value}${formatTokens(m.cacheReadInputTokens)}${C.reset} | ${C.value}${formatTokens(m.outputTokens)}${C.reset} |`);
  }

  // Fila de total
  lines.push(`| ${C.total}Sesión actual${C.reset} | ${C.total}Total${C.reset} | ${C.total}${totalCount}${C.reset} | ${C.total}${formatTokens(totalInput)}${C.reset} | ${C.total}${formatTokens(totalCache)}${C.reset} | ${C.total}${formatTokens(totalOutput)}${C.reset} |`);

  return lines.join('\n');
}

function renderRateLimitTable(ctx: ClaudeCodeContext): string | null {
  if (!ctx.rate_limits?.requests) return null;

  const { limit_5h, limit_7d } = ctx.rate_limits.requests;
  if (!limit_5h && !limit_7d) return null;

  const lines: string[] = [];
  lines.push(`${C.header}### Límites de tasa (Rate Limits)${C.reset}`);
  lines.push('');
  lines.push(`| ${C.label}Cuota${C.reset} | ${C.label}Barra de uso${C.reset} | ${C.label}Reinicio${C.reset} |`);
  lines.push(`|${C.separator}---|---|---${C.reset}|`);

  if (limit_5h) {
    const used = limit_5h.used || 0;
    const remaining = limit_5h.remaining || 0;
    const total = used + remaining;
    const pct = total > 0 ? (used / total) * 100 : 0;
    const barStr = `${renderBar(pct)} ${formatNumber(used)}/${formatNumber(total)}`;
    lines.push(`| ${C.label}5 horas${C.reset} | ${barStr} | ${C.value}${formatTimeRemaining(limit_5h.reset)}${C.reset} |`);
  }

  if (limit_7d) {
    const used = limit_7d.used || 0;
    const remaining = limit_7d.remaining || 0;
    const total = used + remaining;
    const pct = total > 0 ? (used / total) * 100 : 0;
    const barStr = `${renderBar(pct)} ${formatNumber(used)}/${formatNumber(total)}`;
    lines.push(`| ${C.label}7 días${C.reset} | ${barStr} | ${C.value}${formatTimeRemaining(limit_7d.reset)}${C.reset} |`);
  }

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
