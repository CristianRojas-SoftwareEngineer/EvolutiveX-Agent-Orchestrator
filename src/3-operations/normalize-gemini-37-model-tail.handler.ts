import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

interface MessageBlock {
  role: string;
  content: unknown;
}

interface RequestBody {
  model?: string;
  messages?: MessageBlock[];
  [key: string]: unknown;
}

/**
 * Handler para normalizar la cola de `body.messages` en peticiones dirigidas a
 * Gemini 3.7 Flash vía OmniRoute (LiteLLM).
 *
 * Vertex rechaza payloads traducidos cuyo último content sea un "model turn"
 * de texto solo: "API Error: 400 Requests ending with a model turn are not
 * supported." (repro: BerriAI/litellm#38537). El trigger de estado lo producen
 * operaciones que dejan el historial finalizando en un turno de asistente:
 * /rewind, cancelación de stream, barge-in por voz o tool-completion de
 * background.
 *
 * El fix es un tail-normalization idempotente: si el último mensaje ya es
 * `role: user`, no se toca el body; si es `role: assistant` y el patrón de
 * modelos matchea, se inyecta un user sintético no vacío y no ambiguo
 * (placeholder "."; el vacío y el espacio siguen 400, ver repro de litellm).
 *
 * Aislamiento: solo aplica cuando `body.model` matchea `GEMINI_37_TAIL_PATTERN`
 * (default: `gemini-3\.7-flash`). Cualquier otro modelo (qwen, claude, glm,
 * gemini 3.6, etc.) pasa por el proxy sin tocar.
 */
export class NormalizeGemini37ModelTailHandler {
  private readonly pattern: RegExp;

  constructor(private config: ProxyEnvironmentConfig) {
    const raw = this.config.GEMINI_37_TAIL_PATTERN ?? 'gemini-3\\.7-flash';
    try {
      this.pattern = new RegExp(raw, 'i');
    } catch {
      // Patrón regex inválido: usa uno que no matchee nada (fail-open, no toques el body).
      this.pattern = new RegExp('a^$', 'i');
    }
  }

  /**
   * Normaliza la cola y estructura de `body.messages` para Gemini 3.7 Flash:
   * 1. Remapea IDs de tools (`tool_use` y `tool_result`) a IDs canónicos (`toolu_1`, `toolu_2`, ...)
   *    para evitar desalineaciones en la traducción de OmniRoute/LiteLLM a Vertex.
   * 2. Trata `role: system` interno como `role: user`.
   * 3. Fusiona turnos consecutivos del mismo rol para mantener alternancia estricta.
   * 4. Asegura que el historial finalice en un turno `user`.
   *
   * @param rawBody - Buffer con el body original del request
   * @returns Buffer con el body normalizado (o el original si no hay cambios o hay error)
   */
  public execute(rawBody: Buffer): Buffer {
    if (rawBody.length === 0) {
      return rawBody;
    }

    let body: RequestBody;
    try {
      body = JSON.parse(rawBody.toString('utf-8')) as RequestBody;
    } catch {
      return rawBody;
    }

    // Gate por modelo: si no matchea, passthrough sin tocar.
    if (typeof body.model !== 'string' || !this.pattern.test(body.model)) {
      return rawBody;
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return rawBody;
    }

    // 1. Remapeo canónico de tool IDs
    const idMap = new Map<string, string>();
    let toolCounter = 1;

    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && typeof block === 'object') {
            const b = block as Record<string, unknown>;
            if (b.type === 'tool_use' && typeof b.id === 'string') {
              if (!idMap.has(b.id)) {
                idMap.set(b.id, `toolu_${toolCounter++}`);
              }
              b.id = idMap.get(b.id);
            }
            if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
              if (idMap.has(b.tool_use_id)) {
                b.tool_use_id = idMap.get(b.tool_use_id);
              }
            }
          }
        }
      }
    }

    // 2 & 3. Fusión de turnos consecutivos y conversión de system a user
    const toBlocks = (content: unknown): Array<Record<string, unknown>> => {
      if (typeof content === 'string') {
        return [{ type: 'text', text: content }];
      }
      if (Array.isArray(content)) {
        return content.map((item) => {
          if (typeof item === 'string') {
            return { type: 'text', text: item };
          }
          return item as Record<string, unknown>;
        });
      }
      return [];
    };

    const merged: MessageBlock[] = [];
    for (const msg of messages) {
      const role = msg.role === 'system' ? 'user' : msg.role;
      const blocks = toBlocks(msg.content);

      if (merged.length > 0 && merged[merged.length - 1].role === role) {
        const prevBlocks = toBlocks(merged[merged.length - 1].content);
        merged[merged.length - 1].content = [...prevBlocks, ...blocks];
      } else {
        merged.push({
          role,
          content: blocks,
        });
      }
    }

    // 4. Asegurar que el último turno sea de usuario
    if (merged.length > 0) {
      const last = merged[merged.length - 1];
      if (last.role === 'assistant') {
        merged.push({
          role: 'user',
          content: [{ type: 'text', text: '.' }],
        });
      }
    }

    body.messages = merged;
    return Buffer.from(JSON.stringify(body), 'utf-8');
  }
}
