import { spawn } from 'node:child_process';

const DEFAULT_VOICE = 'Microsoft Sabina Desktop';

/** Nombres hablables de proveedores para anuncios locales. */
export const PROVIDER_SPEECH_NAMES: Record<string, string> = {
  ollama: 'Ollama',
  minimax: 'MiniMax',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  default: 'Anthropic OAuth por defecto',
  opencode: 'OpenCode',
  xiaomi: 'Xiaomi',
};

export function providerSpeechName(provider: string): string {
  return PROVIDER_SPEECH_NAMES[provider] ?? provider;
}

/**
 * Sintetiza texto por voz localmente (SAPI en Windows) y espera a que termine.
 * En otros SO solo imprime el mensaje (no-op audible).
 */
export async function speakLocal(text: string, voiceName = DEFAULT_VOICE): Promise<void> {
  if (!text.trim()) return;

  if (process.platform !== 'win32') {
    console.log(`[anuncio] ${text}`);
    return;
  }

  return new Promise((resolve, reject) => {
    const escaped = text.replace(/'/g, "''");
    const psCmd = [
      `Add-Type -AssemblyName System.Speech`,
      `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer`,
      `$s.SelectVoice('${voiceName}')`,
      `$s.SetOutputToDefaultAudioDevice()`,
      `$s.Speak('${escaped}')`,
    ].join('; ');

    const child = spawn('powershell', ['-NonInteractive', '-NoProfile', '-Command', psCmd], {
      stdio: 'ignore',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Anuncio de voz terminó con código ${code}`));
    });
  });
}

export async function announceProviderStart(provider: string): Promise<void> {
  const name = providerSpeechName(provider);
  await speakLocal(`Iniciando prueba del proveedor ${name}`);
}

export async function announceProviderEnd(
  provider: string,
  ttsWorked: boolean,
): Promise<void> {
  const name = providerSpeechName(provider);
  const outcome = ttsWorked ? 'exitosa' : 'fallida';
  await speakLocal(`Prueba del proveedor ${name} finalizada. Síntesis de voz ${outcome}`);
}
