import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type {
  IContextExtractor,
  SessionMessage,
  UserPromptContext,
} from '../../1-domain/ports/IContextExtractor.js';

/** Forma de cada línea del transcript JSONL de Claude Code. */
interface TranscriptLine {
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

/**
 * Adaptador que lee el transcript JSONL de una sesión de Claude Code
 * y extrae los últimos N mensajes de usuario/asistente/sistema.
 */
export class TranscriptContextExtractor implements IContextExtractor {
  async extractLastNMessages(transcriptPath: string, n: number): Promise<SessionMessage[]> {
    const all: SessionMessage[] = [];

    try {
      const rl = createInterface({
        input: createReadStream(transcriptPath, { encoding: 'utf-8' }),
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const row = JSON.parse(trimmed) as TranscriptLine;
          const role = row.message?.role;
          if (!role) continue;
          if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;

          const raw = row.message?.content;
          let text: string;
          if (typeof raw === 'string') {
            text = raw.trim();
          } else if (Array.isArray(raw)) {
            text = raw
              .filter((b) => b.type === 'text' && typeof b.text === 'string')
              .map((b) => (b.text as string).trim())
              .filter(Boolean)
              .join(' ');
          } else {
            continue;
          }

          if (text) {
            all.push({ role: role as SessionMessage['role'], text });
          }
        } catch {
          /* línea no JSON: ignorar */
        }
      }

      rl.close();
    } catch {
      /* archivo no encontrado o error de lectura: devolver vacío */
    }

    // Retornar los últimos N mensajes
    return all.slice(-n);
  }

  async extractUserPromptSubmitContext(
    transcriptPath: string,
    currentPrompt: string,
  ): Promise<UserPromptContext> {
    // Ventana amplia para garantizar que los dos últimos roles (user + assistant)
    // están presentes aunque haya entradas `system` intercaladas o chains largos
    // de tool_use / tool_result.
    const recent = await this.extractLastNMessages(transcriptPath, 10);

    // El "prompt anterior" es el último mensaje de usuario en el transcript,
    // que corresponde al turno previo. El prompt actual (currentPrompt) llega
    // en el payload del hook y no está todavía en el transcript.
    const users = recent.filter((m) => m.role === 'user');
    const previousUserMessage = users.length > 0 ? users[users.length - 1]?.text : undefined;

    const assistants = recent.filter((m) => m.role === 'assistant');
    const lastAssistantResponse =
      assistants.length > 0 ? assistants[assistants.length - 1]?.text : undefined;

    return {
      previousUserMessage,
      lastAssistantResponse,
      currentPrompt,
    };
  }
}
