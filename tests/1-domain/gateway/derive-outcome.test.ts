import { describe, it, expect } from 'vitest';
import { deriveOutcome } from '../../../src/1-domain/services/gateway/derive-outcome.js';
import type { ClaudeHookEvent } from '../../../src/1-domain/types/hook.types.js';

function makeHook(eventName: string): ClaudeHookEvent {
  return { eventName, sessionId: 'sess' };
}

describe('deriveOutcome', () => {
  it('retorna success para Stop', () => {
    expect(deriveOutcome(makeHook('Stop'))).toBe('success');
  });

  it('retorna success para SubagentStop', () => {
    expect(deriveOutcome(makeHook('SubagentStop'))).toBe('success');
  });

  it('retorna api_error para StopFailure', () => {
    expect(deriveOutcome(makeHook('StopFailure'))).toBe('api_error');
  });

  it('retorna unknown para PreToolUse', () => {
    expect(deriveOutcome(makeHook('PreToolUse'))).toBe('unknown');
  });

  it('retorna unknown para PostToolUse', () => {
    expect(deriveOutcome(makeHook('PostToolUse'))).toBe('unknown');
  });

  it('retorna unknown para eventName vacío', () => {
    expect(deriveOutcome(makeHook(''))).toBe('unknown');
  });

  it('retorna unknown para evento desconocido arbitrario', () => {
    expect(deriveOutcome(makeHook('UserPromptSubmit'))).toBe('unknown');
  });
});
