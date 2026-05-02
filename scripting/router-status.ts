/**
 * Statusline de Claude Code para Smart Code Proxy.
 *
 * Renderiza 2-3 tablas Unicode con bordes redondeados y anchos calculados:
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

// ── Colores ANSI ────────────────────────────────────────────────

const C = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  // Headers y títulos
  title: '\x1B[1;34m',     // azul bold
  header: '\x1B[1;34m',    // azul bold
  // Valores
  value: '\x1B[1;94m',     // azul rey bold (bright blue)
  provider: '\x1B[1;94m',  // azul rey bold
  model: '\x1B[1;94m',     // azul rey bold
  // Niveles (azul claro, azul rey, blanco)
  lite: '\x1B[34m',        // azul
  standard: '\x1B[1;94m',  // azul rey bold
  reasoning: '\x1B[37m',   // blanco
  total: '\x1B[1;37m',     // blanco bold
  // Barra de progreso (azul claro, azul rey, blanco)
  barFilled: '\x1B[1;94m', // azul rey bold
  barEmpty: '\x1B[90m',    // gris
  // Bordes de tabla
  border: '\x1B[90m',      // gris
  label: '\x1B[37m',       // blanco
};

// ── Bordes Unicode ──────────────────────────────────────────────

const B = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  ml: '├', mr: '┤', mt: '┬', mb: '┴', mm: '┼',
};

// ── Helpers de renderizado ──────────────────────────────────────

/** Longitud visible de un string (sin contar códigos ANSI) */
function visibleLength(str: string): number {
  return str.replace(/\x1B\[[0-9;]*m/g, '').length;
}

/** Padding a longitud fija con color */
function padRight(str: string, len: number): string {
  const vis = visibleLength(str);
  const pad = Math.max(0, len - vis);
  return str + ' '.repeat(pad);
}

/** Padding centrado con color */
function padCenter(str: string, len: number): string {
  const vis = visibleLength(str);
  const totalPad = Math.max(0, len - vis);
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

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

  const filledBar = `${C.barFilled}${'█'.repeat(filled)}${C.reset}`;
  const emptyBar = `${C.barEmpty}${'░'.repeat(empty)}${C.reset}`;
  return `${filledBar}${emptyBar}`;
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

// ── Renderizado de tablas con bordes ────────────────────────────

/**
 * Renderiza una tabla con bordes Unicode redondeados.
 * @param headers - Array de labels de columnas (texto plano)
 * @param rows - Array de filas, cada una array de celdas (texto con colores ANSI)
 * @param alignments - Alineación por columna: 'left' | 'center' | 'right'
 */
function renderTable(
  headers: string[],
  rows: string[][],
  alignments: ('left' | 'center' | 'right')[] = [],
): string {
  const colCount = headers.length;
  if (alignments.length === 0) {
    alignments = headers.map(() => 'left');
  }

  // Calcular ancho máximo por columna (basado en contenido visible)
  const widths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    let maxW = visibleLength(headers[i]);
    for (const row of rows) {
      if (i < row.length) {
        maxW = Math.max(maxW, visibleLength(row[i]));
      }
    }
    widths[i] = maxW;
  }

  // Función para alinear celda
  function alignCell(text: string, width: number, align: 'left' | 'center' | 'right'): string {
    switch (align) {
      case 'right': return padRight(text, width); // padRight ya hace left, invertimos
      case 'center': return padCenter(text, width);
      default: return padRight(text, width);
    }
  }

  // Para alineación a la derecha, necesitamos padding manual
  function alignRight(text: string, width: number): string {
    const vis = visibleLength(text);
    const pad = Math.max(0, width - vis);
    return ' '.repeat(pad) + text;
  }

  const lines: string[] = [];

  // Línea superior: ╭───┬───╮
  const topParts = widths.map((w) => B.h.repeat(w + 2));
  lines.push(`${C.border}${B.tl}${topParts.join(B.mt)}${B.tr}${C.reset}`);

  // Header: │ Header │ Header │
  const headerCells = headers.map((h, i) => {
    const colored = `${C.label}${h}${C.reset}`;
    const aligned = alignments[i] === 'right'
      ? alignRight(colored, widths[i])
      : padCenter(colored, widths[i]);
    return aligned;
  });
  lines.push(`${C.border}${B.v}${C.reset} ${headerCells.join(` ${C.border}${B.v}${C.reset} `)} ${C.border}${B.v}${C.reset}`);

  // Separador de header: ├───┼───┤
  const midParts = widths.map((w) => B.h.repeat(w + 2));
  lines.push(`${C.border}${B.ml}${midParts.join(B.mm)}${B.mr}${C.reset}`);

  // Filas de datos
  for (const row of rows) {
    const cells = row.map((cell, i) => {
      const aligned = alignments[i] === 'right'
        ? alignRight(cell, widths[i])
        : alignments[i] === 'center'
          ? padCenter(cell, widths[i])
          : padRight(cell, widths[i]);
      return aligned;
    });
    lines.push(`${C.border}${B.v}${C.reset} ${cells.join(` ${C.border}${B.v}${C.reset} `)} ${C.border}${B.v}${C.reset}`);
  }

  // Línea inferior: ╰───┴───╯
  const botParts = widths.map((w) => B.h.repeat(w + 2));
  lines.push(`${C.border}${B.bl}${botParts.join(B.mb)}${B.br}${C.reset}`);

  return lines.join('\n');
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

  if (sessionId) {
    const match = sessions.find((s) => s.name.startsWith(sessionId));
    if (match) return join(SESSIONS_PATH, match.name);
  }

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

  const modelBase = modelId.split('/').pop() || modelId;

  if (haiku && (modelId.includes(haiku) || modelBase.includes('haiku'))) return 'lite';
  if (opus && (modelId.includes(opus) || modelBase.includes('opus'))) return 'reasoning';
  if (sonnet && (modelId.includes(sonnet) || modelBase.includes('sonnet'))) return 'standard';

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

      if (meta.interactionType !== 'agentic-turn' && meta.interactionType !== 'side-request') continue;

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

// ── Renderizado de tablas completas ─────────────────────────────

function renderSessionTable(ctx: ClaudeCodeContext): string {
  const provider = resolveActiveProvider();
  const sessionId = ctx.session_id || 'N/A';
  const modelName = ctx.model?.display_name || 'N/A';
  const contextSize = ctx.context_window?.context_window_size;
  const usedPct = ctx.context_window?.used_percentage;

  const contextDisplay = formatContextSize(contextSize);

  // Determinar mostrar del porcentaje de uso
  let barDisplay: string;
  if (usedPct === undefined || usedPct === null) {
    // Sin datos de contexto
    barDisplay = 'N/A';
  } else if (usedPct === 0 && contextSize && contextSize > 0) {
    // Valor 0 con tamaño de ventana válido = turno inicial, aún no calculado
    barDisplay = `${C.dim}calculando...${C.reset}`;
  } else {
    // Valor real (incluyendo 0% explícito cuando no hay ventana definida)
    const pctDisplay = `${usedPct.toFixed(0)}%`;
    barDisplay = `${renderBar(usedPct)} ${pctDisplay}`;
  }

  const sessionDisplay = sessionId.length > 36
    ? sessionId.slice(0, 33) + '...'
    : sessionId;

  const lines: string[] = [];
  lines.push(`${C.title}╭─ Sesión actual «${sessionDisplay}»${'─'.repeat(Math.max(0, 40 - sessionDisplay.length))}╮${C.reset}`);

  const table = renderTable(
    ['Proveedor', 'Modelo activo', 'Ventana ctx', 'Uso'],
    [[
      `${C.provider}${provider.providerName}${C.reset}`,
      `${C.model}${modelName}${C.reset}`,
      `${C.value}${contextDisplay}${C.reset}`,
      barDisplay,
    ]],
    ['left', 'left', 'center', 'left'],
  );

  lines.push(table);
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

  const rows: string[][] = [];

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

    rows.push([
      `${level.color}${level.label}${C.reset}`,
      `${level.color}${level.modelExample}${C.reset}`,
      `${C.value}${m.count}${C.reset}`,
      `${C.value}${formatTokens(m.inputTokens)}${C.reset}`,
      `${C.value}${formatTokens(m.cacheReadInputTokens)}${C.reset}`,
      `${C.value}${formatTokens(m.outputTokens)}${C.reset}`,
    ]);
  }

  // Fila de total
  rows.push([
    `${C.total}Sesión actual${C.reset}`,
    `${C.total}Total${C.reset}`,
    `${C.total}${totalCount}${C.reset}`,
    `${C.total}${formatTokens(totalInput)}${C.reset}`,
    `${C.total}${formatTokens(totalCache)}${C.reset}`,
    `${C.total}${formatTokens(totalOutput)}${C.reset}`,
  ]);

  const lines: string[] = [];
  lines.push(`${C.title}╭─ Interacciones por nivel de razonamiento ─╮${C.reset}`);

  const table = renderTable(
    ['Nivel', 'Modelo', 'N.º', 'Input', 'Cache In', 'Output'],
    rows,
    ['left', 'left', 'right', 'right', 'right', 'right'],
  );

  lines.push(table);
  return lines.join('\n');
}

function renderRateLimitTable(ctx: ClaudeCodeContext): string | null {
  if (!ctx.rate_limits?.requests) return null;

  const { limit_5h, limit_7d } = ctx.rate_limits.requests;
  if (!limit_5h && !limit_7d) return null;

  const rows: string[][] = [];

  if (limit_5h) {
    const used = limit_5h.used || 0;
    const remaining = limit_5h.remaining || 0;
    const total = used + remaining;
    const pct = total > 0 ? (used / total) * 100 : 0;
    const barStr = `${renderBar(pct)} ${formatNumber(used)}/${formatNumber(total)}`;
    rows.push([
      `${C.label}5 horas${C.reset}`,
      barStr,
      `${C.value}${formatTimeRemaining(limit_5h.reset)}${C.reset}`,
    ]);
  }

  if (limit_7d) {
    const used = limit_7d.used || 0;
    const remaining = limit_7d.remaining || 0;
    const total = used + remaining;
    const pct = total > 0 ? (used / total) * 100 : 0;
    const barStr = `${renderBar(pct)} ${formatNumber(used)}/${formatNumber(total)}`;
    rows.push([
      `${C.label}7 días${C.reset}`,
      barStr,
      `${C.value}${formatTimeRemaining(limit_7d.reset)}${C.reset}`,
    ]);
  }

  const lines: string[] = [];
  lines.push(`${C.title}╭─ Rate Limits (OAuth) ─╮${C.reset}`);

  const table = renderTable(
    ['Cuota', 'Uso', 'Reinicio'],
    rows,
    ['left', 'left', 'center'],
  );

  lines.push(table);
  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────

function main(): void {
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
