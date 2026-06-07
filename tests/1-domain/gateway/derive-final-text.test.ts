import { describe, it, expect } from 'vitest';
import { deriveFinalText } from '../../../src/1-domain/services/gateway/derive-final-text.js';
import type { ClaudeHookEvent } from '../../../src/1-domain/types/hook.types.js';

describe('deriveFinalText', () => {
  it('retorna el texto cuando lastAssistantMessage está presente', () => {
    const hook: ClaudeHookEvent = {
      eventName: 'Stop',
      sessionId: 's',
      lastAssistantMessage: 'Hola mundo',
    };
    expect(deriveFinalText(hook)).toBe('Hola mundo');
  });

  it('retorna undefined cuando lastAssistantMessage está ausente', () => {
    const hook: ClaudeHookEvent = { eventName: 'Stop', sessionId: 's' };
    expect(deriveFinalText(hook)).toBeUndefined();
  });

  it('retorna undefined cuando lastAssistantMessage es string vacío', () => {
    const hook: ClaudeHookEvent = { eventName: 'Stop', sessionId: 's', lastAssistantMessage: '' };
    expect(deriveFinalText(hook)).toBeUndefined();
  });

  it('retorna undefined cuando lastAssistantMessage es solo espacios', () => {
    const hook: ClaudeHookEvent = {
      eventName: 'Stop',
      sessionId: 's',
      lastAssistantMessage: '   ',
    };
    expect(deriveFinalText(hook)).toBeUndefined();
  });

  it('preserva el texto sin modificar (passthrough)', () => {
    const text = 'Texto con\nsaltos de línea y  espacios';
    const hook: ClaudeHookEvent = {
      eventName: 'SubagentStop',
      sessionId: 's',
      lastAssistantMessage: text,
    };
    expect(deriveFinalText(hook)).toBe(text);
  });
});
