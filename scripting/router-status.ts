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

import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
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
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?:  { used_percentage?: number; resets_at?: number };
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

interface SessionMetrics {
  models: Record<string, {
    count: number;
    inputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    outputTokens: number;
  }>;
}

interface TokenMetrics {
  inputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  count: number;
  modelName: string;
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
  dim: '\x1B[90m',
  // Cabeceras y títulos - azul #253ecc (rgb: 37-62-204)
  title: '\x1B[38;2;37;62;204m', // azul #253ecc
  header: '\x1B[38;2;37;62;204m', // azul #253ecc
  // Valores de celdas
  value: '\x1B[37m', // blanco
  provider: '\x1B[37m', // blanco
  model: '\x1B[37m', // blanco
  // Niveles (gris, blanco, blanco bold)
  lite: '\x1B[90m', // gris
  standard: '\x1B[37m', // blanco
  reasoning: '\x1B[1;37m', // blanco bold
  total: '\x1B[1;37m', // blanco bold
  // Barra de progreso
  barGreen: '\x1B[38;2;46;204;113m', // verde oscuro elegante
  barOrange: '\x1B[38;2;243;156;18m', // naranja oscuro elegante
  barRed: '\x1B[38;2;231;76;60m', // rojo oscuro elegante
  barEmpty: '\x1B[90m', // gris
  // Bordes de tabla
  border: '\x1B[90m', // gris
  label: '\x1B[38;2;37;62;204m', // azul #253ecc (cabeceras)
};

// ── Bordes Unicode ──────────────────────────────────────────────

const B = {
  tl: '╭',
  tr: '╮',
  bl: '╰',
  br: '╯',
  h: '─',
  v: '│',
  ml: '├',
  mr: '┤',
  mt: '┬',
  mb: '┴',
  mm: '┼',
};

// ── Helpers de renderizado ──────────────────────────────────────

