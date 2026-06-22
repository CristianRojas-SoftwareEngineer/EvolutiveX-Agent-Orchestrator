import { spawn } from 'node:child_process';
import type { ITTSService } from '../../1-domain/ports/ITTSService.js';
import { normalizeSpeechText } from '../../1-domain/services/tts/normalize-speech-text.js';

// Implementación Windows-only via System.Speech.Synthesis (SAPI).
// Gap multiplataforma documentado en design.md — pendiente análisis en iteración futura.
export class SapiTTSService implements ITTSService {
  constructor(private readonly voiceName: string = 'Microsoft Sabina Desktop') {}

  async initialize(): Promise<void> {
    // SAPI no requiere inicialización asíncrona
  }

  async speak(text: string): Promise<void> {
    // Saneamiento determinista: elimina markdown/símbolos que SAPI verbalizaría.
    const clean = normalizeSpeechText(text);
    if (!clean.trim()) return;
    try {
      await this.synthesize(clean);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[SAPI TTS] Error en síntesis: ${msg}\n`);
    }
  }

  private synthesize(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
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

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`SAPI TTS terminó con código ${code}`));
        }
      });
    });
  }
}
