import type { ClaudeHookEvent } from '../../types/hook.types.js';

/**
 * Passthrough de `hook.lastAssistantMessage`.
 * Vacío o ausente → `undefined`. Sin derivación desde wire ni join de bloques (§15.8).
 */
export function deriveFinalText(hook: ClaudeHookEvent): string | undefined {
  const raw = hook.lastAssistantMessage;
  if (raw == null || raw.trim() === '') return undefined;
  return raw;
}
