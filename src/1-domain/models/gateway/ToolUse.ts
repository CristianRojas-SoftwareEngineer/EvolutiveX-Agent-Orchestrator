import type { AnthropicContentBlock } from '../../types/anthropic.types.js';
import type { ToolUseStatus } from '../../types/gateway/tool-use.types.js';
import type { IToolUse } from '../../interfaces/gateway/IToolUse.js';

export class ToolUse implements IToolUse {
  id: string;
  stepId: string;
  name: string;
  arguments: unknown;
  status: ToolUseStatus;
  toolUseBlock: AnthropicContentBlock;
  toolResultBlock?: AnthropicContentBlock;
  childWorkflowId?: string;
  startedAt?: Date;
  completedAt?: Date;

  constructor(data: IToolUse) {
    this.id = data.id;
    this.stepId = data.stepId;
    this.name = data.name;
    this.arguments = data.arguments;
    this.status = data.status;
    this.toolUseBlock = data.toolUseBlock;
    this.toolResultBlock = data.toolResultBlock;
    this.childWorkflowId = data.childWorkflowId;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
  }

  /** Indica si este tool_use corresponde a un subagente Agent. */
  isSubagent(): boolean {
    return this.name === 'Agent';
  }

  /** Transiciona el estado a 'running'. */
  markRunning(): void {
    this.status = 'running';
    this.startedAt = new Date();
  }

  /** Completa el tool_use con su resultado. */
  complete(resultBlock: AnthropicContentBlock): void {
    this.toolResultBlock = resultBlock;
    this.status = 'completed';
    this.completedAt = new Date();
  }
}
