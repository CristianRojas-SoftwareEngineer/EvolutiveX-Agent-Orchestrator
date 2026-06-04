import { buildNpxTsxCommand } from './npx-tsx-command.js';

export const POST_HOOK_EVENT_SEGMENT = 'scripting/post-hook-event.ts';

/** Comando para hooks del proyecto cuando el cwd es la raíz del repo. */
export const PROJECT_GATEWAY_HOOK_COMMAND = `npx tsx ${POST_HOOK_EVENT_SEGMENT}`;

const LEGACY_CURL_MARKERS = ['--data-binary @-', "ANTHROPIC_BASE_URL/hooks"] as const;

export function buildGatewayHookRelayCommand(proxyRoot: string): string {
  return buildNpxTsxCommand(proxyRoot, POST_HOOK_EVENT_SEGMENT);
}

export function isGatewayHookRelayCommand(command: string | undefined): boolean {
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/');
  if (normalized.includes(POST_HOOK_EVENT_SEGMENT)) return true;
  return LEGACY_CURL_MARKERS.every((m) => normalized.includes(m.replace(/\\/g, '/')));
}
