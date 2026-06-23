import { describe, it, expect } from 'vitest';
import {
  applyVoiceInstall,
  applyVoiceUninstall,
} from '../../../../scripting/install/features/voice.js';
import { type ClaudeSettings } from '../../../../scripting/shared/claude-settings.js';

describe('applyVoiceInstall', () => {
  it('instala voiceEnabled y voice con mode hold', () => {
    const result = applyVoiceInstall({}, { mode: 'hold' });
    expect((result as Record<string, unknown>)['voiceEnabled']).toBe(true);
    const voice = (result as Record<string, unknown>)['voice'] as Record<string, unknown>;
    expect(voice['mode']).toBe('hold');
    expect(voice['autoSubmit']).toBe(true);
  });

  it('instala voice con mode tap', () => {
    const result = applyVoiceInstall({}, { mode: 'tap' });
    const voice = (result as Record<string, unknown>)['voice'] as Record<string, unknown>;
    expect(voice['mode']).toBe('tap');
  });

  it('respeta autoSubmit false', () => {
    const result = applyVoiceInstall({}, { mode: 'hold', autoSubmit: false });
    const voice = (result as Record<string, unknown>)['voice'] as Record<string, unknown>;
    expect(voice['autoSubmit']).toBe(false);
  });

  it('no pisa otras claves del settings', () => {
    const settings: ClaudeSettings = {
      statusLine: { command: 'echo test' },
      env: { SOME_KEY: 'value' },
    };
    const result = applyVoiceInstall(settings, { mode: 'hold' });
    expect(result.statusLine?.command).toBe('echo test');
    expect(result.env?.['SOME_KEY']).toBe('value');
  });
});

describe('applyVoiceUninstall', () => {
  it('elimina voiceEnabled y voice', () => {
    const settings: ClaudeSettings = {};
    (settings as Record<string, unknown>)['voiceEnabled'] = true;
    (settings as Record<string, unknown>)['voice'] = { enabled: true, mode: 'hold' };
    const result = applyVoiceUninstall(settings);
    expect((result as Record<string, unknown>)['voiceEnabled']).toBeUndefined();
    expect((result as Record<string, unknown>)['voice']).toBeUndefined();
  });

  it('no toca otras claves al desinstalar', () => {
    const settings: ClaudeSettings = {
      statusLine: { command: 'echo test' },
      env: { SOME_KEY: 'value' },
    };
    (settings as Record<string, unknown>)['voiceEnabled'] = true;
    const result = applyVoiceUninstall(settings);
    expect(result.statusLine?.command).toBe('echo test');
    expect(result.env?.['SOME_KEY']).toBe('value');
  });
});
