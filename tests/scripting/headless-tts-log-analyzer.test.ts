import { describe, it, expect } from 'vitest';
import {
  analyzeLogEntries,
  extractTtsFallbacks,
  filterActionableTtsFallbacks,
  formatFallbackErrors,
  hasAnyTtsHttpFailure,
  hasSilentTtsFallback,
  inferMessageType,
  isExpectedSessionStartFallback,
  parseJsonlLines,
} from '../../scripting/headless-tts-gateway-test/log-analyzer.js';
import {
  FALLBACK_SPEECH,
  STOP_FALLBACK_TEXT,
} from '../../scripting/headless-tts-gateway-test/fallback-speech.js';

function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe('parseJsonlLines', () => {
  it('ignora líneas vacías y corruptas', () => {
    const content = ['', '{bad}', line({ reqId: 'a' })].join('\n');
    expect(parseJsonlLines(content)).toHaveLength(1);
  });
});

describe('isExpectedSessionStartFallback', () => {
  it('acepta UserPromptSubmit sin mensajes previos', () => {
    const fallback = {
      eventName: 'UserPromptSubmit',
      reason: 'no-messages',
      fallbackText: FALLBACK_SPEECH.UserPromptSubmit,
    };
    expect(isExpectedSessionStartFallback(fallback)).toBe(true);
    expect(hasSilentTtsFallback([fallback])).toBe(false);
    expect(inferMessageType(200, [fallback])).toBe('dynamic');
  });

  it('acepta UserPromptSubmit sin token al inicio (OAuth aún no capturado)', () => {
    const fallback = {
      eventName: 'UserPromptSubmit',
      reason: 'no-token',
      fallbackText: FALLBACK_SPEECH.UserPromptSubmit,
    };
    expect(isExpectedSessionStartFallback(fallback)).toBe(true);
    expect(hasSilentTtsFallback([fallback])).toBe(false);
  });

  it('no excluye fallback en Stop', () => {
    const fallback = {
      eventName: 'Stop',
      reason: 'empty-response',
      fallbackText: STOP_FALLBACK_TEXT,
    };
    expect(isExpectedSessionStartFallback(fallback)).toBe(false);
    expect(filterActionableTtsFallbacks([fallback])).toHaveLength(1);
  });
});

describe('extractTtsFallbacks', () => {
  it('detecta fallback silencioso Stop en logs', () => {
    const entries = parseJsonlLines(
      line({
        tag: '[TTS-FALLBACK]',
        eventName: 'Stop',
        usedFallback: true,
        reason: 'no-messages',
        fallbackText: STOP_FALLBACK_TEXT,
        msg: '[TTS] Mensaje genérico de fallback (audio y toast)',
      }),
    );

    const fallbacks = extractTtsFallbacks(entries);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]?.eventName).toBe('Stop');
    expect(fallbacks[0]?.reason).toBe('no-messages');
    expect(hasSilentTtsFallback(fallbacks)).toBe(true);
  });
});