/** Longitud visible de un string (sin contar códigos ANSI ni caracteres de ancho cero) */
const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const ZWSP_REGEX = /\u200b/g;
function visibleLength(str: string): number {
  return str.replace(ANSI_REGEX, '').replace(ZWSP_REGEX, '').length;
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

function barColor(percentage: number): string {
  if (percentage <= 39) return C.barGreen;
  if (percentage <= 69) return C.barOrange;
  return C.barRed;
}

function renderBar(percentage: number, width: number = 10): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const color = barColor(percentage);
  const filledBar = `${color}${'█'.repeat(filled)}${C.reset}`;
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
 * @returns Objeto con el string de la tabla y su ancho total visible
 */
function renderTable(
  headers: string[],
  rows: string[][],
  alignments: ('left' | 'center' | 'right')[] = [],
  separatorAfter?: number[],
  noHeader?: boolean,
): { table: string; width: number; columnWidths: number[] } {
  const colCount = headers.length;
  if (alignments.length === 0) {
    alignments = headers.map(() => 'left');
  }

  // Calcular ancho máximo por columna (basado en contenido visible)
  // Excluir celdas fusionadas (celda seguida de celda vacía)
  const widths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    let maxW = visibleLength(headers[i]);
    for (const row of rows) {
      if (i < row.length && row[i] !== '' && row[i] !== undefined) {
        // Si la celda siguiente está vacía, esta es una celda fusionada - excluir del cálculo
        const isMerged =
          i + 1 < colCount && (row[i + 1] === '' || row[i + 1] === undefined);
        if (!isMerged) {
          maxW = Math.max(maxW, visibleLength(row[i]));
        }
      }
    }
    widths[i] = maxW;
  }

  // Ancho total: anchos de columnas + padding por columna + bordes + separadores
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + widths.length * 3 + 1;

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

  if (!noHeader) {
    // Header: │ Header │ Header │
    const headerCells = headers.map((h, i) => {
      const colored = `${C.label}${h}${C.reset}`;
      const aligned =
        alignments[i] === 'right'
          ? alignRight(colored, widths[i])
          : padCenter(colored, widths[i]);
      return aligned;
    });
    lines.push(
      `${C.border}${B.v}${C.reset} ${headerCells.join(` ${C.border}${B.v}${C.reset} `)} ${C.border}${B.v}${C.reset}`,
    );

    // Separador de header: ├───┼───┤
    const midParts = widths.map((w) => B.h.repeat(w + 2));
    lines.push(`${C.border}${B.ml}${midParts.join(B.mm)}${B.mr}${C.reset}`);
  }

  // Filas de datos
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];

    // Verificar si hay celdas vacías (fusión)
    let rowLine = `${C.border}${B.v}${C.reset} `;
    for (let i = 0; i < colCount; i++) {
      const cell = row[i] || '';
      const isEmpty = cell === '';

      // Si la celda está vacía, extender la celda anterior
      if (isEmpty && i > 0) {
        continue;
      }

      // Calcular ancho efectivo (incluyendo celdas vacías siguientes)
      let effectiveWidth = widths[i];
      for (
        let j = i + 1;
        j < colCount && (row[j] === '' || row[j] === undefined);
        j++
      ) {
        effectiveWidth += widths[j] + 3; // +3 para espacio, borde, espacio
      }

      const aligned =
        alignments[i] === 'right'
          ? alignRight(cell, effectiveWidth)
          : alignments[i] === 'center'
            ? padCenter(cell, effectiveWidth)
            : padRight(cell, effectiveWidth);

      rowLine += aligned;

      // Agregar separador de columna (excepto si la siguiente celda está vacía)
      const nextIsEmpty =
        i + 1 < colCount && (row[i + 1] === '' || row[i + 1] === undefined);
      if (i < colCount - 1 && !nextIsEmpty) {
        rowLine += ` ${C.border}${B.v}${C.reset} `;
      }
    }
    rowLine += ` ${C.border}${B.v}${C.reset}`;
    lines.push(rowLine);

    // Separador horizontal opcional después de esta fila
    if (separatorAfter?.includes(r)) {
      const sepParts = widths.map((w) => B.h.repeat(w + 2));
      lines.push(`${C.border}${B.ml}${sepParts.join(B.mm)}${B.mr}${C.reset}`);
    }
  }

  // Línea inferior: ╰───┴───╯
  const botParts = widths.map((w) => B.h.repeat(w + 2));
  lines.push(`${C.border}${B.bl}${botParts.join(B.mb)}${B.br}${C.reset}`);

  return { table: lines.join('\n'), width: totalWidth, columnWidths: widths };
}

function renderSideBySide(
  left: { lines: string[]; width: number },
  right: { lines: string[]; width: number },
  gap: number = 2,
): string {
  const minLines = Math.min(left.lines.length, right.lines.length);
  const result: string[] = [];

  // Renderizar lado a lado las líneas que ambas tablas tienen en común
  for (let i = 0; i < minLines; i++) {
    const leftVisLen = visibleLength(left.lines[i]);
    const leftPad = ' '.repeat(Math.max(0, left.width - leftVisLen));
    result.push(
      `${left.lines[i]}${leftPad}${' '.repeat(gap)}${right.lines[i]}`,
    );
  }

  // Renderizar las líneas sobrantes de la tabla más larga debajo
  if (right.lines.length > left.lines.length) {
    // Usar ZWSP (zero-width space) para evitar recorte de espacios trailing por la terminal
    const zwsp = '​';
    const indent = zwsp + ' '.repeat(left.width + gap);
    for (let i = minLines; i < right.lines.length; i++) {
      result.push(`${indent}${right.lines[i]}`);
    }
  } else if (left.lines.length > right.lines.length) {
    for (let i = minLines; i < left.lines.length; i++) {
      result.push(left.lines[i]);
    }
  }

  return result.join('\n');
}

// ── Caché de porcentaje de uso (por sesión) ─────────────────────

