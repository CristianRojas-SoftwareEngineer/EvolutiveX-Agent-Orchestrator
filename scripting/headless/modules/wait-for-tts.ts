import { analyzeLogsFromOffset } from './log-analyzer.js';
import { sleep } from '../session-lib/proxy-lifecycle.js';

const MIN_PLAYBACK_MS = 3000;
const MAX_PLAYBACK_MS = 25000;
const MS_PER_CHAR = 70;

/** Estima duración de reproducción TTS a partir de longitud de texto. */
export function estimatePlaybackMs(charCount: number, perCallFloorMs = MIN_PLAYBACK_MS): number {
  const estimated = charCount * MS_PER_CHAR;
  return Math.min(MAX_PLAYBACK_MS, Math.max(perCallFloorMs, estimated));
}

/**
 * Espera a que las llamadas TTS del gateway aparezcan en logs y luego
 * deja tiempo para que SAPI reproduzca el audio antes de detener el proxy.
 */
export async function waitForGatewayTtsDrain(
  logPath: string,
  logOffset: number,
  options: {
    settleMs: number;
    pollMs: number;
    timeoutMs: number;
    extraDrainMs: number;
    fallbackChars: number;
  },
): Promise<{ ttsCount: number; drainMs: number }> {
  const deadline = Date.now() + options.timeoutMs;
  let lastCount = 0;
  let stableSince = 0;

  while (Date.now() < deadline) {
    const analysis = analyzeLogsFromOffset(logPath, logOffset);
    // Con el provider TTS dedicado (OpenRouter directo), las llamadas TTS no pasan
    // por el proxy, por lo que ttsStatuses siempre está vacío. Se usa la suma de
    // [TTS-SPEECH] y [TTS-FALLBACK] que el handler siempre emite.
    const count = analysis.ttsSpeeches.length + analysis.ttsFallbacks.length;

    if (count > lastCount) {
      lastCount = count;
      stableSince = Date.now();
    } else if (count > 0 && Date.now() - stableSince >= options.settleMs) {
      break;
    }

    await sleep(options.pollMs);
  }

  const finalAnalysis = analyzeLogsFromOffset(logPath, logOffset);
  const ttsCount = finalAnalysis.ttsSpeeches.length + finalAnalysis.ttsFallbacks.length;

  if (ttsCount === 0) {
    await sleep(options.extraDrainMs);
    return { ttsCount: 0, drainMs: options.extraDrainMs };
  }

  // Una locución por cada llamada TTS (UserPromptSubmit + Stop) más margen extra
  const perCallMs = estimatePlaybackMs(options.fallbackChars);
  const drainMs = perCallMs * ttsCount + options.extraDrainMs;

  await sleep(drainMs);

  return { ttsCount, drainMs };
}
