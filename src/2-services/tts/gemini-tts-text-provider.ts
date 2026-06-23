import type { SessionMessage } from '../../1-domain/ports/IContextExtractor.js';
import type { ITtsTextProvider } from '../../1-domain/ports/ITtsTextProvider.js';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

const TTS_MAX_TOKENS = 512;

const VOICE_ASSISTANT_SYSTEM_PROMPT =
  'Eres la voz del asistente Smart Code Proxy. ' +
  'Recibirás tres mensajes: la petición anterior del usuario, ' +
  'tu última respuesta, y la nueva petición del usuario. ' +
  'Responde SOLO a la nueva petición (la tercera) en una sola oración breve y natural en español, ' +
  'confirmando que procederás a investigar o ejecutar lo solicitado. ' +
  'Texto plano para ser leído en voz alta: sin markdown, sin asteriscos, ' +
  'comillas, guiones ni símbolos. Sin puntos al final.';

const CONTINUITY_SYSTEM_PROMPT =
  'Eres la voz del asistente de continuidad de Smart Code Proxy. ' +
  'Narra en alto nivel, en una o dos frases cortas en español, una síntesis de lo realizado. ' +
  'Parafrasea; no expliques detalle técnico punto por punto ni enumeres pasos. ' +
  'Texto plano para ser leído en voz alta: sin markdown, sin asteriscos, ' +
  'comillas, guiones ni símbolos. Sin puntos al final de las oraciones. Habla en primera persona.';

export class GeminiTtsTextProvider implements ITtsTextProvider {
  constructor(private readonly apiKey: string | undefined) {}

  async generateText(
    _eventName: string,
    messages: SessionMessage[],
    mode: 'prompt' | 'summary',
  ): Promise<string> {
    if (!this.apiKey) throw new Error('Gemini API key no disponible');

    const systemPrompt =
      mode === 'prompt' ? VOICE_ASSISTANT_SYSTEM_PROMPT : CONTINUITY_SYSTEM_PROMPT;

    const contents = messages.map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.role === 'system' ? `[Sistema]: ${m.text}` : m.text }],
    }));

    if (contents.at(-1)?.role !== 'user') {
      contents.push({ role: 'user' as const, parts: [{ text: '¿Qué pasó en este turno?' }] });
    }

    const res = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          maxOutputTokens: TTS_MAX_TOKENS,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => (typeof p.text === 'string' ? p.text.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!text) throw new Error('Gemini devolvió respuesta vacía');
    return text;
  }
}