describe('analyzeLogEntries', () => {
  it('correlaciona sesión principal (beta=true) con status 200', () => {
    const mainId = 'main-req-1';
    const entries = parseJsonlLines(
      [
        line({
          reqId: mainId,
          req: { method: 'POST', url: '/v1/messages?beta=true' },
          msg: 'incoming request',
        }),
        line({
          reqId: mainId,
          res: { statusCode: 200 },
          msg: 'request completed',
        }),
      ].join('\n'),
    );

    const result = analyzeLogEntries(entries);
    expect(result.mainSessionStatus).toBe(200);
    expect(result.ttsStatus).toBeNull();
    expect(result.has402).toBe(false);
    expect(result.stopUsedFallback).toBe(false);
  });

  it('correlaciona TTS Stop (/v1/messages sin beta) con status 200', () => {
    const ttsId = 'tts-req-1';
    const entries = parseJsonlLines(
      [
        line({
          reqId: ttsId,
          req: { method: 'POST', url: '/v1/messages' },
          msg: 'incoming request',
        }),
        line({
          reqId: ttsId,
          res: { statusCode: 200 },
          msg: 'request completed',
        }),
      ].join('\n'),
    );

    const result = analyzeLogEntries(entries);
    expect(result.ttsStatus).toBe(200);
    expect(result.mainSessionStatus).toBeNull();
  });

  it('marca stopUsedFallback aunque HTTP sea 200', () => {
    const ttsId = 'tts-silent';
    const entries = parseJsonlLines(
      [
        line({
          reqId: ttsId,
          req: { method: 'POST', url: '/v1/messages' },
          msg: 'incoming request',
        }),
        line({
          reqId: ttsId,
          res: { statusCode: 200 },
          msg: 'request completed',
        }),
        line({
          tag: '[TTS-FALLBACK]',
          eventName: 'Stop',
          usedFallback: true,
          reason: 'empty-response',
          fallbackText: STOP_FALLBACK_TEXT,
        }),
      ].join('\n'),
    );

    const result = analyzeLogEntries(entries);
    expect(result.ttsStatus).toBe(200);
    expect(result.stopUsedFallback).toBe(true);
    expect(inferMessageType(result.ttsStatus, result.ttsFallbacks)).toBe('fallback');
  });

  it('detecta 402 en llamada TTS', () => {
    const ttsId = 'tts-req-402';
    const entries = parseJsonlLines(
      [
        line({
          reqId: ttsId,
          req: { method: 'POST', url: '/v1/messages' },
          msg: 'incoming request',
        }),
        line({
          reqId: ttsId,
          res: { statusCode: 402 },
          msg: 'request completed',
        }),
      ].join('\n'),
    );

    const result = analyzeLogEntries(entries);
    expect(result.ttsStatus).toBe(402);
    expect(result.has402).toBe(true);
    expect(hasAnyTtsHttpFailure(result.ttsStatuses)).toBe(true);
  });

  it('acumula múltiples llamadas TTS en orden', () => {
    const entries = parseJsonlLines(
      [
        line({
          reqId: 'tts-1',
          req: { method: 'POST', url: '/v1/messages' },
          msg: 'incoming request',
        }),
        line({ reqId: 'tts-1', res: { statusCode: 402 }, msg: 'request completed' }),
        line({
          reqId: 'tts-2',
          req: { method: 'POST', url: '/v1/messages' },
          msg: 'incoming request',
        }),
        line({ reqId: 'tts-2', res: { statusCode: 200 }, msg: 'request completed' }),
      ].join('\n'),
    );

    const result = analyzeLogEntries(entries);
    expect(result.ttsStatuses).toEqual([402, 200]);
    expect(result.ttsStatus).toBe(200);
    expect(hasAnyTtsHttpFailure(result.ttsStatuses)).toBe(true);
  });
});

describe('inferMessageType', () => {
  it('prioriza fallback silencioso sobre HTTP 200', () => {
    const fallbacks = extractTtsFallbacks(
      parseJsonlLines(
        line({
          tag: '[TTS-FALLBACK]',
          eventName: 'Stop',
          usedFallback: true,
          reason: 'no-token',
          fallbackText: STOP_FALLBACK_TEXT,
        }),
      ),
    );
    expect(inferMessageType(200, fallbacks)).toBe('fallback');
  });

  it('devuelve dynamic sin fallbacks y con 200', () => {
    expect(inferMessageType(200, [])).toBe('dynamic');
  });

  it('devuelve unknown sin llamada TTS', () => {
    expect(inferMessageType(null, [])).toBe('unknown');
  });
});

describe('formatFallbackErrors', () => {
  it('describe el evento y la razón', () => {
    const msgs = formatFallbackErrors([
      {
        eventName: 'Stop',
        reason: 'http-402',
        fallbackText: STOP_FALLBACK_TEXT,
      },
    ]);
    expect(msgs[0]).toContain('Stop');
    expect(msgs[0]).toContain('http-402');
    expect(msgs[0]).toContain(STOP_FALLBACK_TEXT);
  });

  it('omite UserPromptSubmit esperado al inicio de sesión', () => {
    const msgs = formatFallbackErrors([
      {
        eventName: 'UserPromptSubmit',
        reason: 'no-messages',
        fallbackText: FALLBACK_SPEECH.UserPromptSubmit,
      },
      {
        eventName: 'Stop',
        reason: 'empty-response',
        fallbackText: STOP_FALLBACK_TEXT,
      },
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('Stop');
  });
});
