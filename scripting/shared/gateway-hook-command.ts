import { buildNpxTsxCommand } from './npx-tsx-command.js';

export const POST_HOOK_EVENT_SEGMENT = 'scripting/post-hook-event.ts';
export const STOP_HOOK_UX_SEGMENT = 'scripting/stop-hook-ux.ts';
export const GATEWAY_HOOK_NOTIFY_SEGMENT = 'scripting/gateway-hook-notify.ts';
export const PRE_TOOL_USE_HOOK_UX_SEGMENT = 'scripting/pre-tool-use-hook-ux.ts';

/** Comando para hooks del proyecto cuando el cwd es la raíz del repo. */
export const PROJECT_GATEWAY_HOOK_COMMAND = `npx tsx ${POST_HOOK_EVENT_SEGMENT}`;

const LEGACY_CURL_MARKERS = ['--data-binary @-', "ANTHROPIC_BASE_URL/hooks"] as const;

export function buildGatewayHookRelayCommand(proxyRoot: string): string {
  return buildNpxTsxCommand(proxyRoot, POST_HOOK_EVENT_SEGMENT);
}

/** Stop: gateway + toasts (un solo proceso; evita stdin vacío con hooks paralelos). */
export function buildStopHookUxCommand(proxyRoot: string): string {
  return buildNpxTsxCommand(proxyRoot, STOP_HOOK_UX_SEGMENT);
}

/** POST /hooks + toast con stdin-json en un solo proceso (UserPromptSubmit, StopFailure). */
export function buildGatewayHookNotifyCommand(
  proxyRoot: string,
  eventType: 'UserPromptSubmit' | 'StopFailure',
): string {
  return `${buildNpxTsxCommand(proxyRoot, GATEWAY_HOOK_NOTIFY_SEGMENT)} --event-type ${eventType}`;
}

export function buildPreToolUseHookUxCommand(proxyRoot: string): string {
  return buildNpxTsxCommand(proxyRoot, PRE_TOOL_USE_HOOK_UX_SEGMENT);
}

export function isGatewayHookRelayCommand(command: string | undefined): boolean {
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/');
  if (normalized.includes(POST_HOOK_EVENT_SEGMENT)) return true;
  return LEGACY_CURL_MARKERS.every((m) => normalized.includes(m.replace(/\\/g, '/')));
}
