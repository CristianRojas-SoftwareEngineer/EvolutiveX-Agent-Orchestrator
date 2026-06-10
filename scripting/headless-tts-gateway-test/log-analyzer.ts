import { openSync, readSync, closeSync, existsSync, statSync } from 'node:fs';
import { FALLBACK_SPEECH, STOP_FALLBACK_TEXT } from './fallback-speech.js';
import type { LogAnalysisResult, TtsFallbackEvent } from './types.js';

/** Razones de fallback aceptables en UserPromptSubmit al inicio (sin historial ni token aún). */
const EXPECTED_USER_PROMPT_SUBMIT_REASONS = new Set(['no-messages', 'no-token']);

interface LogEntry {
  reqId?: string;
  req?: { method?: string; url?: string };
  res?: { statusCode?: number };
  msg?: string;
  tag?: string;
  eventName?: string;
  usedFallback?: boolean;
  reason?: string;
  fallbackText?: string;
}

/** Lee bytes nuevos desde un offset sin cargar el archivo completo. */
export function readLogBytesFromOffset(logPath: string, byteOffset: number): string {
  if (!existsSync(logPath)) return '';
  const fd = openSync(logPath, 'r');
  try {
    const fileSize = statSync(logPath).size;
    if (byteOffset >= fileSize) return '';
    const length = fileSize - byteOffset;
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, byteOffset);
    return buffer.toString('utf-8');
  } finally {
    closeSync(fd);
  }
}

/** Parsea líneas JSONL y devuelve entradas válidas. */
export function parseJsonlLines(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as LogEntry);
    } catch {
      // Ignorar líneas corruptas
    }
  }
  return entries;
}

function isMainSessionRequest(url: string | undefined): boolean {
  return url === '/v1/messages?beta=true' || (url?.startsWith('/v1/messages') === true && url.includes('beta=true'));
}

function isTtsRequest(url: string | undefined): boolean {
  if (!url) return false;
  if (!url.startsWith('/v1/messages')) return false;
  return !url.includes('beta=true');
}

/**
 * Correlaciona reqId de peticiones entrantes con statusCode de "request completed".
 * - mainSession: POST /v1/messages?beta=true
 * - tts: POST /v1/messages sin beta
 */
export function analyzeLogEntries(entries: LogEntry[]): LogAnalysisResult {
  const requestKind = new Map<string, 'main' | 'tts'>();

  for (const entry of entries) {
    const url = entry.req?.url;
    const reqId = entry.reqId;
    if (!reqId || !url) continue;
    if (isMainSessionRequest(url)) {
      requestKind.set(reqId, 'main');
    } else if (isTtsRequest(url)) {
      requestKind.set(reqId, 'tts');
    }
  }

  let mainSessionStatus: number | null = null;
  let ttsStatus: number | null = null;
  const ttsStatuses: number[] = [];
  let has402 = false;

  for (const entry of entries) {
    if (entry.msg !== 'request completed') continue;
    const reqId = entry.reqId;
    const statusCode = entry.res?.statusCode;
    if (!reqId || statusCode === undefined) continue;

    if (statusCode === 402) has402 = true;

    const kind = requestKind.get(reqId);
    if (kind === 'main') {
      mainSessionStatus = statusCode;
    } else if (kind === 'tts') {
      ttsStatuses.push(statusCode);
      ttsStatus = statusCode;
    }
  }

  const ttsFallbacks = extractTtsFallbacks(entries);
  const stopUsedFallback = ttsFallbacks.some(
    (f) => f.eventName === 'Stop' && f.fallbackText === STOP_FALLBACK_TEXT,
  );

  return { mainSessionStatus, ttsStatus, ttsStatuses, has402, ttsFallbacks, stopUsedFallback };
}

/** Extrae eventos [TTS-FALLBACK] del JSONL del gateway. */
export function extractTtsFallbacks(entries: LogEntry[]): TtsFallbackEvent[] {
  const fallbacks: TtsFallbackEvent[] = [];

  for (const entry of entries) {
    if (entry.tag !== '[TTS-FALLBACK]' && entry.usedFallback !== true) continue;
    if (!entry.eventName || !entry.fallbackText) continue;

    fallbacks.push({
      eventName: entry.eventName,
      reason: entry.reason ?? 'unknown',
      fallbackText: entry.fallbackText,
    });
  }

  return fallbacks;
}

/** Analiza logs nuevos desde un byte offset. */
export function analyzeLogsFromOffset(logPath: string, byteOffset: number): LogAnalysisResult {
  const content = readLogBytesFromOffset(logPath, byteOffset);
  return analyzeLogEntries(parseJsonlLines(content));
}

/**
 * Fallback esperado al enviar el primer prompt: aún no hay mensajes en sesión
 * ni token OAuth capturado (anthropic/default).
 */
export function isExpectedSessionStartFallback(fallback: TtsFallbackEvent): boolean {
  if (fallback.eventName !== 'UserPromptSubmit') return false;
  if (!EXPECTED_USER_PROMPT_SUBMIT_REASONS.has(fallback.reason)) return false;
  const expectedText = FALLBACK_SPEECH.UserPromptSubmit;
  return fallback.fallbackText === expectedText;
}

/** Excluye fallbacks normales de inicio de sesión; el criterio de prueba evalúa el resto. */
export function filterActionableTtsFallbacks(fallbacks: TtsFallbackEvent[]): TtsFallbackEvent[] {
  return fallbacks.filter((f) => !isExpectedSessionStartFallback(f));
}

/** Infiere tipo de mensaje Stop: solo fallbacks accionables cuentan como error. */
export function inferMessageType(
  ttsStatus: number | null,
  ttsFallbacks: TtsFallbackEvent[],
): 'dynamic' | 'fallback' | 'unknown' {
  const actionable = filterActionableTtsFallbacks(ttsFallbacks);
  if (actionable.length > 0) return 'fallback';
  if (ttsStatus === 200) return 'dynamic';
  if (ttsStatus !== null) return 'fallback';
  return 'unknown';
}

/** true si alguna llamada TTS HTTP falló (status distinto de 200). */
export function hasAnyTtsHttpFailure(ttsStatuses: number[]): boolean {
  return ttsStatuses.some((s) => s !== 200);
}

/** true si hubo fallback silencioso que debe fallar la prueba (excluye inicio de sesión). */
export function hasSilentTtsFallback(ttsFallbacks: TtsFallbackEvent[]): boolean {
  return filterActionableTtsFallbacks(ttsFallbacks).length > 0;
}

/** Formatea errores legibles por cada fallback accionable detectado. */
export function formatFallbackErrors(ttsFallbacks: TtsFallbackEvent[]): string[] {
  return filterActionableTtsFallbacks(ttsFallbacks).map(
    (f) =>
      `Fallback silencioso en ${f.eventName}: "${f.fallbackText}" (razón: ${f.reason})`,
  );
}

/** Notas informativas para fallbacks esperados al inicio de sesión. */
export function formatExpectedFallbackNotes(ttsFallbacks: TtsFallbackEvent[]): string[] {
  return ttsFallbacks
    .filter(isExpectedSessionStartFallback)
    .map(
      (f) =>
        `Fallback esperado en ${f.eventName} (sin historial previo): "${f.fallbackText}"`,
    );
}
