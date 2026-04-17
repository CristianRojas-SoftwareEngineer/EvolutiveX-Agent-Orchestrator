import { JsonValue } from '../types/json.types.js';

/**
 * Servicio para renderizar cuerpos JSON de petición/respuesta como Markdown semántico legible.
 * Genera vistas enriquecidas para bloques `thinking`, `tool_use`, `tool_result` y `text`,
 * portado desde la lógica legacy de `audit-body-markdown.js`.
 */
export class MarkdownRendererService {
  /**
   * Renderiza el cuerpo de una petición Anthropic como Markdown semántico.
   * Muestra parámetros top-level y el array de mensajes con sus bloques de contenido.
   */
  public renderRequestBodyMarkdown(parsed: JsonValue): string {
    try {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, JsonValue>;
        const parts: string[] = [this.heading(1, 'Request body'), this.renderRequestTopFields(obj)];
        if (Array.isArray(obj.messages)) {
          parts.push(
            this.heading(2, 'Messages'),
            (obj.messages as JsonValue[]).map((m, i) => this.renderMessage(m, i)).join('\n\n'),
          );
        } else if (!obj.messages) {
          parts.push(this.renderContentBlocks(obj.content));
        }
        return parts.filter(Boolean).join('\n\n');
      }
    } catch {
      /* fallback */
    }
    return this.lines(this.heading(1, 'Request body'), this.fencedJson(parsed));
  }

  /**
   * Renderiza el cuerpo de una respuesta Anthropic como Markdown semántico.
   * Incluye metadatos (id, model, usage, stop_reason) y los bloques de contenido.
   */
  public renderResponseBodyMarkdown(parsed: JsonValue): string {
    try {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, JsonValue>;
        const meta: string[] = [];
        for (const k of ['id', 'type', 'role', 'model', 'stop_reason', 'stop_sequence']) {
          if (k in obj && obj[k] !== undefined && obj[k] !== null) {
            meta.push(`- **${k}:** ${JSON.stringify(obj[k])}`);
          }
        }
        if ('usage' in obj && obj.usage && typeof obj.usage === 'object') {
          meta.push(`- **usage:**\n\n${this.fencedJson(obj.usage)}`);
        }
        const head =
          meta.length > 0
            ? [this.heading(1, 'Response message'), meta.join('\n')].join('\n\n')
            : this.heading(1, 'Response message');
        const content = this.renderContentBlocks(obj.content);
        return [head, this.heading(2, 'Content'), content].join('\n\n');
      }
    } catch {
      /* fallback */
    }
    return this.lines(this.heading(1, 'Response body'), this.fencedJson(parsed));
  }

  /**
   * Genera un code fence JSON formateado.
   */
  private fencedJson(value: JsonValue): string {
    const s = JSON.stringify(value, null, 2);
    return ['```json', s, '```'].join('\n');
  }

  /**
   * Genera un encabezado Markdown del nivel indicado (1-6).
   */
  private heading(level: number, text: string): string {
    const h = '#'.repeat(Math.min(Math.max(level, 1), 6));
    return `${h} ${text}`;
  }

  /**
   * Une partes filtrando vacías con doble salto de línea.
   */
  private lines(...parts: (string | undefined | null)[]): string {
    return parts.filter((p) => p !== undefined && p !== null && p !== '').join('\n\n');
  }

  /**
   * Renderiza un bloque de texto plano.
   */
  private renderTextBlock(text: JsonValue): string {
    if (typeof text !== 'string') return this.fencedJson(text);
    return text;
  }

  /**
   * Despacha el renderizado de un bloque individual según su tipo.
   * Soporta: text, thinking, tool_use, tool_result, y fallback genérico.
   */
  private renderBlock(block: JsonValue, index: number): string {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return [this.heading(4, `Block ${index + 1}`), this.fencedJson(block)].join('\n\n');
    }
    const obj = block as Record<string, JsonValue>;
    const t = obj.type as string | undefined;
    const title = `Block ${index + 1}: ${t || 'unknown'}`;

    if (t === 'text' && typeof obj.text === 'string') {
      return [this.heading(4, title), this.renderTextBlock(obj.text)].join('\n\n');
    }
    if (t === 'thinking') {
      const think = typeof obj.thinking === 'string' ? obj.thinking : '';
      const sig =
        typeof obj.signature === 'string' && (obj.signature as string).length > 0
          ? `_(signature: ${(obj.signature as string).length} chars)_`
          : '';
      return [this.heading(4, title), sig, think || '_(empty)_'].filter(Boolean).join('\n\n');
    }
    if (t === 'tool_use') {
      const name = obj.name ? String(obj.name) : '';
      const id = obj.id ? String(obj.id) : '';
      const head = [this.heading(4, title), `**tool:** ${name}`, id ? `**id:** \`${id}\`` : '']
        .filter(Boolean)
        .join('\n\n');
      const input = 'input' in obj ? obj.input : undefined;
      return [head, this.fencedJson(input !== undefined ? input : obj)].join('\n\n');
    }
    if (t === 'tool_result') {
      const id = obj.tool_use_id ? String(obj.tool_use_id) : '';
      const body = obj.content;
      if (typeof body === 'string') {
        return [
          this.heading(4, title),
          id ? `**tool_use_id:** \`${id}\`` : '',
          this.renderTextBlock(body),
        ]
          .filter(Boolean)
          .join('\n\n');
      }
      return [
        this.heading(4, title),
        id ? `**tool_use_id:** \`${id}\`` : '',
        this.fencedJson(body !== undefined ? body : obj),
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    return [this.heading(4, title), this.fencedJson(obj)].join('\n\n');
  }

  /**
   * Renderiza un array de bloques de contenido separados por reglas horizontales.
   */
  private renderContentBlocks(content: JsonValue): string {
    if (!Array.isArray(content)) {
      return this.fencedJson(content);
    }
    return content.map((b, i) => this.renderBlock(b, i)).join('\n\n---\n\n');
  }

  /**
   * Renderiza un mensaje individual con su rol y bloques de contenido.
   */
  private renderMessage(msg: JsonValue, msgIndex: number): string {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      return [this.heading(3, `Message ${msgIndex + 1}`), this.fencedJson(msg)].join('\n\n');
    }
    const obj = msg as Record<string, JsonValue>;
    const role = obj.role ? String(obj.role) : 'unknown';
    const head = this.heading(3, `Message ${msgIndex + 1} (${role})`);
    const inner = this.renderContentBlocks(obj.content);
    return [head, inner].join('\n\n');
  }

  /**
   * Renderiza los campos top-level de una petición (excluyendo messages).
   */
  private renderRequestTopFields(parsed: Record<string, JsonValue>): string {
    const skip = new Set(['messages']);
    const keys = Object.keys(parsed).filter((k) => !skip.has(k));
    if (keys.length === 0) return '';
    const rows = keys.map((k) => {
      const v = parsed[k];
      if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        return `- **${k}:** ${JSON.stringify(v)}`;
      }
      return `- **${k}:**\n\n${this.fencedJson(v)}`;
    });
    return [this.heading(2, 'Request parameters'), rows.join('\n\n')].join('\n\n');
  }
}
