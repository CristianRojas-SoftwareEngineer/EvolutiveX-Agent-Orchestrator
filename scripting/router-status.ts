/**
 * Statusline de Claude Code para Smart Code Proxy.
 *
 * Renderiza 2-3 tablas Unicode con bordes redondeados y anchos calculados:
 *  - Tabla 1: Sesión y proveedor activo
 *  - Tabla 2: Métricas de steps por nivel de razonamiento
 *  - Tabla 3: Cuota de suscripción vía resolveQuotaSource (OAuth stdin o archivo en disco)
 *
 * Lee stdin como JSON con el contexto de Claude Code ($ctx).
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readClaudeSettings,
  SMART_CODE_PROXY_ROOT_KEY,
  STATUSLINE_ROUTER_DETAILS_KEY,
  type ClaudeSettings,
} from './shared/claude-settings.js';
import { readSubscriptionQuotaFromProviderDir } from './shared/provider-config.js';

// ── Tipos ───────────────────────────────────────────────────────

export interface ClaudeCodeContext {
  session_id?: string;
  model?: {
    display_name?: string;
  };
  context_window?: {
    context_window_size?: number;
    used_percentage?: number;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null };
    seven_day?: { used_percentage?: number | null; resets_at?: number | null };
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

/** Entrada por modelo en session-metrics.json (schema canónico). */
interface SessionModelMetricsEntry {
  billable_hops: number;
  finalized_runs: number;
  input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
}

interface SessionMetricsFile {
  models: Record<string, SessionModelMetricsEntry>;
  session_totals?: {
    billable_hops: number;
    finalized_runs: number;
    input_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    output_tokens: number;
  };
}

interface TokenMetrics {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  billableHops: number;
  finalizedRuns: number;
  modelName: string;
}