function readCachedPct(sessionPath: string): number | null {
  try {
    const cacheFile = join(sessionPath, '.last-pct');
    if (!existsSync(cacheFile)) return null;
    const n = Number(readFileSync(cacheFile, 'utf-8').trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeCachedPct(sessionPath: string, pct: number): void {
  try {
    writeFileSync(join(sessionPath, '.last-pct'), String(pct), 'utf-8');
  } catch {
    // Ignorar errores de escritura
  }
}

// ── Caché de métricas previas (para flash de valores) ──────────

interface LevelMetricsSnapshot {
  count: number;
  inputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

interface MetricsSnapshot {
  lite: LevelMetricsSnapshot;
  standard: LevelMetricsSnapshot;
  reasoning: LevelMetricsSnapshot;
}

function readLastMetrics(sessionPath: string): MetricsSnapshot | null {
  try {
    const cacheFile = join(sessionPath, '.last-metrics.json');
    if (!existsSync(cacheFile)) return null;
    return JSON.parse(readFileSync(cacheFile, 'utf-8')) as MetricsSnapshot;
  } catch {
    return null;
  }
}

function writeLastMetrics(sessionPath: string, snapshot: MetricsSnapshot): void {
  try {
    writeFileSync(join(sessionPath, '.last-metrics.json'), JSON.stringify(snapshot), 'utf-8');
  } catch {
    // Ignorar errores de escritura
  }
}

// ── Lógica de resolución ────────────────────────────────────────

function readClaudeEnv(): Record<string, string> {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return {};
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as { env?: Record<string, string> };
    return settings.env ?? {};
  } catch {
    return {};
  }
}

const claudeEnv = readClaudeEnv();

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

function resolveActiveProvider(): {
  providerName: string;
  upstreamOrigin: string;
} {
  const envVars = readDotEnv();
  const upstreamOrigin = envVars['UPSTREAM_ORIGIN'] || '';

  if (!upstreamOrigin) {
    return { providerName: 'Desconocido', upstreamOrigin: '' };
  }

  if (!existsSync(ROUTING_PATH)) {
    return { providerName: 'Desconocido', upstreamOrigin };
  }

  const providers = readdirSync(ROUTING_PATH, { withFileTypes: true }).filter(
    (d) =>
      d.isDirectory() && existsSync(join(ROUTING_PATH, d.name, 'config.json')),
  );

  for (const provider of providers) {
    try {
      const configPath = join(ROUTING_PATH, provider.name, 'config.json');
      const config = JSON.parse(
        readFileSync(configPath, 'utf-8'),
      ) as ProviderConfig;
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
  const apiKey = claudeEnv['ANTHROPIC_API_KEY'];
  const authToken = claudeEnv['ANTHROPIC_AUTH_TOKEN'];

  if (apiKey && apiKey.trim() !== '') return 'api_key';
  if (authToken && authToken.trim() !== '') return 'bearer';
  return 'oauth';
}

function resolveSessionPath(sessionId?: string): string | null {
  if (!existsSync(SESSIONS_PATH)) return null;

  const sessions = readdirSync(SESSIONS_PATH, { withFileTypes: true }).filter(
    (d) => d.isDirectory(),
  );

  if (sessions.length === 0) return null;
  if (!sessionId) return null;

  const match = sessions.find((s) => s.name.startsWith(sessionId));
  return match ? join(SESSIONS_PATH, match.name) : null;
}

function loadDisplayName(modelId: string): string {
  if (!existsSync(ROUTING_PATH)) return modelId;

  const providers = readdirSync(ROUTING_PATH, { withFileTypes: true }).filter(
    (d) => d.isDirectory(),
  );

  for (const provider of providers) {
    const modelsDir = join(ROUTING_PATH, provider.name, 'models');
    if (!existsSync(modelsDir)) continue;

    const models = readdirSync(modelsDir, { withFileTypes: true }).filter((d) =>
      d.isDirectory(),
    );

    for (const model of models) {
      const metadataPath = join(modelsDir, model.name, 'metadata.json');
      if (!existsSync(metadataPath)) continue;
      try {
        const metadata = JSON.parse(
          readFileSync(metadataPath, 'utf-8'),
        ) as ModelMetadata;
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
  const haiku = claudeEnv['ANTHROPIC_DEFAULT_HAIKU_MODEL'] ?? '';
  const sonnet = claudeEnv['ANTHROPIC_DEFAULT_SONNET_MODEL'] ?? '';
  const opus = claudeEnv['ANTHROPIC_DEFAULT_OPUS_MODEL'] ?? '';

  const modelBase = modelId.split('/').pop() || modelId;

  if (haiku && (modelId.includes(haiku) || modelBase.includes('haiku')))
    return 'lite';
  if (opus && (modelId.includes(opus) || modelBase.includes('opus')))
    return 'reasoning';
  if (sonnet && (modelId.includes(sonnet) || modelBase.includes('sonnet')))
    return 'standard';

  if (
    modelBase.includes('haiku') ||
    modelBase.includes('flash') ||
    modelBase.includes('mini')
  )
    return 'lite';
  if (
    modelBase.includes('opus') ||
    modelBase.includes('pro') ||
    modelBase.includes('reasoning')
  )
    return 'reasoning';
  return 'standard';
}

function createEmptyMetrics(): {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
} {
  const empty: TokenMetrics = {
    inputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    count: 0,
    modelName: '',
  };
  return {
    lite:      { ...empty, modelName: loadDisplayName(claudeEnv['ANTHROPIC_DEFAULT_HAIKU_MODEL']  ?? '') },
    standard:  { ...empty, modelName: loadDisplayName(claudeEnv['ANTHROPIC_DEFAULT_SONNET_MODEL'] ?? '') },
    reasoning: { ...empty, modelName: loadDisplayName(claudeEnv['ANTHROPIC_DEFAULT_OPUS_MODEL']   ?? '') },
  };
}

function aggregateInteractionMetrics(sessionPath: string): {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
} {
  const metrics = createEmptyMetrics();

  const metricsPath = join(sessionPath, 'session-metrics.json');
  if (!existsSync(metricsPath)) return metrics;

  try {
    const data = JSON.parse(readFileSync(metricsPath, 'utf-8')) as SessionMetrics;

    for (const [modelId, m] of Object.entries(data.models)) {
      const level = classifyModel(modelId);
      const levelMetrics = metrics[level];

      levelMetrics.modelName = loadDisplayName(modelId);
      levelMetrics.count += m.count;
      levelMetrics.inputTokens += m.inputTokens;
      levelMetrics.cacheReadInputTokens += m.cacheReadInputTokens;
      levelMetrics.outputTokens += m.outputTokens;
    }
  } catch {
    // session-metrics.json corrupto — retornar métricas vacías
  }

  return metrics;
}

function cellColor(
  level: 'lite' | 'standard' | 'reasoning',
  field: keyof LevelMetricsSnapshot,
  current: number,
  previous: MetricsSnapshot | null,
): string {
  if (!previous) return C.dim;
  const prev = previous[level]?.[field];
  if (prev === undefined || current !== prev) return C.value;
  return C.dim;
}

function totalColor(
  field: keyof LevelMetricsSnapshot,
  values: Record<string, number>,
  previous: MetricsSnapshot | null,
): string {
  if (!previous) return C.dim;
  for (const level of ['lite', 'standard', 'reasoning'] as const) {
    const prev = previous[level]?.[field];
    if (prev === undefined || values[level] !== prev) return C.total;
  }
  return C.dim;
}

// ── Renderizado de tablas completas ─────────────────────────────

function renderSessionTable(
  ctx: ClaudeCodeContext,
  sessionPath?: string | null,
): {
  lines: string[];
  width: number;
} {
  const provider = resolveActiveProvider();
  const sessionId = ctx.session_id || 'N/A';
  const contextSize = ctx.context_window?.context_window_size;
  const usedPct = ctx.context_window?.used_percentage;

  const contextDisplay = formatContextSize(contextSize);

  // Capitalizar nombre del proveedor
  const providerDisplay =
    provider.providerName.charAt(0).toUpperCase() +
    provider.providerName.slice(1);

  // Obtener displayName del modelo activo
  const rawModelName = ctx.model?.display_name || 'N/A';
  const modelName = loadDisplayName(rawModelName);

  // Porcentaje de uso: persistir valor válido, usar caché como fallback
  let pct: number;
  if (typeof usedPct === 'number' && Number.isFinite(usedPct) && usedPct > 0) {
    pct = usedPct;
    if (sessionPath) writeCachedPct(sessionPath, pct);
  } else {
    const cached = sessionPath ? readCachedPct(sessionPath) : null;
    pct = (typeof cached === 'number' && Number.isFinite(cached) && cached >= 0) ? cached : 0;
  }
  const pctDisplay = `${pct.toFixed(0)}%`;
  // Barra (8 chars) + espacio + porcentaje, con espacio inicial para centrado visual
  const barDisplay = ` ${renderBar(pct, 8)} ${pctDisplay}`;

  const sessionDisplay =
    sessionId.length > 36 ? sessionId.slice(0, 33) + '...' : sessionId;

  // Definir datos de la tabla
  const headers = [
    'Proveedor',
    'Modelo activo',
    'Ventana de contexto',
    'Porcentaje de uso',
  ];
  const rows = [
    [
      `${C.provider}${providerDisplay}${C.reset}`,
      `${C.model}${modelName}${C.reset}`,
      `${C.value}${contextDisplay}${C.reset}`,
      barDisplay,
    ],
  ];

  // Renderizar tabla y obtener ancho
  const { table, width } = renderTable(headers, rows, [
    'center',
    'center',
    'center',
    'center',
  ]);

  // Calcular padding para que el título tenga el mismo ancho que la tabla
  const titleText = `╭─ Sesión actual «${sessionDisplay}» `;
  const titleVisLen = visibleLength(titleText);
  const titlePad = Math.max(0, width - titleVisLen - 1); // -1 para ╮ (╭ ya está en titleVisLen)
  const title = `${C.title}${titleText}${'─'.repeat(titlePad)}╮${C.reset}`;

  const lines = [title, ...table.split('\n')];
  return { lines, width };
}

function renderTokenTable(metrics: {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
}, previous: MetricsSnapshot | null): { lines: string[]; width: number } {
  // Función local para alinear a la derecha
  function alignRight(text: string, width: number): string {
    const vis = visibleLength(text);
    const pad = Math.max(0, width - vis);
    return ' '.repeat(pad) + text;
  }

  const levels: Array<{
    key: keyof typeof metrics;
    label: string;
    color: string;
  }> = [
    { key: 'lite',      label: 'Lite',      color: C.value },
    { key: 'standard',  label: 'Standard',  color: C.value },
    { key: 'reasoning', label: 'Reasoning', color: C.value },
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

    const cc = (field: keyof LevelMetricsSnapshot, value: number) =>
      cellColor(level.key, field, value, previous);

    rows.push([
      `${level.color}${level.label}${C.reset}`,
      `${level.color}${m.modelName || '-'}${C.reset}`,
      `${cc('count', m.count)}${m.count}${C.reset}`,
      `${cc('inputTokens', m.inputTokens)}${formatTokens(m.inputTokens)}${C.reset}`,
      `${cc('cacheReadInputTokens', m.cacheReadInputTokens)}${formatTokens(m.cacheReadInputTokens)}${C.reset}`,
      `${cc('outputTokens', m.outputTokens)}${formatTokens(m.outputTokens)}${C.reset}`,
    ]);
  }

  // Definir datos de la tabla (sin fila de total)
  const headers = [
    'Nivel',
    'Modelo',
    '# Interacciones',
    'Input (tks)',
    'Cache In (tks)',
    'Output (tks)',
  ];
  const alignments: Array<'left' | 'center' | 'right'> = [
    'left',
    'left',
    'right',
    'right',
    'right',
    'right',
  ];

  // Renderizar tabla sin fila de total
  const { table, width, columnWidths } = renderTable(
    headers,
    rows,
    alignments,
    [0, 1, 2],
  );

  // Renderizar fila de total manualmente con celdas fusionadas
  const w0 = columnWidths[0];
  const w1 = columnWidths[1];
  const w2 = columnWidths[2];
  const w3 = columnWidths[3];
  const w4 = columnWidths[4];
  const w5 = columnWidths[5];

  const totalText = `${C.total}Totales de sesión${C.reset}`;
  // Para que los │ de las columnas 3-6 estén alineados con las filas anteriores:
  // mergedContentWidth = w0 + w1 + 3 produce │ en posiciones coincidentes
  const mergedContentWidth = w0 + w1 + 3;
  const totalMerged = padRight(totalText, mergedContentWidth);

  const totals = {
    lite: metrics.lite.count,
    standard: metrics.standard.count,
    reasoning: metrics.reasoning.count,
  };
  const tcCount = totalColor('count', totals, previous);
  const tcInput = totalColor('inputTokens', { lite: metrics.lite.inputTokens, standard: metrics.standard.inputTokens, reasoning: metrics.reasoning.inputTokens }, previous);
  const tcCache = totalColor('cacheReadInputTokens', { lite: metrics.lite.cacheReadInputTokens, standard: metrics.standard.cacheReadInputTokens, reasoning: metrics.reasoning.cacheReadInputTokens }, previous);
  const tcOutput = totalColor('outputTokens', { lite: metrics.lite.outputTokens, standard: metrics.standard.outputTokens, reasoning: metrics.reasoning.outputTokens }, previous);

  const totalRow = `${C.border}${B.v}${C.reset} ${totalMerged} ${C.border}${B.v}${C.reset} ${alignRight(`${tcCount}${totalCount}${C.reset}`, w2)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcInput}${formatTokens(totalInput)}${C.reset}`, w3)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcCache}${formatTokens(totalCache)}${C.reset}`, w4)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcOutput}${formatTokens(totalOutput)}${C.reset}`, w5)} ${C.border}${B.v}${C.reset}`;

  // Borde inferior de la tabla con columna fusionada
  // w0+2 (col0) + 1 (┴) + w1+2 (col1) = w0+w1+5
  const mergedBorderWidth = w0 + w1 + 5;
  const mergedBorder = B.h.repeat(mergedBorderWidth);
  const botParts = [
    mergedBorder,
    B.h.repeat(w2 + 2),
    B.h.repeat(w3 + 2),
    B.h.repeat(w4 + 2),
    B.h.repeat(w5 + 2),
  ];
  const botLine = `${C.border}${B.bl}${botParts.join(B.mb)}${B.br}${C.reset}`;

  // Calcular padding para que el título tenga el mismo ancho que la tabla
  const titleText = '╭─ Interacciones por nivel de razonamiento ';
  const titleVisLen = visibleLength(titleText);
  const titlePad = Math.max(0, width - titleVisLen - 1); // -1 para ╮ (╭ ya está en titleVisLen)
  const title = `${C.title}${titleText}${'─'.repeat(titlePad)}╮${C.reset}`;

  // Eliminar el borde inferior generado por renderTable
  const tableLines = table.split('\n');
  tableLines.pop(); // Eliminar última línea (borde inferior)

  // Cambiar el primer ┼ del separador anterior por ┴ (la columna fusionada termina ahí)
  const lastSepIdx = tableLines.length - 1;
  const lastSep = tableLines[lastSepIdx];
  const firstMmIdx = lastSep.indexOf(B.mm);
  if (firstMmIdx !== -1) {
    tableLines[lastSepIdx] =
      lastSep.substring(0, firstMmIdx) +
      B.mb +
      lastSep.substring(firstMmIdx + 1);
  }

  const lines = [title, ...tableLines, totalRow, botLine];
  return { lines, width };
}

function renderRateLimitTable(ctx: ClaudeCodeContext): { lines: string[]; width: number } | null {
  const { five_hour, seven_day } = ctx.rate_limits ?? {};
  if (!five_hour && !seven_day) return null;

  const rows: string[][] = [];

  if (five_hour) {
    const pct = five_hour.used_percentage ?? 0;
    rows.push([
      `${C.label}Cuota actual (5h)${C.reset}`,
      `${renderBar(pct)} ${pct.toFixed(0)}%`,
      `${C.dim}Reinicio en${C.reset}`,
      `${C.value}${formatTimeRemaining(five_hour.resets_at)}${C.reset}`,
    ]);
  }

  if (seven_day) {
    const pct = seven_day.used_percentage ?? 0;
    rows.push([
      `${C.label}Cuota semanal (7d)${C.reset}`,
      `${renderBar(pct)} ${pct.toFixed(0)}%`,
      `${C.dim}Reinicio en${C.reset}`,
      `${C.value}${formatTimeRemaining(seven_day.resets_at)}${C.reset}`,
    ]);
  }

  // Renderizar tabla y obtener ancho
  const { table, width } = renderTable(
    ['', '', '', ''],
    rows,
    ['left', 'left', 'left', 'right'],
    [0],
    true,
  );

  // Calcular padding para que el título tenga el mismo ancho que la tabla
  const titleText = '╭─ Límites de uso por suscripción ';
  const titleVisLen = visibleLength(titleText);
  const titlePad = Math.max(0, width - titleVisLen - 1); // -1 para ╮ (╭ ya está en titleVisLen)
  const title = `${C.title}${titleText}${'─'.repeat(titlePad)}╮${C.reset}`;

  const lines = [title, '', ...table.split('\n')];
  return { lines, width };
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

    // Resolver sesión antes de renderizar para caché per-session
    const sessionPath = resolveSessionPath(ctx.session_id);

    // Tabla 1: Sesión y proveedor
    const table1 = renderSessionTable(ctx, sessionPath);

    // Tabla 2: Métricas de interacciones
    let table2: { lines: string[]; width: number };
    if (sessionPath) {
      const metrics = aggregateInteractionMetrics(sessionPath);
      const previous = readLastMetrics(sessionPath);
      table2 = renderTokenTable(metrics, previous);
      writeLastMetrics(sessionPath, {
        lite:      { count: metrics.lite.count,      inputTokens: metrics.lite.inputTokens,      cacheReadInputTokens: metrics.lite.cacheReadInputTokens,      outputTokens: metrics.lite.outputTokens },
        standard:  { count: metrics.standard.count,  inputTokens: metrics.standard.inputTokens,  cacheReadInputTokens: metrics.standard.cacheReadInputTokens,  outputTokens: metrics.standard.outputTokens },
        reasoning: { count: metrics.reasoning.count,  inputTokens: metrics.reasoning.inputTokens, cacheReadInputTokens: metrics.reasoning.cacheReadInputTokens, outputTokens: metrics.reasoning.outputTokens },
      });
    } else {
      table2 = renderTokenTable(createEmptyMetrics(), null);
    }

    // Tabla 3: Rate limits (solo OAuth)
    const authMethod = resolveAuthMethod();
    const table3 = authMethod === 'oauth' ? renderRateLimitTable(ctx) : null;

    if (table3) {
      // Layout: [Tabla1 + Tabla3] a la izquierda | Tabla2 a la derecha
      const leftWidth = Math.max(table1.width, table3.width);
      const left = {
        lines: [...table1.lines, '', ...table3.lines],
        width: leftWidth,
      };
      // Padding dinámico: igualar alturas para evitar interleaving
      const heightDiff = left.lines.length - table2.lines.length;
      const paddedTable2 = heightDiff > 0
        ? { lines: [...table2.lines, ...Array(heightDiff).fill('')], width: table2.width }
        : table2;
      output.push(renderSideBySide(left, paddedTable2, 2));
    } else if (ctx.session_id || sessionPath) {
      output.push(renderSideBySide(table1, table2, 2));
    } else {
      output.push(table1.lines.join('\n'));
    }

    console.log(output.join('\n'));
  });
}

main();
