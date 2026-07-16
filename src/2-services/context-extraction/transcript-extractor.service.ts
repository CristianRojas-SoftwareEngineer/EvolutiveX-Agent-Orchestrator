import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { IContextExtractor, SessionMessage } from '../../1-domain/ports/IContextExtractor.js';

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
}
