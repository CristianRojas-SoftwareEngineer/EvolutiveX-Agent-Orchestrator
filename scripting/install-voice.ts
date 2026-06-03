import { type ClaudeSettings } from './shared/claude-settings.js';

export interface VoiceInstallOptions {
  mode: 'hold' | 'tap';
  autoSubmit: boolean;
}

export function applyVoiceInstall(
  settings: ClaudeSettings,
  opts: VoiceInstallOptions,
): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  (next as Record<string, unknown>)['voiceEnabled'] = true;
  (next as Record<string, unknown>)['voice'] = {
    enabled: true,
    mode: opts.mode,
    autoSubmit: opts.autoSubmit,
  };
  return next;
}

export function applyVoiceUninstall(settings: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  delete (next as Record<string, unknown>)['voiceEnabled'];
  delete (next as Record<string, unknown>)['voice'];
  return next;
}
