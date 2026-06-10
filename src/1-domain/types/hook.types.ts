// Nombres de evento del lifecycle de hooks de Claude Code (C3 §borde hooks)
export type HookEventName =
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Stop'
  | 'StopFailure'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PermissionRequest'
  | 'TaskCreated'
  | 'TaskCompleted'
  | (string & {});

export interface ClaudeHookEvent {
  eventName: HookEventName;
  sessionId: string;
  toolUseId?: string;
  agentId?: string;
  stopHookActive?: boolean;
  backgroundTasks?: number;
  lastAssistantMessage?: string;
  /** Ruta al transcript JSONL de la sesión, proporcionada por Claude Code en los hooks Stop/StopFailure/UserPromptSubmit. */
  transcriptPath?: string;
  /** Nombre de la tool invocada (PreToolUse, PostToolUse, PermissionRequest). */
  toolName?: string;
  /** Input de la tool como objeto opaco (PreToolUse, PostToolUse, PermissionRequest). */
  toolInput?: Record<string, unknown>;
  /** Texto del prompt en UserPromptSubmit. */
  prompt?: string;
}

// Mapea el payload wire (snake_case) al tipo interno (camelCase).
// No lanza: payload inválido produce eventName='' y sessionId=''.
export function parseHookEvent(payload: unknown): ClaudeHookEvent {
  if (typeof payload !== 'object' || payload === null) {
    return { eventName: '', sessionId: '' };
  }

  const p = payload as Record<string, unknown>;

  const eventName = typeof p['hook_event_name'] === 'string' ? p['hook_event_name'] : '';
  const sessionId = typeof p['session_id'] === 'string' ? p['session_id'] : '';
  const toolUseId = typeof p['tool_use_id'] === 'string' ? p['tool_use_id'] : undefined;
  const agentId = typeof p['agent_id'] === 'string' ? p['agent_id'] : undefined;
  const stopHookActive =
    typeof p['stop_hook_active'] === 'boolean' ? p['stop_hook_active'] : undefined;
  const backgroundTasks =
    typeof p['background_tasks'] === 'number' ? p['background_tasks'] : undefined;
  const lastAssistantMessage =
    typeof p['last_assistant_message'] === 'string' ? p['last_assistant_message'] : undefined;
  const transcriptPath =
    typeof p['transcript_path'] === 'string' ? p['transcript_path'] : undefined;
  const toolName = typeof p['tool_name'] === 'string' ? p['tool_name'] : undefined;
  const toolInput =
    typeof p['tool_input'] === 'object' && p['tool_input'] !== null
      ? (p['tool_input'] as Record<string, unknown>)
      : undefined;
  const prompt = typeof p['prompt'] === 'string' ? p['prompt'] : undefined;

  return {
    eventName,
    sessionId,
    toolUseId,
    agentId,
    stopHookActive,
    backgroundTasks,
    lastAssistantMessage,
    transcriptPath,
    toolName,
    toolInput,
    prompt,
  };
}
