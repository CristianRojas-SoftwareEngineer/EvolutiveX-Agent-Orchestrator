import type {
  WorkflowCloseAuthority,
  WorkflowKind,
  WorkflowStatus,
} from '../../types/gateway/workflow.types.js';
import type { IWorkflow } from '../../interfaces/gateway/IWorkflow.js';
import type { IStep } from '../../interfaces/gateway/IStep.js';
import type { IWorkflowResult } from '../../interfaces/gateway/IWorkflowResult.js';

export class Workflow implements IWorkflow {
  id: string;
  sessionId: string;
  kind: WorkflowKind;
  closeAuthority: WorkflowCloseAuthority;
  agentType?: string;
  agentId?: string;
  prompt?: string;
  status: WorkflowStatus;
  steps: IStep[];
  result?: IWorkflowResult;
  transcriptPath?: string;
  parentWorkflowId?: string;
  parentToolUseId?: string;
  startedAt: Date;
  completedAt?: Date;

  constructor(data: IWorkflow) {
    this.id = data.id;
    this.sessionId = data.sessionId;
    this.kind = data.kind;
    this.closeAuthority = data.closeAuthority;
    this.agentType = data.agentType;
    this.agentId = data.agentId;
    this.prompt = data.prompt;
    this.status = data.status;
    this.steps = data.steps;
    this.result = data.result;
    this.transcriptPath = data.transcriptPath;
    this.parentWorkflowId = data.parentWorkflowId;
    this.parentToolUseId = data.parentToolUseId;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
  }

  /** Añade un step al workflow. */
  addStep(step: IStep): void {
    this.steps.push(step);
  }

  /** Indica si es un sub-workflow (tiene padre). */
  isSubWorkflow(): boolean {
    return this.kind === 'subagent';
  }

  /** Indica si algún step tiene tool calls. */
  hasToolCalls(): boolean {
    return this.steps.some((s) => s.toolUses.length > 0);
  }
}
