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
  | (string & {});

export interface ClaudeHookEvent {
  eventName: HookEventName;
  sessionId: string;
  toolUseId?: string;
  agentId?: string;
  stopHookActive?: boolean;
  backgroundTasks?: number;
  lastAssistantMessage?: string;
}

// Mapea el payload wire (snake_case) al tipo interno (camelCase).
// No lanza: payload inválido produce eventName='' y sessionId=''.
export function parseHookEvent(payload: unknown): ClaudeHookEvent {
  if (typeof payload !== 'object' || payload === null) {
    return { eventName: '', sessionId: '' };
  }

  const p = payload as Record<string, unknown>;

  const eventName =
    typeof p['hook_event_name'] === 'string' ? p['hook_event_name'] : '';
  const sessionId =
    typeof p['session_id'] === 'string' ? p['session_id'] : '';
  const toolUseId =
    typeof p['tool_use_id'] === 'string' ? p['tool_use_id'] : undefined;
  const agentId =
    typeof p['agent_id'] === 'string' ? p['agent_id'] : undefined;
  const stopHookActive =
    typeof p['stop_hook_active'] === 'boolean' ? p['stop_hook_active'] : undefined;
  const backgroundTasks =
    typeof p['background_tasks'] === 'number' ? p['background_tasks'] : undefined;
  const lastAssistantMessage =
    typeof p['last_assistant_message'] === 'string'
      ? p['last_assistant_message']
      : undefined;

  return { eventName, sessionId, toolUseId, agentId, stopHookActive, backgroundTasks, lastAssistantMessage };
}
