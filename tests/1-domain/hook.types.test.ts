import { describe, it, expect } from 'vitest';
import { parseHookEvent } from '../../src/1-domain/types/hook.types.js';

describe('parseHookEvent', () => {
  it('payload PostToolUse válido → campos mapeados correctamente', () => {
    const payload = {
      hook_event_name: 'PostToolUse',
      session_id: 'session-abc',
      tool_use_id: 'tu-xyz',
      agent_id: 'agent-01',
      stop_hook_active: false,
      background_tasks: 2,
      last_assistant_message: 'hola',
    };

    const event = parseHookEvent(payload);

    expect(event.eventName).toBe('PostToolUse');
    expect(event.sessionId).toBe('session-abc');
    expect(event.toolUseId).toBe('tu-xyz');
    expect(event.agentId).toBe('agent-01');
    expect(event.stopHookActive).toBe(false);
    expect(event.backgroundTasks).toBe(2);
    expect(event.lastAssistantMessage).toBe('hola');
  });

  it('payload sin hook_event_name → no lanza, resultado seguro', () => {
    expect(() => parseHookEvent({})).not.toThrow();
    const event = parseHookEvent({});
    expect(event.eventName).toBe('');
    expect(event.sessionId).toBe('');
  });

  it('payload null → no lanza, resultado seguro', () => {
    expect(() => parseHookEvent(null)).not.toThrow();
    const event = parseHookEvent(null);
    expect(event.eventName).toBe('');
  });

  it('payload primitivo → no lanza, resultado seguro', () => {
    expect(() => parseHookEvent('cadena')).not.toThrow();
    const event = parseHookEvent(42);
    expect(event.eventName).toBe('');
  });
});
