import { describe, it, expect } from 'vitest';
import {
  EVENT_NOTIFICATION_PROFILES,
  NOTIFICATION_EVENT_KEYS,
  getProfileForEvent,
} from '../../../src/2-services/notifications/event-notification-profile.js';

describe('event-notification-profile', () => {
  it('define exactamente 11 claves de evento', () => {
    expect(NOTIFICATION_EVENT_KEYS).toHaveLength(11);
    expect(NOTIFICATION_EVENT_KEYS.sort()).toEqual(
      [
        'PermissionRequest',
        'PreToolUse',
        'SessionEnd',
        'SessionStart',
        'Stop',
        'StopFailure',
        'SubagentStart',
        'SubagentStop',
        'TaskCompleted',
        'TaskCreated',
        'UserPromptSubmit',
      ].sort(),
    );
  });

  it('StopFailure usa LoopingAlarm7 en win32 (paridad legacy)', () => {
    const profile = getProfileForEvent('StopFailure');
    expect(profile?.sound.win32).toBe('LoopingAlarm7');
    expect(profile?.sound.darwin).toBe('Basso');
    expect(profile?.sound.linux).toBe(true);
  });

  it('PreToolUse usa SMS en win32 (paridad legacy AskUserQuestion)', () => {
    expect(getProfileForEvent('PreToolUse')?.sound.win32).toBe('SMS');
  });

  it('todos los perfiles tienen linux: true', () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      expect(EVENT_NOTIFICATION_PROFILES[key]?.sound.linux).toBe(true);
    }
  });

  it('PostToolUse sin toast devuelve undefined', () => {
    expect(getProfileForEvent('PostToolUse')).toBeUndefined();
  });

  it('Stop incluye message del catálogo', () => {
    expect(getProfileForEvent('Stop')?.message).toMatch(/terminó/i);
  });

  it('StopFailure incluye copy estático de fallback', () => {
    expect(getProfileForEvent('StopFailure')?.message).toMatch(/Error de API/);
  });

  it('SessionStart incluye mensaje de sesión iniciada', () => {
    expect(getProfileForEvent('SessionStart')?.message).toBe('Sesión iniciada');
  });
});
