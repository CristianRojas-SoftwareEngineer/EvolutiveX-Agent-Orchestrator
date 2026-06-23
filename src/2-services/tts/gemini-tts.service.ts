import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ITTSService } from '../../1-domain/ports/ITTSService.js';
import { normalizeSpeechText } from '../../1-domain/services/tts/normalize-speech-text.js';

const GEMINI_TTS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

const SAMPLE_RATE = 24000;
const BIT_DEPTH = 16;
const CHANNELS = 1;
const VOICE_NAME = 'Aoede';

/** Construye un Buffer WAV a partir de PCM 24kHz/16-bit/mono. */
function buildWavBuffer(pcm: Buffer): Buffer {
  const dataSize = pcm.length;
  const byteRate = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8);
  const blockAlign = CHANNELS * (BIT_DEPTH / 8);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BIT_DEPTH, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/** Reproduce un archivo WAV con el player built-in del SO. Lanza si el player falla. */
function playWav(wavPath: string): void {
  const p = process.platform;
  if (p === 'win32') {
    const result = spawnSync('powershell', [
      '-NonInteractive',
      '-NoProfile',
      '-Command',
      `(New-Object Media.SoundPlayer '${wavPath.replace(/'/g, "''")}').PlaySync()`,
    ]);
    if (result.status !== 0 && result.status !== null) {
      throw new Error(`PlaySync terminó con código ${String(result.status)}`);
    }
  } else if (p === 'darwin') {
    const result = spawnSync('afplay', [wavPath]);
    if (result.status !== 0 && result.status !== null) {
      throw new Error(`afplay terminó con código ${String(result.status)}`);
    }
  } else {
    // Linux: intentar aplay, luego paplay
    const aplay = spawnSync('aplay', ['-q', wavPath]);
    if (aplay.status !== 0 && aplay.status !== null && aplay.error?.message.includes('ENOENT')) {
      const paplay = spawnSync('paplay', [wavPath]);
      if (paplay.status !== 0 && paplay.status !== null) {
        throw new Error(`paplay terminó con código ${String(paplay.status)}`);
      }
    } else if (aplay.status !== 0 && aplay.status !== null) {
      throw new Error(`aplay terminó con código ${String(aplay.status)}`);
    }
  }
}

export class GeminiTTSService implements ITTSService {
  constructor(private readonly apiKey: string | undefined) {}

  async initialize(): Promise<void> {
    // Gemini TTS no requiere inicialización asíncrona
  }

  async speak(text: string): Promise<void> {
    const clean = normalizeSpeechText(text);
    if (!clean.trim()) return;

    if (!this.apiKey) {
      process.stderr.write('[Gemini TTS] Sin API key; síntesis omitida\n');
      return;
    }

    const wavPath = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);

    try {
      const res = await fetch(`${GEMINI_TTS_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: clean }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } },
            },
          },
        }),
      });

      if (!res.ok) {
        process.stderr.write(`[Gemini TTS] HTTP ${res.status}; síntesis omitida\n`);
        return;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
      };

      const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) {
        process.stderr.write('[Gemini TTS] Respuesta vacía de síntesis; omitida\n');
        return;
      }

      const pcm = Buffer.from(b64, 'base64');
      const wav = buildWavBuffer(pcm);
      fs.writeFileSync(wavPath, wav);
      playWav(wavPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[Gemini TTS] Error en síntesis: ${msg}\n`);
    } finally {
      try {
        fs.unlinkSync(wavPath);
      } catch {
        // ignorar si no existe
      }
    }
  }
}
