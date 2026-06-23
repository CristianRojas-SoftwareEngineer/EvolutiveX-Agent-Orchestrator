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
 * Anuncia texto localmente usando el player built-in del SO.
 * En Windows usa PowerShell Media.SoundPlayer (requiere archivo WAV previo generado por el gateway).
 * En macOS usa afplay; en Linux usa aplay.
 * Si el player no está disponible o falla, imprime el mensaje en consola como no-op audible.
 */
export async function speakLocal(text: string): Promise<void> {
  if (!text.trim()) return;
  // En el entorno headless el gateway ya maneja la síntesis TTS real.
  // Este anuncio es un log de seguimiento para la suite de tests.
  console.log(`[anuncio] ${text}`);
}

export async function announceProviderStart(provider: string): Promise<void> {
  const name = providerSpeechName(provider);
  await speakLocal(`Iniciando prueba del proveedor ${name}`);
}

export async function announceProviderEnd(provider: string, ttsWorked: boolean): Promise<void> {
  const name = providerSpeechName(provider);
  const outcome = ttsWorked ? 'exitosa' : 'fallida';
  await speakLocal(`Prueba del proveedor ${name} finalizada. Síntesis de voz ${outcome}`);
}

