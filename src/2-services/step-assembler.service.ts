import type { AnthropicContentBlock, AnthropicMessage } from '../1-domain/types/anthropic.types.js';
import type {
  AssembledInference,
  AssembledToolUseBlock,
  IStepAssembler,
} from './ports/step-assembler.port.js';

interface ToolUseTracker {
  id: string;
  name: string;
  jsonAcc: string;
}

interface ThinkingTracker {
  textAcc: string;
}

/**
 * Ensambla en RAM la respuesta de una inferencia SSE Anthropic (StepBuffer §26).
 * Efímero por inferencia: instanciar uno por stream.
 */
export class StepAssemblerService implements IStepAssembler {
  private stopReason: string | null = null;
  private anthropicMessageId: string | undefined;
  private model: string | undefined;
  private readonly usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  private readonly toolUseTracker = new Map<number, ToolUseTracker>();
  private readonly thinkingTracker = new Map<number, ThinkingTracker>();
  private readonly thinkingTexts: string[] = [];
  private readonly toolUseBlocks: AssembledToolUseBlock[] = [];

  public onEvent(evt: unknown): void {
    if (!evt || typeof evt !== 'object') return;
    const e = evt as Record<string, unknown>;

    if (e.type === 'message_delta' && (e.delta as Record<string, unknown>)?.stop_reason) {
      this.stopReason = (e.delta as Record<string, unknown>).stop_reason as string;
    }
    if (e.type === 'message_stop' && !this.stopReason && e.stop_reason) {
      this.stopReason = e.stop_reason as string;
    }
    if (e.type === 'message_start' && e.message) {
      const message = e.message as Record<string, unknown>;
      if (typeof message.id === 'string') {
        this.anthropicMessageId = message.id;
      }
      if (typeof message.model === 'string') {
        this.model = message.model;
      }
      const msgUsage = message.usage as Record<string, unknown> | undefined;
      if (msgUsage) {
        this.usage.input_tokens = (msgUsage.input_tokens as number) ?? 0;
        this.usage.cache_creation_input_tokens =
          (msgUsage.cache_creation_input_tokens as number) ?? 0;
        this.usage.cache_read_input_tokens = (msgUsage.cache_read_input_tokens as number) ?? 0;
      }
    }
    if (e.type === 'message_delta' && e.usage) {
      const deltaUsage = e.usage as Record<string, unknown>;
      this.usage.output_tokens = (deltaUsage.output_tokens as number) ?? 0;
      if (!this.usage.input_tokens && deltaUsage.input_tokens) {
        this.usage.input_tokens = deltaUsage.input_tokens as number;
      }
      if (!this.usage.cache_creation_input_tokens && deltaUsage.cache_creation_input_tokens) {
        this.usage.cache_creation_input_tokens = deltaUsage.cache_creation_input_tokens as number;
      }
      if (!this.usage.cache_read_input_tokens && deltaUsage.cache_read_input_tokens) {
        this.usage.cache_read_input_tokens = deltaUsage.cache_read_input_tokens as number;
      }
    }

    if (
      e.type === 'content_block_start' &&
      (e.content_block as Record<string, unknown>)?.type === 'thinking' &&
      typeof e.index === 'number'
    ) {
      this.thinkingTracker.set(e.index, { textAcc: '' });
    }
    if (
      e.type === 'content_block_delta' &&
      (e.delta as Record<string, unknown>)?.type === 'thinking_delta' &&
      typeof e.index === 'number' &&
      typeof (e.delta as Record<string, unknown>).thinking === 'string'
    ) {
      const tracked = this.thinkingTracker.get(e.index);
      if (tracked) {
        tracked.textAcc += (e.delta as Record<string, unknown>).thinking as string;
      }
    }

    if (e.type === 'content_block_start' && (e.content_block as Record<string, unknown>)?.type === 'tool_use') {
      const block = e.content_block as Record<string, unknown>;
      if (typeof e.index === 'number' && typeof block.id === 'string' && typeof block.name === 'string') {
        this.toolUseTracker.set(e.index, {
          id: block.id,
          name: block.name,
          jsonAcc: '',
        });
      }
    }
    if (
      e.type === 'content_block_delta' &&
      (e.delta as Record<string, unknown>)?.type === 'input_json_delta' &&
      typeof e.index === 'number' &&
      typeof (e.delta as Record<string, unknown>).partial_json === 'string'
    ) {
      const tracked = this.toolUseTracker.get(e.index);
      if (tracked) {
        tracked.jsonAcc += (e.delta as Record<string, unknown>).partial_json as string;
      }
    }

    if (e.type === 'content_block_stop' && typeof e.index === 'number') {
      const toolTracked = this.toolUseTracker.get(e.index);
      if (toolTracked) {
        let input: unknown = {};
        let subagentType: string | undefined;
        let description: string | undefined;
        let prompt: string | undefined;
        try {
          const inputObj = JSON.parse(toolTracked.jsonAcc) as Record<string, unknown>;
          input = inputObj;
          if (typeof inputObj.subagent_type === 'string') {
            subagentType = inputObj.subagent_type;
          }
          if (typeof inputObj.description === 'string') {
            description = inputObj.description;
          }
          if (typeof inputObj.prompt === 'string') {
            prompt = inputObj.prompt;
          }
        } catch {
          /* JSON parcial inválido */
        }
        this.toolUseBlocks.push({
          id: toolTracked.id,
          name: toolTracked.name,
          input,
          ...(subagentType ? { subagentType } : {}),
          ...(description ? { description } : {}),
          ...(prompt ? { prompt } : {}),
        });
        this.toolUseTracker.delete(e.index);
      }

      const thinkingTracked = this.thinkingTracker.get(e.index);
      if (thinkingTracked) {
        if (thinkingTracked.textAcc) {
          this.thinkingTexts.push(thinkingTracked.textAcc);
        }
        this.thinkingTracker.delete(e.index);
      }
    }
  }

  public result(): AssembledInference {
    const content: AnthropicContentBlock[] = [];

    for (const text of this.thinkingTexts) {
      content.push({ type: 'thinking', thinking: text });
    }
    for (const block of this.toolUseBlocks) {
      content.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }

    const assistantMessage: AnthropicMessage = {
      role: 'assistant',
      content,
    };

    return {
      assistantMessage,
      usage: { ...this.usage },
      ...(this.stopReason ? { stopReason: this.stopReason } : {}),
      ...(this.model ? { model: this.model } : {}),
      ...(this.anthropicMessageId ? { anthropicMessageId: this.anthropicMessageId } : {}),
      toolUseBlocks: [...this.toolUseBlocks],
      thinkingTexts: [...this.thinkingTexts],
    };
  }
}
