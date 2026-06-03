import { describe, it, expect } from 'vitest';
import { applyVoiceInstall, applyVoiceUninstall } from '../../scripting/install-voice.js';

describe('applyVoiceInstall', () => {
  it('modo hold establece voiceEnabled, voice.enabled, voice.mode y voice.autoSubmit', () => {
    const settings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } };
    const next = applyVoiceInstall(settings, { mode: 'hold', autoSubmit: true });
    expect(next['voiceEnabled']).toBe(true);
    expect((next['voice'] as Record<string, unknown>)['enabled']).toBe(true);
    expect((next['voice'] as Record<string, unknown>)['mode']).toBe('hold');
    expect((next['voice'] as Record<string, unknown>)['autoSubmit']).toBe(true);
  });

  it('modo tap establece voice.mode correctamente', () => {
    const next = applyVoiceInstall({}, { mode: 'tap', autoSubmit: true });
    expect((next['voice'] as Record<string, unknown>)['mode']).toBe('tap');
  });

  it('autoSubmit: false se escribe correctamente', () => {
    const next = applyVoiceInstall({}, { mode: 'hold', autoSubmit: false });
    expect((next['voice'] as Record<string, unknown>)['autoSubmit']).toBe(false);
  });

  it('no muta el objeto input', () => {
    const settings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } };
    expect('voiceEnabled' in settings).toBe(false);
    applyVoiceInstall(settings, { mode: 'hold', autoSubmit: true });
    expect('voiceEnabled' in settings).toBe(false);
  });

  it('preserva otras claves del settings', () => {
    const settings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' }, customKey: 'value' };
    const next = applyVoiceInstall(settings, { mode: 'hold', autoSubmit: true });
    expect(next.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8787');
    expect(next['customKey']).toBe('value');
  });
});

describe('applyVoiceUninstall', () => {
  it('elimina voiceEnabled y voice sin tocar otras claves', () => {
    const settings = {
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' },
      voiceEnabled: true,
      voice: { enabled: true, mode: 'hold', autoSubmit: true },
    };
    const next = applyVoiceUninstall(settings as Parameters<typeof applyVoiceUninstall>[0]);
    expect('voiceEnabled' in next).toBe(false);
    expect('voice' in next).toBe(false);
    expect(next.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8787');
  });

  it('settings sin voice retorna equivalente sin error', () => {
    const settings = { env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } };
    const next = applyVoiceUninstall(settings);
    expect('voiceEnabled' in next).toBe(false);
    expect('voice' in next).toBe(false);
    expect(next.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8787');
  });
});
