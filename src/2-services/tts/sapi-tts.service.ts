import { spawn } from 'node:child_process';
import type { ITTSService } from '../../1-domain/ports/ITTSService.js';

// Implementación Windows-only via System.Speech.Synthesis (SAPI).
// Gap multiplataforma documentado en design.md — pendiente análisis en iteración futura.
export class SapiTTSService implements ITTSService {
  constructor(private readonly voiceName: string = 'Microsoft Sabina Desktop') {}

  async initialize(): Promise<void> {
    // SAPI no requiere inicialización asíncrona
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    void this.synthesize(text).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[SAPI TTS] Error en síntesis: ${msg}\n`);
    });
  }

  private synthesize(text: string): Promise<void> {
    return new Promise((resolve) => {
      const escaped = text.replace(/'/g, "''");
      const psCmd = [
        `Add-Type -AssemblyName System.Speech`,
        `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
        `$s.SelectVoice('${this.voiceName}')`,
        `$s.SetOutputToDefaultAudioDevice()`,
        `$s.Speak('${escaped}')`,
      ].join('; ');

      const child = spawn('powershell', ['-NonInteractive', '-NoProfile', '-Command', psCmd], {
        stdio: 'ignore',
      });
      child.unref();
      resolve();
    });
  }
}
