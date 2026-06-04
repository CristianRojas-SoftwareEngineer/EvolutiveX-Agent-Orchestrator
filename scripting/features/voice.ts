/**
 * Lógica pura de la feature "voice" para el instalador universal.
 * No requiere validación de archivos (S1 no aplica).
 * Solo toca `voiceEnabled` y `voice`; preserva todo lo demás (S4).
 */
import { type ClaudeSettings } from '../shared/claude-settings.js';

export interface VoiceInstallOptions {
  mode: 'hold' | 'tap';
  autoSubmit?: boolean;
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
    autoSubmit: opts.autoSubmit ?? true,
  };
  return next;
}

export function applyVoiceUninstall(settings: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  delete (next as Record<string, unknown>)['voiceEnabled'];
  delete (next as Record<string, unknown>)['voice'];
  return next;
}
