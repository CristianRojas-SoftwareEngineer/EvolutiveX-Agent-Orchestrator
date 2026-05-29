import type { WorkflowKind, WorkflowStatus } from '../../types/gateway/workflow.types.js';
import type { IStep } from './IStep.js';
import type { IWorkflowResult } from './IWorkflowResult.js';

/** Workflow serializable: ejecución E2E desde input de usuario hasta cierre del turno. */
export interface IWorkflow {
  /** Identificador del workflow. */
  id: string;
  /** Sesión a la que pertenece. */
  sessionId: string;
  /** Clasificación: principal del usuario o subagente. */
  kind: WorkflowKind;
  /** Tipo de agente (de hook `agent_type` / `SubagentStart`). */
  agentType?: string;
  /** ID del agente (de hook `agent_id` para subagentes). */
  agentId?: string;
  /** ID del modelo de lenguaje dominante en los steps. */
  languageModelId?: string;
  /** Prompt del usuario o input del subagente. */
  prompt?: string;
  /** Estado del ciclo de vida. */
  status: WorkflowStatus;
  /** Steps correlacionados en orden. */
  steps: IStep[];
  /** Snapshot inmutable al cierre del workflow. */
  result?: IWorkflowResult;
  /** Ruta al transcript del orquestador; reconciliación opcional. */
  transcriptPath?: string;
  /** ID del workflow padre. Obligatorio en sub-workflows (invariante G5). */
  parentWorkflowId?: string;
  /** ID del `ToolUse` que disparó el spawn. Obligatorio en sub-workflows (invariante G5). */
  parentToolUseId?: string;
  /** Momento de apertura del workflow. */
  startedAt: Date;
  /** Momento de cierre del workflow. */
  completedAt?: Date;
}
