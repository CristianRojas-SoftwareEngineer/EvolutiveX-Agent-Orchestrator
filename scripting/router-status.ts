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
  barFilled: '\x1B[37m', // blanco
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

/** Longitud visible de un string (sin contar códigos ANSI) */
const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
function visibleLength(str: string): number {
  return str.replace(ANSI_REGEX, '').length;
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
 * @returns Objeto con el string de la tabla y su ancho total visible
 */
function renderTable(
  headers: string[],
  rows: string[][],
  alignments: ('left' | 'center' | 'right')[] = [],
  separatorAfter?: number[],
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
    // Usar un punto invisible (ZWSP) seguido de espacios para evitar recorte de la terminal
    const zwsp = '​';
    const indent = zwsp + ' '.repeat(left.width + gap);
    for (let i = minLines; i < right.lines.length; i++) {
      result.push(`${indent}${right.lines[i]}`);
    }
  }

  return result.join('\n');
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

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
  const haiku = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '';
  const sonnet = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '';
  const opus = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '';

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

function aggregateInteractionMetrics(sessionPath: string): {
  lite: TokenMetrics;
  standard: TokenMetrics;
  reasoning: TokenMetrics;
} {
  const empty: TokenMetrics = {
    inputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    count: 0,
  };
  const metrics = {
    lite: { ...empty },
    standard: { ...empty },
    reasoning: { ...empty },
  };

  const interactionsPath = join(sessionPath, 'interactions');
  if (!existsSync(interactionsPath)) return metrics;

  const interactions = readdirSync(interactionsPath, {
    withFileTypes: true,
  }).filter((d) => d.isDirectory());

  for (const interaction of interactions) {
    const metaPath = join(interactionsPath, interaction.name, 'meta.json');
    if (!existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(
        readFileSync(metaPath, 'utf-8'),
      ) as InteractionMeta;

      if (
        meta.interactionType !== 'agentic-turn' &&
        meta.interactionType !== 'side-request'
      )
        continue;

      const bodyPath = join(
        interactionsPath,
        interaction.name,
        'request',
        'body.json',
      );
      let modelId = '';
      if (existsSync(bodyPath)) {
        try {
          const body = JSON.parse(
            readFileSync(bodyPath, 'utf-8'),
          ) as InteractionRequest;
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
        levelMetrics.cacheReadInputTokens +=
          meta.totals.cacheReadInputTokens || 0;
        levelMetrics.outputTokens += meta.totals.outputTokens || 0;
      }
    } catch {
      // Ignorar meta.json corrupto
    }
  }

  return metrics;
}

// ── Renderizado de tablas completas ─────────────────────────────

function renderSessionTable(ctx: ClaudeCodeContext): {
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

  // Determinar mostrar del porcentaje de uso
  let barDisplay: string;
  if (usedPct === undefined || usedPct === null) {
    barDisplay = 'N/A';
  } else {
    const pctDisplay = `${usedPct.toFixed(0)}%`;
    // Barra (8 chars) + espacio + porcentaje, con espacio inicial para centrado visual
    barDisplay = ` ${renderBar(usedPct, 8)} ${pctDisplay}`;
  }

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
}): { lines: string[]; width: number } {
  // Función local para alinear a la derecha
  function alignRight(text: string, width: number): string {
    const vis = visibleLength(text);
    const pad = Math.max(0, width - vis);
    return ' '.repeat(pad) + text;
  }

  const levels: Array<{
    key: keyof typeof metrics;
    label: string;
    modelExample: string;
    color: string;
  }> = [
    { key: 'lite', label: 'Lite', modelExample: 'MiMo 2 Omni', color: C.value },
    {
      key: 'standard',
      label: 'Standard',
      modelExample: 'MiMo 2.5',
      color: C.value,
    },
    {
      key: 'reasoning',
      label: 'Reasoning',
      modelExample: 'MiMo 2.5 Pro',
      color: C.value,
    },
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

  const totalRow = `${C.border}${B.v}${C.reset} ${totalMerged} ${C.border}${B.v}${C.reset} ${alignRight(`${C.total}${totalCount}${C.reset}`, w2)} ${C.border}${B.v}${C.reset} ${alignRight(`${C.total}${formatTokens(totalInput)}${C.reset}`, w3)} ${C.border}${B.v}${C.reset} ${alignRight(`${C.total}${formatTokens(totalCache)}${C.reset}`, w4)} ${C.border}${B.v}${C.reset} ${alignRight(`${C.total}${formatTokens(totalOutput)}${C.reset}`, w5)} ${C.border}${B.v}${C.reset}`;

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

  // Renderizar tabla y obtener ancho
  const { table, width } = renderTable(['Cuota', 'Uso', 'Reinicio'], rows, [
    'left',
    'left',
    'center',
  ]);

  // Calcular padding para que el título tenga el mismo ancho que la tabla
  const titleText = '╭─ Rate Limits (OAuth)';
  const titleVisLen = visibleLength(titleText);
  const titlePad = Math.max(0, width - titleVisLen - 1); // -1 para ╮ (╭ ya está en titleVisLen)
  const title = `${C.title}${titleText}${'─'.repeat(titlePad)}╮${C.reset}`;

  return `${title}\n${table}`;
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
    const table1 = renderSessionTable(ctx);

    // Tabla 2: Métricas de interacciones
    const sessionPath = resolveSessionPath(ctx.session_id);
    if (sessionPath) {
      const metrics = aggregateInteractionMetrics(sessionPath);
      const table2 = renderTokenTable(metrics);
      output.push(renderSideBySide(table1, table2, 2));
    } else {
      output.push(table1.lines.join('\n'));
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
