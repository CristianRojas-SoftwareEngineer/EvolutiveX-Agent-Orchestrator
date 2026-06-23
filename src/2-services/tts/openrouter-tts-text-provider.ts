import type { SessionMessage } from '../../1-domain/ports/IContextExtractor.js';
import type { ITtsTextProvider } from '../../1-domain/ports/ITtsTextProvider.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/messages';
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

export class OpenRouterTtsTextProvider implements ITtsTextProvider {
  constructor(private readonly bearerToken: string | undefined) {}

  async generateText(
    _eventName: string,
    messages: SessionMessage[],
    mode: 'prompt' | 'summary',
  ): Promise<string> {
    if (!this.bearerToken) throw new Error('OpenRouter bearer token no disponible');

    const systemPrompt =
      mode === 'prompt' ? VOICE_ASSISTANT_SYSTEM_PROMPT : CONTINUITY_SYSTEM_PROMPT;

    const anthropicMessages = messages.map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.role === 'system' ? `[Sistema]: ${m.text}` : m.text,
    }));

    if (anthropicMessages.at(-1)?.role !== 'user') {
      anthropicMessages.push({ role: 'user' as const, content: '¿Qué pasó en este turno?' });
    }

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify({
        model: 'poolside/laguna-xs.2:free',
        max_tokens: TTS_MAX_TOKENS,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!text) throw new Error('OpenRouter devolvió respuesta vacía');
    return text;
  }
}
