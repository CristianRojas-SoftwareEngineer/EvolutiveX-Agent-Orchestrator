import type { AnthropicContentBlock } from '../../types/anthropic.types.js';
import type {
  ToolCompletionAuthority,
  ToolUseStatus,
} from '../../types/gateway/tool-use.types.js';

/** Registro de observabilidad de una invocación de herramienta. */
export interface IToolUse {
  /** Coincide con el `id` del bloque `tool_use` / `tool_use_id` en hooks. */
  id: string;
  /** Step al que pertenece. */
  stepId: string;
  /** Nombre de la herramienta (Bash, Read, Agent, …). */
  name: string;
  /** Input del bloque `tool_use` (dinámico). */
  arguments: unknown;
  /** Estado de resolución. */
  status: ToolUseStatus;
  /** Canal canónico de completación; asignado al registrar en el repositorio. */
  completionAuthority?: ToolCompletionAuthority;
  /** Bloque `type: 'tool_use'` del mensaje assistant. */
  toolUseBlock: AnthropicContentBlock;
  /** Bloque `type: 'tool_result'` con el resultado. Ausente hasta completar. */
  toolResultBlock?: AnthropicContentBlock;
  /** Resultado normalizado del tool (de hook `PostToolUse`/`PostToolUseFailure` o timeout). */
  result?: { isError: boolean; result: unknown };
  /** ID del sub-workflow hijo. Solo si `name === 'Agent'` y se correlacionó. */
  childWorkflowId?: string;
  /** Momento en que se inició la ejecución. */
  startedAt?: Date;
  /** Momento en que se completó. */
  completedAt?: Date;
}