export interface SessionTotalsSnapshot {
  billableHops: number;
  finalizedRuns: number;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

export interface AggregatedSessionMetrics {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
  sessionTotals: SessionTotalsSnapshot;
}

// ── Rutas resueltas (cwd o inyectables en tests) ─────────────────

export interface StatuslineBuildOptions {
  sessionsRoot?: string;
  projectRoot?: string;
}

/** Bloque `env` de `~/.claude/settings.json` (escrito por configure-provider / install-statusline). */
export type ClaudeSettingsEnv = Record<string, string>;

interface ResolvedStatuslinePaths {
  projectRoot: string;
  routingPath: string;
  sessionsPath: string;
  envPath: string;
}

/**
 * Resuelve la raíz del repositorio del proxy desde settings o cwd.
 * Si `SMART_CODE_PROXY_ROOT` no apunta a un repo válido (`routing/providers`), usa cwd.
 */
export function resolveProjectRoot(settingsEnv: ClaudeSettingsEnv, cwd?: string): string {
  const fallback = resolve(cwd ?? process.cwd());
  const fromSettings = settingsEnv[SMART_CODE_PROXY_ROOT_KEY]?.trim();
  if (!fromSettings) return fallback;
  const candidate = resolve(fromSettings);
  if (existsSync(join(candidate, 'routing', 'providers'))) return candidate;
  return fallback;
}

function resolveStatuslinePaths(
  options: StatuslineBuildOptions | undefined,
  settingsEnv: ClaudeSettingsEnv,
): ResolvedStatuslinePaths {
  const projectRoot = options?.projectRoot
    ? resolve(options.projectRoot)
    : resolveProjectRoot(settingsEnv);
  return {
    projectRoot,
    routingPath: join(projectRoot, 'routing', 'providers'),
    sessionsPath: options?.sessionsRoot ?? join(projectRoot, 'sessions'),
    envPath: join(projectRoot, 'configs', '.env'),
  };
}

/** Normaliza contadores de session-metrics.json (§10: null → 0). */
export function coerceMetricNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

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

/** Trunca texto plano (sin ANSI) a maxLen caracteres visibles, terminando en '...' si se corta */
function truncate(text: string, maxLen: number): string {
  if (visibleLength(text) <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
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

/** Tiempo de reinicio para Tabla 3: inválido → "-", expirado → "Ahora". */
function formatQuotaResetTime(resetEpoch?: number | null): string {
  if (resetEpoch == null || !Number.isFinite(resetEpoch) || resetEpoch <= 0) return '-';
  return formatTimeRemaining(resetEpoch);
}

function formatQuotaUsedCell(usedPercentage?: number | null): string {
  if (
    usedPercentage == null ||
    !Number.isFinite(usedPercentage) ||
    usedPercentage < 0 ||
    usedPercentage > 100
  ) {
    return `${C.value}-${C.reset}`;
  }
  return `${renderBar(usedPercentage, 8)} ${usedPercentage.toFixed(0)}%`;
}

// ── Renderizado de tablas con bordes ────────────────────────────

/**
 * Renderiza una tabla con bordes Unicode redondeados.
 * @param headers - Array de labels de columnas (texto plano)
 * @param rows - Array de filas, cada una array de celdas (texto con colores ANSI)
 * @param alignments - Alineación por columna: 'left' | 'center' | 'right'
 * @returns Objeto con el string de la tabla y su ancho total visible
 */
// Calcular anchos máximos por columna (basado en contenido visible)
// Excluir celdas fusionadas (celda seguida de celda vacía)
function computeColumnWidths(headers: string[], rows: string[][]): number[] {
  const colCount = headers.length;
  const widths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    let maxW = visibleLength(headers[i]);
    for (const row of rows) {
      if (i < row.length && row[i] !== '' && row[i] !== undefined) {
        const isMerged = i + 1 < colCount && (row[i + 1] === '' || row[i + 1] === undefined);
        if (!isMerged) {
          maxW = Math.max(maxW, visibleLength(row[i]));
        }
      }
    }
    widths[i] = maxW;
  }
  return widths;
}

function renderTable(
  headers: string[],
  rows: string[][],
  alignments: ('left' | 'center' | 'right')[] = [],
  separatorAfter?: number[],
  noHeader?: boolean,
  minWidth?: number,
  expandColumnIndex?: number,
): { table: string; width: number; columnWidths: number[] } {
  const colCount = headers.length;
  if (alignments.length === 0) {
    alignments = headers.map(() => 'left');
  }

  const widths = computeColumnWidths(headers, rows);

  // Ancho total: anchos de columnas + padding por columna + bordes + separadores
  let totalWidth = widths.reduce((sum, w) => sum + w, 0) + widths.length * 3 + 1;

  // Si minWidth es mayor que el ancho natural, expandir la columna designada (por defecto la última)
  if (minWidth !== undefined && totalWidth < minWidth) {
    const expandIdx = expandColumnIndex ?? widths.length - 1;
    widths[expandIdx] += minWidth - totalWidth;
    totalWidth = minWidth;
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

  if (!noHeader) {
    // Header: │ Header │ Header │
    const headerCells = headers.map((h, i) => {
      const colored = `${C.label}${h}${C.reset}`;
      const aligned =
        alignments[i] === 'right' ? alignRight(colored, widths[i]) : padCenter(colored, widths[i]);
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
      for (let j = i + 1; j < colCount && (row[j] === '' || row[j] === undefined); j++) {
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
      const nextIsEmpty = i + 1 < colCount && (row[i + 1] === '' || row[i + 1] === undefined);
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
    result.push(`${left.lines[i]}${leftPad}${' '.repeat(gap)}${right.lines[i]}`);
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

// ── Caché del statusline (por sesión) ───────────────────────────

interface LevelMetricsSnapshot {
  billableHops: number;
  finalizedRuns: number;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

interface MetricsSnapshot {
  lite: LevelMetricsSnapshot;
  standard: LevelMetricsSnapshot;
  reasoning: LevelMetricsSnapshot;
}

interface StatuslineCache {
  contextUsagePercentage?: number;
  metricsSnapshot?: MetricsSnapshot;
  lastRenderedMtimeMs?: number;
  lastRenderedMetricsSize?: number;
  lastRenderedTable2Output?: string;
}

/** Lee `refreshInterval` de settings (no de env). Retorna `null` si ausente o inválido. */
export function readRefreshIntervalFromSettings(settings: ClaudeSettings): number | null {
  const value = settings.statusLine?.refreshInterval;
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function readSessionMetricsMtime(sessionPath: string): { mtimeMs: number; size: number } | null {
  const metricsFile = join(sessionPath, 'session-metrics.json');
  if (!existsSync(metricsFile)) return null;
  const stat = statSync(metricsFile);
  return { mtimeMs: stat.mtimeMs, size: stat.size };
}

function canUseTable2EarlyExit(
  cache: StatuslineCache,
  mtimeInfo: { mtimeMs: number; size: number } | null,
): boolean {
  if (!cache.lastRenderedTable2Output) return false;
  if (mtimeInfo === null) {
    return cache.lastRenderedMtimeMs === 0;
  }
  return (
    cache.lastRenderedMtimeMs === mtimeInfo.mtimeMs &&
    cache.lastRenderedMetricsSize === mtimeInfo.size
  );
}

function readStatuslineCache(sessionPath: string): StatuslineCache {
  try {
    const cacheFile = join(sessionPath, '.statusline-state.json');
    if (!existsSync(cacheFile)) return {};
    return JSON.parse(readFileSync(cacheFile, 'utf-8')) as StatuslineCache;
  } catch {
    return {};
  }
}

function writeStatuslineCache(sessionPath: string, cache: StatuslineCache): void {
  try {
    const cacheFile = join(sessionPath, '.statusline-state.json');
    // Leer actual para hacer merge si es necesario
    const current = readStatuslineCache(sessionPath);
    const updated = { ...current, ...cache };
    writeFileSync(cacheFile, JSON.stringify(updated), 'utf-8');
  } catch {
    // Ignorar errores de escritura
  }
}

// ── Lógica de resolución ────────────────────────────────────────

export type ReasoningLevel = 'lite' | 'standard' | 'reasoning';

function readClaudeSettingsEnv(): ClaudeSettingsEnv {
  return readClaudeSettings().env ?? {};
}

/**
 * Resuelve el método de auth desde `settings.json → env`.
 * No usa `process.env`; la fuente canónica es el bloque escrito por configure-provider.
 */
export function resolveAuthMethodFromEnv(
  settingsEnv: ClaudeSettingsEnv,
): 'api_key' | 'bearer' | 'oauth' {
  const apiKey = settingsEnv['ANTHROPIC_API_KEY'];
  const authToken = settingsEnv['ANTHROPIC_AUTH_TOKEN'];

  if (apiKey && apiKey.trim() !== '') return 'api_key';
  if (authToken && authToken.trim() !== '') return 'bearer';
  return 'oauth';
}

function readDotEnv(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(envPath)) return result;
  const content = readFileSync(envPath, 'utf-8');
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

function resolveActiveProvider(paths: ResolvedStatuslinePaths): {
  providerName: string;
  upstreamOrigin: string;
} {
  const envVars = readDotEnv(paths.envPath);
  const upstreamOrigin = envVars['UPSTREAM_ORIGIN'] || '';

  if (!upstreamOrigin) {
    return { providerName: 'Desconocido', upstreamOrigin: '' };
  }

  if (!existsSync(paths.routingPath)) {
    return { providerName: 'Desconocido', upstreamOrigin };
  }

  const providers = readdirSync(paths.routingPath, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && existsSync(join(paths.routingPath, d.name, 'config.json')),
  );

  for (const provider of providers) {
    try {
      const configPath = join(paths.routingPath, provider.name, 'config.json');
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

function resolveSessionPath(sessionId: string | undefined, sessionsPath: string): string | null {
  if (!existsSync(sessionsPath)) return null;

  const sessions = readdirSync(sessionsPath, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );

  if (sessions.length === 0) return null;
  if (!sessionId) return null;

  const match = sessions.find((s) => s.name.startsWith(sessionId));
  return match ? join(sessionsPath, match.name) : null;
}

function loadDisplayName(modelId: string, routingPath: string): string {
  if (!existsSync(routingPath)) return modelId;

  const providers = readdirSync(routingPath, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );

  for (const provider of providers) {
    const modelsDir = join(routingPath, provider.name, 'models');
    if (!existsSync(modelsDir)) continue;

    const models = readdirSync(modelsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const model of models) {
      const metadataPath = join(modelsDir, model.name, 'metadata.json');
      if (!existsSync(metadataPath)) continue;
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ModelMetadata;
        if (modelId.includes(metadata.modelId)) {
          return metadata.displayName || modelId;
        }
      } catch {
        // Ignorar metadata corrupta
      }
    }
  }

  return modelId;
}

/**
 * Clasifica un modelId según §5 de la propuesta (solo variables ANTHROPIC_DEFAULT_*).
 * Orden: haiku → opus → sonnet. Sin coincidencia → null (no suma a ningún nivel).
 */
export function classifyModelWithEnv(
  modelId: string,
  settingsEnv: ClaudeSettingsEnv,
): ReasoningLevel | null {
  const haiku = settingsEnv['ANTHROPIC_DEFAULT_HAIKU_MODEL'] ?? '';
  const opus = settingsEnv['ANTHROPIC_DEFAULT_OPUS_MODEL'] ?? '';
  const sonnet = settingsEnv['ANTHROPIC_DEFAULT_SONNET_MODEL'] ?? '';

  if (haiku && modelId.includes(haiku)) return 'lite';
  if (opus && modelId.includes(opus)) return 'reasoning';
  if (sonnet && modelId.includes(sonnet)) return 'standard';

  // Fallback heurístico por nivel: cada nivel sin variable configurada clasifica
  // por keyword, aunque otros niveles sí tengan variable (configuración parcial).
  if (!haiku && modelId.includes('haiku')) return 'lite';
  if (!opus && modelId.includes('opus')) return 'reasoning';
  if (!sonnet && modelId.includes('sonnet')) return 'standard';

  return null;
}

function createEmptyMetrics(
  settingsEnv: ClaudeSettingsEnv,
  routingPath: string,
): {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
} {
  const empty: TokenMetrics = {
    inputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    billableHops: 0,
    finalizedRuns: 0,
    modelName: '',
  };
  const haiku = settingsEnv['ANTHROPIC_DEFAULT_HAIKU_MODEL'];
  const sonnet = settingsEnv['ANTHROPIC_DEFAULT_SONNET_MODEL'];
  const opus = settingsEnv['ANTHROPIC_DEFAULT_OPUS_MODEL'];
  return {
    lite: {
      ...empty,
      modelName: haiku ? loadDisplayName(haiku, routingPath) : 'Haiku',
    },
    standard: {
      ...empty,
      modelName: sonnet ? loadDisplayName(sonnet, routingPath) : 'Sonnet',
    },
    reasoning: {
      ...empty,
      modelName: opus ? loadDisplayName(opus, routingPath) : 'Opus',
    },
  };
}

function isCanonicalSessionMetrics(data: SessionMetricsFile): boolean {
  for (const m of Object.values(data.models ?? {})) {
    if (m != null && typeof m === 'object' && 'billable_hops' in m) return true;
  }
  return data.session_totals != null && 'billable_hops' in data.session_totals;
}

function emptySessionTotals(): SessionTotalsSnapshot {
  return {
    billableHops: 0,
    finalizedRuns: 0,
    inputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
  };
}

export function aggregateSessionMetrics(
  sessionPath: string,
  settingsEnv: ClaudeSettingsEnv,
  routingPath: string,
): AggregatedSessionMetrics {
  const metrics = createEmptyMetrics(settingsEnv, routingPath);
  const sessionTotals = emptySessionTotals();

  const metricsPath = join(sessionPath, 'session-metrics.json');
  if (!existsSync(metricsPath)) {
    return { ...metrics, sessionTotals };
  }

  try {
    const data = JSON.parse(readFileSync(metricsPath, 'utf-8')) as SessionMetricsFile;
    if (!isCanonicalSessionMetrics(data)) {
      return { ...metrics, sessionTotals };
    }

    for (const [modelId, entry] of Object.entries(data.models ?? {})) {
      const level = classifyModelWithEnv(modelId, settingsEnv);
      if (!level) continue;
      const levelMetrics = metrics[level];

      levelMetrics.modelName = loadDisplayName(modelId, routingPath);
      levelMetrics.billableHops += coerceMetricNumber(entry.billable_hops);
      levelMetrics.finalizedRuns += coerceMetricNumber(entry.finalized_runs);
      levelMetrics.inputTokens += coerceMetricNumber(entry.input_tokens);
      levelMetrics.cacheCreationInputTokens += coerceMetricNumber(entry.cache_creation_input_tokens);
      levelMetrics.cacheReadInputTokens += coerceMetricNumber(entry.cache_read_input_tokens);
      levelMetrics.outputTokens += coerceMetricNumber(entry.output_tokens);
    }

    // El total de runs se deriva de la suma de los niveles renderizados para que la
    // fila de totales de la tabla sea internamente consistente con las filas por nivel.
    sessionTotals.finalizedRuns =
      metrics.lite.finalizedRuns + metrics.standard.finalizedRuns + metrics.reasoning.finalizedRuns;

    const totals = data.session_totals;
    if (totals) {
      sessionTotals.billableHops = coerceMetricNumber(totals.billable_hops);
      sessionTotals.inputTokens = coerceMetricNumber(totals.input_tokens);
      sessionTotals.cacheCreationInputTokens = coerceMetricNumber(
        totals.cache_creation_input_tokens,
      );
      sessionTotals.cacheReadInputTokens = coerceMetricNumber(totals.cache_read_input_tokens);
      sessionTotals.outputTokens = coerceMetricNumber(totals.output_tokens);
    }
  } catch {
    // session-metrics.json corrupto — retornar métricas vacías
  }

  return { ...metrics, sessionTotals };
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

function buildSessionTableData(
  ctx: ClaudeCodeContext,
  paths: ResolvedStatuslinePaths,
  sessionPath?: string | null,
) {
  const provider = resolveActiveProvider(paths);
  const sessionId = ctx.session_id || 'N/A';
  const contextSize = ctx.context_window?.context_window_size;
  const contextUsedPercentage = ctx.context_window?.used_percentage;

  const contextDisplay = formatContextSize(contextSize);

  const providerDisplay =
    provider.providerName.charAt(0).toUpperCase() + provider.providerName.slice(1);

  const rawModelName = ctx.model?.display_name || 'N/A';
  const modelName = loadDisplayName(rawModelName, paths.routingPath);

  let usagePercentage: number;
  if (
    typeof contextUsedPercentage === 'number' &&
    Number.isFinite(contextUsedPercentage) &&
    contextUsedPercentage > 0
  ) {
    usagePercentage = contextUsedPercentage;
    if (sessionPath) writeStatuslineCache(sessionPath, { contextUsagePercentage: usagePercentage });
  } else {
    const cache = sessionPath ? readStatuslineCache(sessionPath) : {};
    const cached = cache.contextUsagePercentage;
    usagePercentage =
      typeof cached === 'number' && Number.isFinite(cached) && cached >= 0 ? cached : 0;
  }
  const percentageDisplay = `${usagePercentage.toFixed(0)}%`;
  const barDisplay = ` ${renderBar(usagePercentage, 8)} ${percentageDisplay}`;

  const sessionDisplay = sessionId.length > 36 ? sessionId.slice(0, 33) + '...' : sessionId;

  const headers = ['Proveedor', 'Modelo activo', 'Contexto (tks)', 'Porcentaje de uso'];
  const rows = [
    [
      `${C.provider}${providerDisplay}${C.reset}`,
      `${C.model}${modelName}${C.reset}`,
      `${C.value}${contextDisplay}${C.reset}`,
      barDisplay,
    ],
  ];
  const alignments: Array<'left' | 'center' | 'right'> = ['center', 'center', 'center', 'center'];

  return { headers, rows, alignments, sessionDisplay };
}

function renderSessionTable(
  ctx: ClaudeCodeContext,
  paths: ResolvedStatuslinePaths,
  sessionPath?: string | null,
  targetWidth?: number,
): {
  lines: string[];
  width: number;
} {
  const { headers, rows, alignments, sessionDisplay } = buildSessionTableData(
    ctx,
    paths,
    sessionPath,
  );

  const { table, width } = renderTable(
    headers,
    rows,
    alignments,
    undefined,
    undefined,
    targetWidth,
  );

  const titleText = `╭─ Sesión actual «${sessionDisplay}» `;
  const titleVisLen = visibleLength(titleText);
  const titlePad = Math.max(0, width - titleVisLen - 1);
  const title = `${C.title}${titleText}${'─'.repeat(titlePad)}╮${C.reset}`;

  const lines = [title, ...table.split('\n')];
  return { lines, width };
}

/**
 * Ancho de referencia determinista para Tabla 3 (rate limits).
 * Se usa cuando Tabla 3 no se renderiza (api_key/bearer/OAuth sin cuotas) para mantener
 * el ancho de Tabla 2 estable entre escenarios.
 */
function computeRateLimitReferenceWidth(): number {
  const maxRows: string[][] = [
    [
      `${C.label}Cuota actual (5h)${C.reset}`,
      `${renderBar(100, 8)} 100%`,
      `${C.dim}Reinicio en${C.reset}`,
      `${C.value}23h 59m${C.reset}`,
    ],
    [
      `${C.label}Cuota semanal (7d)${C.reset}`,
      `${renderBar(100, 8)} 100%`,
      `${C.dim}Reinicio en${C.reset}`,
      `${C.value}23h 59m${C.reset}`,
    ],
  ];
  const maxHeaders = ['', '', '', ''];
  const refWidths = computeColumnWidths(maxHeaders, maxRows);
  return refWidths.reduce((sum, w) => sum + w, 0) + refWidths.length * 3 + 1;
}

function renderTokenTable(
  metrics: AggregatedSessionMetrics,
  previous: MetricsSnapshot | null,
  targetWidth?: number,
  liveIndicator: { seconds: number } | null = null,
): { lines: string[]; width: number } {
  // Función local para alinear a la derecha
  function alignRight(text: string, width: number): string {
    const vis = visibleLength(text);
    const pad = Math.max(0, width - vis);
    return ' '.repeat(pad) + text;
  }

  type LevelKey = 'lite' | 'standard' | 'reasoning';
  const levels: Array<{
    key: LevelKey;
    label: string;
    color: string;
  }> = [
    { key: 'lite', label: 'Lite', color: C.lite },
    { key: 'standard', label: 'Standard', color: C.standard },
    { key: 'reasoning', label: 'Reasoning', color: C.reasoning },
  ];

  const { sessionTotals } = metrics;
  const totalInput = sessionTotals.inputTokens;
  const totalCacheCreation = sessionTotals.cacheCreationInputTokens;
  const totalCacheRead = sessionTotals.cacheReadInputTokens;
  const totalOutput = sessionTotals.outputTokens;
  const totalBillableHops = sessionTotals.billableHops;
  const totalFinalizedRuns = sessionTotals.finalizedRuns;

  // Primera pasada: medir anchos naturales de columnas no-Modelo
  let w0nat = visibleLength('Nivel');
  let w2nat = visibleLength('# Workflows');
  let w3nat = visibleLength('# Steps');
  let w4nat = visibleLength('Input (tks)');
  let w5nat = visibleLength('Caché Write (tks)');
  let w6nat = visibleLength('Caché Read (tks)');
  let w7nat = visibleLength('Output (tks)');

  for (const level of levels) {
    const m: TokenMetrics = metrics[level.key];

    w0nat = Math.max(w0nat, visibleLength(level.label));
    w2nat = Math.max(w2nat, visibleLength(String(m.finalizedRuns)));
    w3nat = Math.max(w3nat, visibleLength(String(m.billableHops)));
    w4nat = Math.max(w4nat, visibleLength(formatTokens(m.inputTokens)));
    w5nat = Math.max(w5nat, visibleLength(formatTokens(m.cacheCreationInputTokens)));
    w6nat = Math.max(w6nat, visibleLength(formatTokens(m.cacheReadInputTokens)));
    w7nat = Math.max(w7nat, visibleLength(formatTokens(m.outputTokens)));
  }
  // Incluir totales estructurales en el cálculo de anchos de columnas numéricas
  w2nat = Math.max(w2nat, visibleLength(String(totalFinalizedRuns)));
  w3nat = Math.max(w3nat, visibleLength(String(totalBillableHops)));
  w4nat = Math.max(w4nat, visibleLength(formatTokens(totalInput)));
  w5nat = Math.max(w5nat, visibleLength(formatTokens(totalCacheCreation)));
  w6nat = Math.max(w6nat, visibleLength(formatTokens(totalCacheRead)));
  w7nat = Math.max(w7nat, visibleLength(formatTokens(totalOutput)));

  // Ancho objetivo de la columna Modelo (índice 1), elástica para ajustar al targetWidth
  // 25 = 8 columnas × 3 (espacio+│+espacio) + 1 (borde izquierdo)
  const headerModelWidth = visibleLength('Modelo');
  let w1Max: number | undefined;
  if (targetWidth !== undefined) {
    const sumOtherCols = w0nat + w2nat + w3nat + w4nat + w5nat + w6nat + w7nat;
    let w1Target = targetWidth - 25 - sumOtherCols;
    // Piso: "Totales de sesión" (17 chars) requiere w0 + w1 + 3 >= 17 → w1 >= 14 - w0
    w1Target = Math.max(w1Target, 14 - w0nat, headerModelWidth);
    w1Max = w1Target;
  }

  // Segunda pasada: construir filas con nombres de modelo truncados si aplica
  const rows: string[][] = [];

  for (const level of levels) {
    const levelKey: LevelKey = level.key;
    const m: TokenMetrics = metrics[levelKey];
    const cc = (field: keyof LevelMetricsSnapshot, value: number) =>
      cellColor(levelKey, field, value, previous);

    const rawName = m.modelName || '-';
    const modelName = w1Max !== undefined ? truncate(rawName, w1Max) : rawName;

    rows.push([
      `${level.color}${level.label}${C.reset}`,
      `${level.color}${modelName}${C.reset}`,
      `${cc('finalizedRuns', m.finalizedRuns)}${m.finalizedRuns}${C.reset}`,
      `${cc('billableHops', m.billableHops)}${m.billableHops}${C.reset}`,
      `${cc('inputTokens', m.inputTokens)}${formatTokens(m.inputTokens)}${C.reset}`,
      `${cc('cacheCreationInputTokens', m.cacheCreationInputTokens)}${formatTokens(m.cacheCreationInputTokens)}${C.reset}`,
      `${cc('cacheReadInputTokens', m.cacheReadInputTokens)}${formatTokens(m.cacheReadInputTokens)}${C.reset}`,
      `${cc('outputTokens', m.outputTokens)}${formatTokens(m.outputTokens)}${C.reset}`,
    ]);
  }

  // Definir datos de la tabla (sin fila de total)
  const headers = [
    'Nivel',
    'Modelo',
    '# Workflows',
    '# Steps',
    'Input (tks)',
    'Caché Write (tks)',
    'Caché Read (tks)',
    'Output (tks)',
  ];
  const alignments: Array<'left' | 'center' | 'right'> = [
    'left',
    'left',
    'right',
    'right',
    'right',
    'right',
    'right',
    'right',
  ];

  // Renderizar tabla sin fila de total; columna Modelo (índice 1) es la columna elástica
  const { table, width, columnWidths } = renderTable(
    headers,
    rows,
    alignments,
    [0, 1, 2],
    undefined,
    targetWidth,
    1,
  );

  // Renderizar fila de total manualmente con celdas fusionadas
  const w0 = columnWidths[0];
  const w1 = columnWidths[1];
  const w2 = columnWidths[2];
  const w3 = columnWidths[3];
  const w4 = columnWidths[4];
  const w5 = columnWidths[5];
  const w6 = columnWidths[6];
  const w7 = columnWidths[7];

  const totalText = `${C.total}Totales de sesión${C.reset}`;
  // Para que los │ de las columnas 3-7 estén alineados con las filas anteriores:
  // mergedContentWidth = w0 + w1 + 3 produce │ en posiciones coincidentes
  const mergedContentWidth = w0 + w1 + 3;
  const totalMerged = padRight(totalText, mergedContentWidth);

  const tcWorkflows = totalColor(
    'finalizedRuns',
    {
      lite: metrics.lite.finalizedRuns,
      standard: metrics.standard.finalizedRuns,
      reasoning: metrics.reasoning.finalizedRuns,
    },
    previous,
  );
  const hopTotals = {
    lite: metrics.lite.billableHops,
    standard: metrics.standard.billableHops,
    reasoning: metrics.reasoning.billableHops,
  };
  const tcCount = totalColor('billableHops', hopTotals, previous);
  const tcInput = totalColor(
    'inputTokens',
    {
      lite: metrics.lite.inputTokens,
      standard: metrics.standard.inputTokens,
      reasoning: metrics.reasoning.inputTokens,
    },
    previous,
  );
  const tcCacheCreation = totalColor(
    'cacheCreationInputTokens',
    {
      lite: metrics.lite.cacheCreationInputTokens,
      standard: metrics.standard.cacheCreationInputTokens,
      reasoning: metrics.reasoning.cacheCreationInputTokens,
    },
    previous,
  );
  const tcCacheRead = totalColor(
    'cacheReadInputTokens',
    {
      lite: metrics.lite.cacheReadInputTokens,
      standard: metrics.standard.cacheReadInputTokens,
      reasoning: metrics.reasoning.cacheReadInputTokens,
    },
    previous,
  );
  const tcOutput = totalColor(
    'outputTokens',
    {
      lite: metrics.lite.outputTokens,
      standard: metrics.standard.outputTokens,
      reasoning: metrics.reasoning.outputTokens,
    },
    previous,
  );

  const totalRow = `${C.border}${B.v}${C.reset} ${totalMerged} ${C.border}${B.v}${C.reset} ${alignRight(`${tcWorkflows}${totalFinalizedRuns}${C.reset}`, w2)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcCount}${totalBillableHops}${C.reset}`, w3)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcInput}${formatTokens(totalInput)}${C.reset}`, w4)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcCacheCreation}${formatTokens(totalCacheCreation)}${C.reset}`, w5)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcCacheRead}${formatTokens(totalCacheRead)}${C.reset}`, w6)} ${C.border}${B.v}${C.reset} ${alignRight(`${tcOutput}${formatTokens(totalOutput)}${C.reset}`, w7)} ${C.border}${B.v}${C.reset}`;

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
    B.h.repeat(w6 + 2),
    B.h.repeat(w7 + 2),
  ];
  const botLine = `${C.border}${B.bl}${botParts.join(B.mb)}${B.br}${C.reset}`;

  // Calcular padding para que el título tenga el mismo ancho que la tabla
  const titlePrefix = '╭─ Trabajo por niveles de razonamiento ';
  const liveSuffix = liveIndicator
    ? ` ${C.dim}● live (${liveIndicator.seconds}s)${C.reset}`
    : '';
  const liveVisLen = liveIndicator ? visibleLength(`● live (${liveIndicator.seconds}s)`) : 0;
  const titleVisLen = visibleLength(titlePrefix) + liveVisLen + (liveIndicator ? 1 : 0);
  const titlePad = Math.max(0, width - titleVisLen - 1); // -1 para ╮
  const title = liveIndicator
    ? `${C.title}${titlePrefix}${'─'.repeat(titlePad)}${liveSuffix}╮${C.reset}`
    : `${C.title}${titlePrefix}${'─'.repeat(titlePad)}╮${C.reset}`;

  // Eliminar el borde inferior generado por renderTable
  const tableLines = table.split('\n');
  tableLines.pop(); // Eliminar última línea (borde inferior)

  // Cambiar el primer ┼ del separador anterior por ┴ (la columna fusionada termina ahí)
  const lastSepIdx = tableLines.length - 1;
  const lastSep = tableLines[lastSepIdx];
  const firstMmIdx = lastSep.indexOf(B.mm);
  if (firstMmIdx !== -1) {
    tableLines[lastSepIdx] =
      lastSep.substring(0, firstMmIdx) + B.mb + lastSep.substring(firstMmIdx + 1);
  }

  const lines = [title, ...tableLines, totalRow, botLine];
  return { lines, width };
}

type ResolvedQuotaLimits = NonNullable<ClaudeCodeContext['rate_limits']>;

function readSubscriptionQuotaFromSession(sessionPath: string | null): ResolvedQuotaLimits | null {
  if (!sessionPath) return null;
  const filePath = join(sessionPath, 'subscription-quota.json');
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      five_hour?: { used_percentage?: number | null; resets_at?: number | null };
      seven_day?: { used_percentage?: number | null; resets_at?: number | null };
    };
    if (!data.five_hour && !data.seven_day) return null;
    return { five_hour: data.five_hour, seven_day: data.seven_day };
  } catch {
    return null;
  }
}

/** Resuelve cuota para Tabla 3: stdin OAuth → archivo en disco → null. */
export function resolveQuotaSource(
  ctx: ClaudeCodeContext,
  paths: ResolvedStatuslinePaths,
  settingsEnv: ClaudeSettingsEnv,
  sessionPath: string | null,
): ResolvedQuotaLimits | null {
  const authMethod = resolveAuthMethodFromEnv(settingsEnv);
  const stdinLimits = ctx.rate_limits ?? {};
  if (authMethod === 'oauth' && (stdinLimits.five_hour || stdinLimits.seven_day)) {
    return ctx.rate_limits ?? null;
  }

  const { providerName } = resolveActiveProvider(paths);
  if (providerName === 'Desconocido') return null;

  const quotaConfig = readSubscriptionQuotaFromProviderDir(join(paths.routingPath, providerName));
  if (!quotaConfig?.enabled) return null;

  return readSubscriptionQuotaFromSession(sessionPath);
}

function buildRateLimitTableData(ctx: ClaudeCodeContext) {
  const { five_hour, seven_day } = ctx.rate_limits ?? {};
  if (!five_hour && !seven_day) return null;

  const rows: string[][] = [];

  if (five_hour) {
    rows.push([
      `${C.label}Cuota actual (5h)${C.reset}`,
      formatQuotaUsedCell(five_hour.used_percentage),
      `${C.dim}Reinicio en${C.reset}`,
      `${C.value}${formatQuotaResetTime(five_hour.resets_at)}${C.reset}`,
    ]);
  }

  if (seven_day) {
    rows.push([
      `${C.label}Cuota semanal (7d)${C.reset}`,
      formatQuotaUsedCell(seven_day.used_percentage),
      `${C.dim}Reinicio en${C.reset}`,
      `${C.value}${formatQuotaResetTime(seven_day.resets_at)}${C.reset}`,
    ]);
  }

  const headers = ['', '', '', ''];
  const alignments: Array<'left' | 'center' | 'right'> = ['left', 'left', 'left', 'right'];

  return { headers, rows, alignments };
}

function renderRateLimitTable(
  ctx: ClaudeCodeContext,
  targetWidth?: number,
): { lines: string[]; width: number } | null {
  const data = buildRateLimitTableData(ctx);
  if (!data) return null;

  const { table, width } = renderTable(
    data.headers,
    data.rows,
    data.alignments,
    [0],
    true,
    targetWidth,
  );

  const titleText = '╭─ Límites de uso por suscripción ';
  const titleVisLen = visibleLength(titleText);
  const titlePad = Math.max(0, width - titleVisLen - 1);
  const title = `${C.title}${titleText}${'─'.repeat(titlePad)}╮${C.reset}`;

  const lines = [title, ...table.split('\n')];
  return { lines, width };
}

// ── Pipeline de salida (testeable) ──────────────────────────────

export function buildStatuslineOutput(
  ctx: ClaudeCodeContext,
  settingsEnv: ClaudeSettingsEnv,
  options?: StatuslineBuildOptions,
): string {
  const paths = resolveStatuslinePaths(options, settingsEnv);
  const output: string[] = [];

  const sessionPath = resolveSessionPath(ctx.session_id, paths.sessionsPath);

  const table1 = renderSessionTable(ctx, paths, sessionPath);

  const quotaSource = resolveQuotaSource(ctx, paths, settingsEnv, sessionPath);
  const table3 = quotaSource
    ? renderRateLimitTable({ ...ctx, rate_limits: quotaSource })
    : null;
  const table3Width = table3 ? table3.width : computeRateLimitReferenceWidth();
  const targetWidth = table1.width + table3Width + 2;

  if (table3) {
    output.push(renderSideBySide(table1, table3, 2));
  } else {
    output.push(table1.lines.join('\n'));
  }

  const showRouterDetails =
    settingsEnv[STATUSLINE_ROUTER_DETAILS_KEY]?.trim().toLowerCase() === 'on';

  if (showRouterDetails) {
    const claudeSettings = readClaudeSettings();
    const refreshSec = readRefreshIntervalFromSettings(claudeSettings);
    const liveIndicator = refreshSec !== null ? { seconds: refreshSec } : null;

    if (sessionPath) {
      const cache = readStatuslineCache(sessionPath);
      const mtimeInfo = readSessionMetricsMtime(sessionPath);

      if (canUseTable2EarlyExit(cache, mtimeInfo)) {
        output.push(cache.lastRenderedTable2Output!.replace(/\n$/, ''));
      } else {
        const metrics = aggregateSessionMetrics(sessionPath, settingsEnv, paths.routingPath);
        const previous = cache.metricsSnapshot || null;
        const table2 = renderTokenTable(metrics, previous, targetWidth, liveIndicator);
        const table2Text = table2.lines.join('\n') + '\n';
        writeStatuslineCache(sessionPath, {
          metricsSnapshot: {
            lite: {
              billableHops: metrics.lite.billableHops,
              finalizedRuns: metrics.lite.finalizedRuns,
              inputTokens: metrics.lite.inputTokens,
              cacheCreationInputTokens: metrics.lite.cacheCreationInputTokens,
              cacheReadInputTokens: metrics.lite.cacheReadInputTokens,
              outputTokens: metrics.lite.outputTokens,
            },
            standard: {
              billableHops: metrics.standard.billableHops,
              finalizedRuns: metrics.standard.finalizedRuns,
              inputTokens: metrics.standard.inputTokens,
              cacheCreationInputTokens: metrics.standard.cacheCreationInputTokens,
              cacheReadInputTokens: metrics.standard.cacheReadInputTokens,
              outputTokens: metrics.standard.outputTokens,
            },
            reasoning: {
              billableHops: metrics.reasoning.billableHops,
              finalizedRuns: metrics.reasoning.finalizedRuns,
              inputTokens: metrics.reasoning.inputTokens,
              cacheCreationInputTokens: metrics.reasoning.cacheCreationInputTokens,
              cacheReadInputTokens: metrics.reasoning.cacheReadInputTokens,
              outputTokens: metrics.reasoning.outputTokens,
            },
          },
          lastRenderedMtimeMs: mtimeInfo?.mtimeMs ?? 0,
          lastRenderedMetricsSize: mtimeInfo?.size ?? 0,
          lastRenderedTable2Output: table2Text,
        });
        output.push(table2.lines.join('\n'));
      }
    } else {
      const table2 = renderTokenTable(
        { ...createEmptyMetrics(settingsEnv, paths.routingPath), sessionTotals: emptySessionTotals() },
        null,
        targetWidth,
        liveIndicator,
      );
      output.push(table2.lines.join('\n'));
    }
  }

  return output.join('\n');
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

    const settingsEnv = readClaudeSettingsEnv();
    console.log(buildStatuslineOutput(ctx, settingsEnv));
  });
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
