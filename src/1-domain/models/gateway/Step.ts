import type {
  AnthropicMessage,
  AnthropicRequest,
  AnthropicUsage,
} from '../../types/anthropic.types.js';
import type { IStep } from '../../interfaces/gateway/IStep.js';
import type { IToolUse } from '../../interfaces/gateway/IToolUse.js';

export class Step implements IStep {
  id: string;
  workflowId: string;
  index: number;
  inferenceRequest: AnthropicRequest;
  assistantMessage: AnthropicMessage;
  toolUses: IToolUse[];
  usage?: AnthropicUsage;
  stopReason?: string;
  startedAt: Date;
  closedAt?: Date;

  constructor(data: IStep) {
    this.id = data.id;
    this.workflowId = data.workflowId;
    this.index = data.index;
    this.inferenceRequest = data.inferenceRequest;
    this.assistantMessage = data.assistantMessage;
    this.toolUses = data.toolUses;
    this.usage = data.usage;
    this.stopReason = data.stopReason;
    this.startedAt = data.startedAt;
    this.closedAt = data.closedAt;
  }

  /** Indica si el step tiene al menos un tool call. */
  hasToolCalls(): boolean {
    return this.toolUses.length > 0;
  }

  /** Indica si el step terminó con un stop_reason terminal (no tool_use). */
  isTerminal(): boolean {
    return this.stopReason !== 'tool_use' && this.closedAt != null;
  }
}
