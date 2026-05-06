import { JsonValue } from '../types/json.types.js';
import { MarkdownRenderContext, SubagentsSummary, WorkflowIndex } from '../types/audit.types.js';

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
  public renderRequestConversationMarkdown(
    parsed: JsonValue,
    context?: MarkdownRenderContext,
  ): string {
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

        const rootHeading = this.buildRootHeading('request', context);
        const parts: string[] = [rootHeading];

        // Cabecera de contexto
        const contextHeader = this.renderContextHeader(context);
        if (contextHeader) parts.push(contextHeader);

        // Detectar contenido Skill
        const skillBlock = this.detectAndRenderSkillContent(promptText);
        if (skillBlock) {
          parts.push(skillBlock);
          // Si hay más texto além del Skill, renderizarlo después
          const remainingText = this.extractTextAfterSkill(promptText);
          if (remainingText) {
            parts.push('---');
            parts.push('');
            parts.push(remainingText);
          }
        } else if (promptText) {
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
    return this.lines(this.buildRootHeading('request', context), this.fencedJson(parsed));
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

    // Buscar el último mensaje user con texto real (de atrás hacia adelante)
    // Continuaciones pueden tener mensajes user solo con tool_results, sin texto
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
        const m = msg as Record<string, JsonValue>;
        if (m.role === 'user') {
          let hasText = false;
          // Extraer contenido del mensaje
          if (Array.isArray(m.content)) {
            for (const block of m.content) {
              if (block && typeof block === 'object' && !Array.isArray(block)) {
                const b = block as Record<string, JsonValue>;
                if (b.type === 'text' && typeof b.text === 'string') {
                  promptText = b.text;
                  hasText = true;
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
            hasText = true;
          }

          // Solo detenerse si encontramos un mensaje user con texto real
          if (hasText) {
            break;
          }
        }
      }
    }

    return { text: promptText, toolResults, attachments };
  }

  /**
   * Renderiza el cuerpo de una respuesta Anthropic como Markdown conversacional legible.
   * Separa pensamiento interno (blockquote), respuesta al usuario (texto plano) y acciones solicitadas.
   */
  public renderResponseConversationMarkdown(
    parsed: JsonValue,
    context?: MarkdownRenderContext,
  ): string {
    try {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, JsonValue>;
        if (obj.type === 'coalesced-agent-step-response') {
          return this.renderCoalescedAgentStepResponseMarkdown(
            obj.initial,
            obj.continuationRequest ?? null,
            obj.final,
            obj.subagents as unknown as SubagentsSummary, // subagentsSummary
            context,
          );
        }
        const rootHeading = this.buildRootHeading('response', context);
        const parts: string[] = [rootHeading];
        const contextHeader = this.renderContextHeader(context);
        if (contextHeader) parts.push(contextHeader);
        parts.push(...this.renderStepSections(parsed, 2, context));
        return parts.join('\n\n');
      }
    } catch {
      /* fallback */
    }
    return this.lines(this.buildRootHeading('response', context), this.fencedJson(parsed));
  }

  /**
   * Renderiza una cadena completa de steps como Markdown.
   * Si hay un solo step, el formato es idéntico al de renderResponseConversationMarkdown.
   * Si hay múltiples steps, genera TOC y cada uno lleva encabezado `## Step N de M — <stop_reason>`.
   * Si los stepIndex no son contiguos, muestra solo `## Step N — <stop_reason>` sin el total.
   */
  public renderMultiStepResponseMarkdown(
    steps: Array<{ stepIndex: number; parsed: JsonValue }>,
    context?: MarkdownRenderContext,
  ): string {
    if (steps.length === 1) {
      return this.renderResponseConversationMarkdown(steps[0].parsed, context);
    }

    // Detectar si los stepIndex son contiguos
    const sortedIndices = steps.map((s) => s.stepIndex).sort((a, b) => a - b);
    const isContiguous = sortedIndices.every((idx, i) => i === 0 || idx === sortedIndices[i - 1] + 1);
    const total = isContiguous ? steps.length : Math.max(...steps.map((s) => s.stepIndex));

    const rootHeading = this.buildRootHeading('response', context);
    const parts: string[] = [rootHeading];

    const contextHeader = this.renderContextHeader(context);
    if (contextHeader) parts.push(contextHeader);

    // Generar TOC para multi-step
    const toc = this.buildMultiStepToc(steps);
    if (toc) parts.push(toc);

    for (let i = 0; i < steps.length; i++) {
      const { stepIndex, parsed } = steps[i];
      const stopReason =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? String((parsed as Record<string, JsonValue>).stop_reason ?? '')
          : '';
      const stepHeader = this.heading(
        2,
        isContiguous
          ? `Step ${stepIndex} de ${total}${stopReason ? ` — ${stopReason}` : ''}`
          : `Step ${stepIndex}${stopReason ? ` — ${stopReason}` : ''}`,
      );
      parts.push(stepHeader);
      parts.push(...this.renderStepSections(parsed, 3, context));
      if (i < steps.length - 1) {
        parts.push('---');
      }
    }

    return parts.join('\n\n');
  }

  public renderCoalescedAgentStepResponseMarkdown(
    initialMessage: JsonValue,
    continuationRequest: JsonValue | null,
    finalMessage: JsonValue,
    subagentsSummary?: SubagentsSummary,
    context?: MarkdownRenderContext,
  ): string {
    const rootHeading = this.buildRootHeading('response', context);
    const parts: string[] = [rootHeading];

    const contextHeader = this.renderContextHeader(context);
    if (contextHeader) parts.push(contextHeader);

    // Fase 1: Delegación inicial (stream que emitió tool_use Agent)
    parts.push(this.heading(2, '🔀 Fase 1: Delegación inicial'));
    parts.push('El agente principal invocó subagentes mediante tool_use `Agent`.');
    parts.push(...this.renderStepSections(initialMessage, 3, context));

    // Fase 2: Ejecución de subagentes
    if (subagentsSummary && subagentsSummary.items.length > 0) {
      parts.push('---');
      parts.push(this.heading(2, '🔀 Fase 2: Ejecución de subagentes'));
      parts.push(`Se ejecutaron ${subagentsSummary.count} subagente${subagentsSummary.count === 1 ? '' : 's'} en paralelo durante esta fase.`);
      parts.push(`**Completados:** ${subagentsSummary.completedCount} | **Fallidos:** ${subagentsSummary.failedCount} | **Huérfanos:** ${subagentsSummary.orphanedCount}`);
      parts.push(`**Duración total:** ${this.formatDuration(subagentsSummary.totalDurationMs)} | **Tokens:** ${subagentsSummary.totalInputTokens} input, ${subagentsSummary.totalOutputTokens} output`);
      parts.push('');

      for (const subagent of subagentsSummary.items) {
        parts.push(this.heading(3, `Subagente ${subagent.index}: ${subagent.description}`));
        parts.push(`**ID tool_use:** \`${subagent.toolUseId || 'no correlacionado'}\`${subagent.inferredByOrder ? ' (inferido por orden)' : ''}`);
        parts.push(`**Tipo:** ${subagent.subagentType || 'general-purpose'}`);
        parts.push(`**Estado:** ${this.formatOutcome(subagent.outcome)}`);
        parts.push(`**Duración:** ${this.formatDuration(subagent.durationMs)} | **Steps:** ${subagent.stepCount} | **Tokens:** ${subagent.inputTokens}/${subagent.outputTokens}`);
        if (subagent.toolCalls.length > 0) {
          parts.push(`**Herramientas:** ${subagent.toolCalls.join(', ')}`);
        }
        if (subagent.finalResponsePreview) {
          parts.push(`**Respuesta preview:** ${subagent.finalResponsePreview}`);
        }
        parts.push(`**Output completo:** \`${subagent.outputPath}\``);
        parts.push('');
      }
    } else {
      parts.push('---');
      parts.push(this.heading(2, '🔀 Fase 2: Ejecución de subagentes'));
      parts.push('No se encontraron subagentes anidados para esta fase.');
    }

    // Fase 3: Respuesta final coalesced
    parts.push('---');
    parts.push(this.heading(2, '🔀 Fase 3: Respuesta final coalesced'));
    parts.push('Mensaje final del agente principal tras procesar todos los resultados.');
    parts.push(...this.renderStepSections(finalMessage, 3, context));

    return parts.join('\n\n');
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private formatOutcome(outcome: string): string {
    const map: Record<string, string> = {
      completed: '✅ Completado',
      'client-error': '❌ Error',
      orphaned: '⚠️ Huérfano',
      unknown: '❓ Desconocido',
    };
    return map[outcome] || outcome;
  }

  /**
   * Renderiza las secciones de contenido de un step (thinking, text, tool_use, stop_reason)
   * usando el nivel de encabezado indicado. Preserva el orden temporal de aparición
   * de cada tipo de bloque, usando contadores secuenciales cuando un mismo tipo
   * aparece múltiples veces separado por otros tipos.
   */
  private renderStepSections(
    parsed: JsonValue,
    headingLevel: number,
    context?: MarkdownRenderContext,
  ): string[] {
    const parts: string[] = [];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parts;

    const obj = parsed as Record<string, JsonValue>;
    const stopReason = obj.stop_reason ? String(obj.stop_reason) : undefined;
    const content = Array.isArray(obj.content) ? obj.content : [];

    // Agrupar bloques consecutivos del mismo tipo en segmentos
    type Segment =
      | { kind: 'thinking'; blocks: string[] }
      | { kind: 'text'; blocks: string[] }
      | { kind: 'toolUse'; entries: Array<{ name: string; id: string; input: JsonValue }> };

    const segments: Segment[] = [];
    let currentSegment: Segment | undefined;

    for (const block of content) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      const b = block as Record<string, JsonValue>;

      if (b.type === 'thinking' && typeof b.thinking === 'string') {
        if (currentSegment?.kind === 'thinking') {
          currentSegment.blocks.push(b.thinking);
        } else {
          currentSegment = { kind: 'thinking', blocks: [b.thinking] };
          segments.push(currentSegment);
        }
      } else if (b.type === 'text' && typeof b.text === 'string') {
        if (currentSegment?.kind === 'text') {
          currentSegment.blocks.push(b.text);
        } else {
          currentSegment = { kind: 'text', blocks: [b.text] };
          segments.push(currentSegment);
        }
      } else if (b.type === 'tool_use') {
        const toolEntry = {
          name: b.name ? String(b.name) : 'tool',
          id: b.id ? String(b.id) : '',
          input: 'input' in b ? b.input : undefined,
        };
        if (currentSegment?.kind === 'toolUse') {
          currentSegment.entries.push(toolEntry);
        } else {
          currentSegment = { kind: 'toolUse', entries: [toolEntry] };
          segments.push(currentSegment);
        }
      } else {
        currentSegment = undefined;
      }
    }

    // Contadores secuenciales por tipo para headings cuando hay repetición
    const typeCounters: Record<string, number> = {};

    for (const seg of segments) {
      switch (seg.kind) {
        case 'thinking': {
          typeCounters.thinking = (typeCounters.thinking ?? 0) + 1;
          const counter = typeCounters.thinking;
          const title = counter > 1
            ? `Razonamiento interno (${counter})`
            : 'Razonamiento interno';
          const fullThinking = seg.blocks.join('\n\n---\n\n');
          const truncated = this.truncateWithIndicator(
            fullThinking,
            5000,
            context?.thoughtContentPath
              ? `_[Pensamiento truncado — ver \`${context.thoughtContentPath}\`]_`
              : '_[Pensamiento truncado...]_',
          );
          const quoted = truncated
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n');
          parts.push(this.heading(headingLevel, title));
          parts.push(quoted);
          break;
        }
        case 'text': {
          typeCounters.text = (typeCounters.text ?? 0) + 1;
          const counter = typeCounters.text;
          const title = counter > 1 ? `Respuesta (${counter})` : 'Respuesta';
          parts.push(this.heading(headingLevel, title));
          parts.push(seg.blocks.join('\n\n'));
          break;
        }
        case 'toolUse': {
          typeCounters.toolUse = (typeCounters.toolUse ?? 0) + 1;
          const counter = typeCounters.toolUse;
          const title = counter > 1
            ? `Acciones solicitadas (${counter})`
            : 'Acciones solicitadas';
          parts.push(this.heading(headingLevel, title));
          for (const entry of seg.entries) {
            const idStr = entry.id ? `(id: \`${entry.id}\`)` : '';
            if (entry.input !== undefined) {
              const inputJson = JSON.stringify(entry.input, null, 2);
              const indented = inputJson
                .split('\n')
                .map((l) => `  ${l}`)
                .join('\n');
              parts.push(`- **${entry.name}** ${idStr}\n  \`\`\`json\n${indented}\n  \`\`\``);
            } else {
              parts.push(`- **${entry.name}** ${idStr}`);
            }
          }
          break;
        }
      }
    }

    // Renderizado de errores del proveedor (si existen en el step)
    const error = obj.error && typeof obj.error === 'object' && !Array.isArray(obj.error)
      ? obj.error as Record<string, JsonValue>
      : undefined;

    if (error) {
      parts.push(this.heading(headingLevel, 'Error del Proveedor'));
      const msg = error.message ? String(error.message) : 'Error desconocido';
      const code = error.code ? ` (código: ${error.code})` : '';
      parts.push(`**Mensaje:** ${msg}${code}`);

      if (error.metadata && typeof error.metadata === 'object' && !Array.isArray(error.metadata)) {
        const meta = error.metadata as Record<string, JsonValue>;
        if (typeof meta.raw === 'string' && meta.raw) {
          parts.push('**Detalle técnico:**');
          parts.push(`\`\`\`json\n${meta.raw}\n\`\`\``);
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

  /**
   * Genera el heading raíz del documento según el tipo de interacción.
   */
  private buildRootHeading(type: 'request' | 'response', context?: MarkdownRenderContext): string {
    const interactionType = context?.interactionType;
    const subagentType = context?.subagentType;

    if (type === 'request') {
      if (interactionType === 'side-request') return this.heading(1, 'Prompt del Side-request');
      if (interactionType === 'client-preflight') return this.heading(1, 'Prompt del Preflight');
      if (subagentType) return this.heading(1, `Prompt del Subagente (\`${subagentType}\`)`);
      return this.heading(1, 'Prompt del Usuario');
    }

    // response
    if (interactionType === 'side-request') return this.heading(1, 'Respuesta del Side-request');
    if (interactionType === 'client-preflight') return this.heading(1, 'Respuesta del Preflight');
    if (subagentType) return this.heading(1, `Respuesta del Subagente (\`${subagentType}\`)`);
    return this.heading(1, 'Respuesta del Asistente');
  }

  /**
   * Genera un bloque blockquote con metadata contextual para la cabecera del body.parsed.md.
   */
  private renderContextHeader(context?: MarkdownRenderContext): string | undefined {
    if (!context) return undefined;

    const lines: string[] = [];

    if (context.stepIndex !== undefined && context.stepCount !== undefined) {
      const interactionLabel = context.interactionType === 'side-request'
        ? 'Side-request'
        : context.interactionType === 'client-preflight'
          ? 'Preflight'
          : context.subagentType
            ? `Subagente (\`${context.subagentType}\`)`
            : 'Interacción Principal';
      lines.push(`**Interacción:** ${interactionLabel} — Step ${context.stepIndex} de ${context.stepCount}`);
    } else if (context.subagentType) {
      lines.push(`**Tipo:** Subagente (\`${context.subagentType}\`)`);
    }

    if (context.modelId) {
      lines.push(`**Modelo:** ${context.modelId}`);
    }

    if (lines.length === 0) return undefined;

    const blockquote = lines.map((l) => `> ${l}`).join('\n');
    return blockquote;
  }

  /**
   * Genera tabla de contenido para archivos multi-step con más de un step.
   */
  private buildMultiStepToc(
    steps: Array<{ stepIndex: number; parsed: JsonValue }>,
  ): string | undefined {
    if (steps.length <= 1) return undefined;

    const total = steps.length;
    const tocLines: string[] = ['## Contenido', ''];

    for (const { stepIndex, parsed } of steps) {
      const stopReason =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? String((parsed as Record<string, JsonValue>).stop_reason ?? '')
          : '';
      const stepLabel = `Step ${stepIndex} de ${total}${stopReason ? ` — ${stopReason}` : ''}`;
      const stepAnchor = this.githubAnchor(stepLabel);
      tocLines.push(`- [${stepLabel}](#${stepAnchor})`);

      // Detectar si hay thinking en este step para agregar sub-entries
      const content =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? Array.isArray((parsed as Record<string, JsonValue>).content)
            ? ((parsed as Record<string, JsonValue>).content as JsonValue[])
            : []
          : [];
      const hasThinking = content.some(
        (b) => b && typeof b === 'object' && !Array.isArray(b) && (b as Record<string, JsonValue>).type === 'thinking',
      );
      const hasToolUse = content.some(
        (b) => b && typeof b === 'object' && !Array.isArray(b) && (b as Record<string, JsonValue>).type === 'tool_use',
      );
      const hasText = content.some(
        (b) => b && typeof b === 'object' && !Array.isArray(b) && (b as Record<string, JsonValue>).type === 'text',
      );

      if (hasThinking) {
        const label = 'Razonamiento interno';
        tocLines.push(`  - [${label}](#${this.githubAnchor(stepLabel + ' ' + label)})`);
      }
      if (hasToolUse) {
        const label = 'Acciones solicitadas';
        tocLines.push(`  - [${label}](#${this.githubAnchor(stepLabel + ' ' + label)})`);
      }
      if (hasText) {
        const label = 'Respuesta';
        tocLines.push(`  - [${label}](#${this.githubAnchor(stepLabel + ' ' + label)})`);
      }
    }

    tocLines.push('');
    tocLines.push('---');

    return tocLines.join('\n');
  }

  /**
   * Genera un anchor estilo GitHub a partir de un texto.
   * Minúsculas, espacios → guiones, backticks eliminados, — → --.
   */
  private githubAnchor(text: string): string {
    return text
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/—/g, '--')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Detecta si el prompt contiene contenido de Skill y lo renderiza en bloque colapsable.
   * Retorna undefined si no se detecta contenido Skill.
   */
  private detectAndRenderSkillContent(promptText: string): string | undefined {
    const lines = promptText.split('\n');
    if (lines.length === 0) return undefined;

    const firstLine = lines[0].trim();
    if (!firstLine.startsWith('Base directory for this skill:')) return undefined;

    // Extraer nombre de la skill del primer bloque
    const skillNameMatch = firstLine.match(/Base directory for this skill:\s*(.+)/);
    const skillName = skillNameMatch ? skillNameMatch[1].split('/').pop() ?? 'skill' : 'skill';

    // Buscar el final del contenido Skill (doble salto de línea o cambio de bloque)
    // El contenido Skill termina cuando encontramos una línea vacía seguida de contenido no-Skill
    let skillEnd = lines.length;
    let consecutiveEmpty = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) {
          // Dos líneas vacías consecutivas → probable fin del contenido Skill
          // Retroceder para incluir solo hasta antes de las líneas vacías
          skillEnd = i - 1;
          break;
        }
      } else {
        consecutiveEmpty = 0;
      }
    }

    // Si no encontramos un fin claro, usar todas las líneas
    const skillContent = lines.slice(0, skillEnd).join('\n');
    const lineCount = skillEnd;

    return [
      `### Contenido inyectado por Skill: ${skillName}`,
      '',
      '<details>',
      `<summary>Ver contenido de la Skill (${lineCount} líneas)</summary>`,
      '',
      skillContent,
      '',
      '</details>',
    ].join('\n');
  }

  /**
   * Extrae el texto del prompt que está después del bloque Skill.
   * Retorna undefined si no hay texto adicional.
   */
  private extractTextAfterSkill(promptText: string): string | undefined {
    const lines = promptText.split('\n');
    if (lines.length === 0) return undefined;

    const firstLine = lines[0].trim();
    if (!firstLine.startsWith('Base directory for this skill:')) return undefined;

    // Buscar el fin del contenido Skill
    let skillEnd = 0;
    let consecutiveEmpty = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) {
          skillEnd = i + 1;
          break;
        }
      } else {
        consecutiveEmpty = 0;
      }
    }

    if (skillEnd === 0) skillEnd = lines.length;

    const remaining = lines.slice(skillEnd).join('\n').trim();
    return remaining || undefined;
  }

  public renderWorkflowIndexMarkdown(workflow: WorkflowIndex): string {
    const parts: string[] = [this.heading(1, '📊 Índice de Workflow')];

    // Información general
    parts.push(this.heading(2, 'Información General'));
    parts.push(`**Tipo:** ${workflow.interactionType}`);
    parts.push(`**Sesión:** \`${workflow.sessionId}\``);
    if (workflow.modelId) parts.push(`**Modelo:** ${workflow.modelId}`);
    parts.push(`**Resultado:** ${workflow.outcome}`);
    parts.push(`**Duración:** ${this.formatDuration(workflow.durationMs)}`);
    parts.push(`**Steps:** ${workflow.stepCount}`);

    // Resumen de steps
    parts.push(this.heading(2, 'Steps'));
    for (const step of workflow.steps) {
      parts.push(this.heading(3, `Step ${step.stepIndex}`));
      parts.push(`**SSE:** ${step.sse ? 'Sí' : 'No'}`);
      if (step.stopReason) parts.push(`**Stop Reason:** ${step.stopReason}`);
      if (step.toolCalls && step.toolCalls.length > 0) parts.push(`**Herramientas:** ${step.toolCalls.join(', ')}`);
      if (step.inputTokens !== undefined || step.outputTokens !== undefined) {
        parts.push(`**Tokens:** ${step.inputTokens ?? 0} input, ${step.outputTokens ?? 0} output`);
      }
      if (step.isCoalesced) parts.push(`**Coalesced:** Sí (invocó subagentes)`);
    }

    // Resumen de subagentes
    if (workflow.subagents && workflow.subagents.length > 0) {
      parts.push(this.heading(2, 'Subagentes'));
      for (const subagent of workflow.subagents) {
        parts.push(this.heading(3, `Subagente ${subagent.index}`));
        parts.push(`**Directorio:** \`${subagent.dirName}\``);
        if (subagent.toolUseId) parts.push(`**Tool Use ID:** \`${subagent.toolUseId}\``);
        if (subagent.subagentType) parts.push(`**Tipo:** ${subagent.subagentType}`);
        parts.push(`**Resultado:** ${subagent.outcome}`);
        parts.push(`**Duración:** ${this.formatDuration(subagent.durationMs)}`);
        parts.push(`**Steps:** ${subagent.stepCount}`);
        if (subagent.toolCalls && subagent.toolCalls.length > 0) parts.push(`**Herramientas:** ${subagent.toolCalls.join(', ')}`);
        parts.push(`**Tokens:** ${subagent.inputTokens} input, ${subagent.outputTokens} output`);
      }
    }

    // Resumen de herramientas internas resueltas
    if (workflow.resolvedInternalTools && workflow.resolvedInternalTools.length > 0) {
      parts.push(this.heading(2, 'Herramientas Internas Resueltas'));
      for (const tool of workflow.resolvedInternalTools) {
        parts.push(`- **${tool.toolName}** (ID: \`${tool.toolUseId}\`): Step ${tool.originalStepIndex} → ${tool.resolutionMode}${tool.resolvedInStepIndex ? ` (resuelto en step ${tool.resolvedInStepIndex})` : ''}`);
      }
    }

    // Anomalías
    const hasAnomalies =
      (workflow.anomalies.lostPendingAgents && workflow.anomalies.lostPendingAgents.length > 0) ||
      (workflow.anomalies.lostPendingWebSearch && workflow.anomalies.lostPendingWebSearch.length > 0) ||
      (workflow.anomalies.lostPendingWebFetch && workflow.anomalies.lostPendingWebFetch.length > 0);

    if (hasAnomalies) {
      parts.push(this.heading(2, '⚠️ Anomalías'));
      if (workflow.anomalies.lostPendingAgents && workflow.anomalies.lostPendingAgents.length > 0) {
        parts.push(`**Agent tool_uses perdidos:** ${workflow.anomalies.lostPendingAgents.map((p) => p.toolUseId).join(', ')}`);
      }
      if (workflow.anomalies.lostPendingWebSearch && workflow.anomalies.lostPendingWebSearch.length > 0) {
        parts.push(`**WebSearch tool_uses perdidos:** ${workflow.anomalies.lostPendingWebSearch.map((p) => p.toolUseId).join(', ')}`);
      }
      if (workflow.anomalies.lostPendingWebFetch && workflow.anomalies.lostPendingWebFetch.length > 0) {
        parts.push(`**WebFetch tool_uses perdidos:** ${workflow.anomalies.lostPendingWebFetch.map((p) => p.toolUseId).join(', ')}`);
      }
    }

    return parts.join('\n\n');
  }
}
