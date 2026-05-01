import { JsonValue } from '../types/json.types.js';

/**
 * Servicio para renderizar cuerpos JSON de petición/respuesta como Markdown semántico legible.
 * Genera vistas enriquecidas para bloques `thinking`, `tool_use`, `tool_result` y `text`.
 */
export class MarkdownRendererService {
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
   * Renderiza el cuerpo de una petición Anthropic como Markdown conversacional legible.
   * Extrae el prompt efectivo del usuario y muestra el contexto de tool_results si aplica.
   */
  public renderRequestConversationMarkdown(parsed: JsonValue): string {
    try {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, JsonValue>;

        // Extraer metadata opcional
        const model = obj.model ? String(obj.model) : undefined;
        const maxTokens = obj.max_tokens ? Number(obj.max_tokens) : undefined;

        // Extraer mensajes
        const messages = Array.isArray(obj.messages) ? obj.messages : [];
        const {
          text: promptText,
          toolResults,
          attachments,
        } = this.extractLastUserMessage(messages);

        const parts: string[] = [this.heading(1, 'Prompt del Usuario')];

        // Texto del prompt
        if (promptText) {
          parts.push(promptText);
        } else {
          parts.push('_[No se detectó mensaje de usuario]_');
        }

        // Adjuntos (imágenes, documentos)
        if (attachments.length > 0) {
          parts.push('');
          parts.push('**Adjuntos:** ' + attachments.join(', '));
        }

        // Contexto de tool_results (para continuaciones)
        if (toolResults.length > 0) {
          parts.push('');
          parts.push('---');
          parts.push('');
          const toolList = toolResults.map((tr) => `${tr.name} (${tr.id})`).join(', ');
          parts.push(`**Contexto:** El harness recibió resultados de: ${toolList}`);
        }

        // Footer con metadata
        if (model || maxTokens) {
          const metaParts: string[] = [];
          if (model) metaParts.push(`model: ${model}`);
          if (maxTokens) metaParts.push(`max_tokens: ${maxTokens}`);
          parts.push('');
          parts.push(`<!-- ${metaParts.join(', ')} -->`);
        }

        return parts.join('\n');
      }
    } catch {
      /* fallback */
    }
    return this.lines(this.heading(1, 'Prompt del Usuario'), this.fencedJson(parsed));
  }

  /**
   * Extrae el último mensaje del usuario del array de mensajes Anthropic.
   * Retorna el texto del prompt, los tool_results recibidos y los adjuntos.
   */
  private extractLastUserMessage(messages: JsonValue[]): {
    text: string;
    toolResults: Array<{ id: string; name: string }>;
    attachments: string[];
  } {
    let promptText = '';
    const toolResults: Array<{ id: string; name: string }> = [];
    const attachments: string[] = [];

    // Crear mapa de tool_use_id -> nombre de herramienta desde mensajes previos del assistant
    const toolNameMap = new Map<string, string>();
    for (const msg of messages) {
      if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
        const m = msg as Record<string, JsonValue>;
        if (m.role === 'assistant' && Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block && typeof block === 'object' && !Array.isArray(block)) {
              const b = block as Record<string, JsonValue>;
              if (b.type === 'tool_use' && b.id && b.name) {
                toolNameMap.set(String(b.id), String(b.name));
              }
            }
          }
        }
      }
    }

    // Buscar el último mensaje user (de atrás hacia adelante)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
        const m = msg as Record<string, JsonValue>;
        if (m.role === 'user') {
          // Extraer contenido del mensaje
          if (Array.isArray(m.content)) {
            for (const block of m.content) {
              if (block && typeof block === 'object' && !Array.isArray(block)) {
                const b = block as Record<string, JsonValue>;
                if (b.type === 'text' && typeof b.text === 'string') {
                  promptText = b.text;
                } else if (b.type === 'tool_result') {
                  const toolId = b.tool_use_id ? String(b.tool_use_id) : '';
                  const toolName = toolNameMap.get(toolId) || 'tool';
                  if (toolId) {
                    toolResults.push({ id: toolId, name: toolName });
                  }
                } else if (b.type === 'image') {
                  attachments.push('[Imagen adjunta]');
                } else if (b.type === 'document') {
                  const filename = b.title || b.file_name || 'documento';
                  attachments.push(`[Documento: ${filename}]`);
                }
              }
            }
          } else if (typeof m.content === 'string') {
            promptText = m.content;
          }
          break; // Solo el último mensaje user
        }
      }
    }

    return { text: promptText, toolResults, attachments };
  }

  /**
   * Renderiza el cuerpo de una respuesta Anthropic como Markdown conversacional legible.
   * Separa pensamiento interno (blockquote), respuesta al usuario (texto plano) y acciones solicitadas.
   */
  public renderResponseConversationMarkdown(parsed: JsonValue): string {
    try {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parts: string[] = [this.heading(1, 'Respuesta del Asistente')];
        parts.push(...this.renderStepSections(parsed, 2));
        return parts.join('\n\n');
      }
    } catch {
      /* fallback */
    }
    return this.lines(this.heading(1, 'Respuesta del Asistente'), this.fencedJson(parsed));
  }

  /**
   * Renderiza una cadena completa de steps como Markdown.
   * Si hay un solo step, el formato es idéntico al de renderResponseConversationMarkdown.
   * Si hay múltiples steps, cada uno lleva encabezado `## Step N de M — <stop_reason>`.
   */
  public renderMultiStepResponseMarkdown(
    steps: Array<{ stepIndex: number; parsed: JsonValue }>,
  ): string {
    if (steps.length === 1) {
      return this.renderResponseConversationMarkdown(steps[0].parsed);
    }

    const total = steps.length;
    const parts: string[] = [this.heading(1, 'Respuesta del Asistente')];

    for (let i = 0; i < steps.length; i++) {
      const { stepIndex, parsed } = steps[i];
      const stopReason =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? String((parsed as Record<string, JsonValue>).stop_reason ?? '')
          : '';
      const stepHeader = this.heading(
        2,
        `Step ${stepIndex} de ${total}${stopReason ? ` — ${stopReason}` : ''}`,
      );
      parts.push(stepHeader);
      parts.push(...this.renderStepSections(parsed, 3));
      if (i < steps.length - 1) {
        parts.push('---');
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Renderiza las secciones de contenido de un step (thinking, text, tool_use, stop_reason)
   * usando el nivel de encabezado indicado. No incluye el título raíz del documento.
   */
  private renderStepSections(parsed: JsonValue, headingLevel: number): string[] {
    const parts: string[] = [];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parts;

    const obj = parsed as Record<string, JsonValue>;
    const stopReason = obj.stop_reason ? String(obj.stop_reason) : undefined;
    const content = Array.isArray(obj.content) ? obj.content : [];
    const thinkingParts: string[] = [];
    const textParts: string[] = [];
    const toolUses: Array<{ name: string; id: string; input: JsonValue }> = [];

    for (const block of content) {
      if (block && typeof block === 'object' && !Array.isArray(block)) {
        const b = block as Record<string, JsonValue>;
        if (b.type === 'thinking' && typeof b.thinking === 'string') {
          thinkingParts.push(b.thinking);
        } else if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text);
        } else if (b.type === 'tool_use') {
          toolUses.push({
            name: b.name ? String(b.name) : 'tool',
            id: b.id ? String(b.id) : '',
            input: 'input' in b ? b.input : undefined,
          });
        }
      }
    }

    if (thinkingParts.length > 0) {
      const fullThinking = thinkingParts.join('\n\n');
      const truncated = this.truncateWithIndicator(
        fullThinking,
        5000,
        '_[Pensamiento truncado...]_',
      );
      const quoted = truncated
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      parts.push(this.heading(headingLevel, 'Razonamiento interno'));
      parts.push(quoted);
    }

    if (textParts.length > 0) {
      parts.push(this.heading(headingLevel, 'Respuesta'));
      parts.push(textParts.join('\n\n'));
    }

    if (toolUses.length > 0) {
      parts.push(this.heading(headingLevel, 'Acciones solicitadas'));
      for (const tool of toolUses) {
        const idStr = tool.id ? `(id: \`${tool.id}\`)` : '';
        if (tool.input !== undefined) {
          const inputJson = JSON.stringify(tool.input, null, 2);
          const indented = inputJson
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n');
          parts.push(`- **${tool.name}** ${idStr}\n  \`\`\`json\n${indented}\n  \`\`\``);
        } else {
          parts.push(`- **${tool.name}** ${idStr}`);
        }
      }
    }

    if (stopReason) {
      parts.push('');
      parts.push(`_(stop_reason: ${stopReason})_`);
    }

    return parts;
  }

  /**
   * Trunca un texto si excede el límite, agregando un indicador.
   */
  private truncateWithIndicator(text: string, maxLength: number, indicator: string): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '\n' + indicator;
  }
}
