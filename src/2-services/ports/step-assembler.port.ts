import type { AnthropicMessage, AnthropicUsage } from '../../1-domain/types/anthropic.types.js';

export interface AssembledToolUseBlock {
  id: string;
  name: string;
  input: unknown;
  subagentType?: string;
  description?: string;
  prompt?: string;
}

export interface AssembledInference {
  assistantMessage: AnthropicMessage;
  usage: AnthropicUsage;
  stopReason?: string;
  model?: string;
  anthropicMessageId?: string;
  toolUseBlocks: AssembledToolUseBlock[];
  /** Textos de bloques thinking ensamblados (orden de aparición). */
  thinkingTexts: string[];
}

export interface IStepAssembler {
  onEvent(evt: unknown): void;
  result(): AssembledInference;
}
