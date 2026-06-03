// Catálogo de perfiles por evento: imagen de cuerpo + sonido por plataforma.
// Fuente auditiva Windows: paridad con claude-notifications-enhanced.ps1 ($DefaultEventConfig).

export type SoundSemanticLevel = 'neutral' | 'message' | 'activity' | 'attention' | 'alarm';

export interface NotificationSoundProfile {
  win32?: string | false;
  darwin?: string | false;
  linux?: boolean;
}

export interface EventNotificationProfile {
  image: string;
  level: SoundSemanticLevel;
  sound: NotificationSoundProfile;
}

export const EVENT_NOTIFICATION_PROFILES: Record<string, EventNotificationProfile> = {
  UserPromptSubmit: {
    image: 'user-prompt-submit.png',
    level: 'message',
    sound: { win32: 'Reminder', darwin: 'Submarine', linux: true },
  },
  PreToolUse: {
    image: 'pre-tool-use-ask.png',
    level: 'attention',
    sound: { win32: 'SMS', darwin: 'Hero', linux: true },
  },
  SubagentStart: {
    image: 'subagent-start.png',
    level: 'activity',
    sound: { win32: 'IM', darwin: 'Ping', linux: true },
  },
  SubagentStop: {
    image: 'subagent-stop.png',
    level: 'neutral',
    sound: { win32: 'Default', darwin: 'Tink', linux: true },
  },
  Stop: {
    image: 'stop.png',
    level: 'activity',
    sound: { win32: 'IM', darwin: 'Ping', linux: true },
  },
  StopFailure: {
    image: 'stop-failure.png',
    level: 'alarm',
    sound: { win32: 'LoopingAlarm7', darwin: 'Basso', linux: true },
  },
  SessionStart: {
    image: 'session-start.png',
    level: 'neutral',
    sound: { win32: 'Default', darwin: 'Tink', linux: true },
  },
  SessionEnd: {
    image: 'session-end.png',
    level: 'neutral',
    sound: { win32: 'Default', darwin: 'Tink', linux: true },
  },
  PermissionRequest: {
    image: 'permission-request.png',
    level: 'attention',
    sound: { win32: 'SMS', darwin: 'Hero', linux: true },
  },
  TaskCreated: {
    image: 'task-created.png',
    level: 'message',
    sound: { win32: 'Reminder', darwin: 'Submarine', linux: true },
  },
  TaskCompleted: {
    image: 'task-completed.png',
    level: 'neutral',
    sound: { win32: 'Default', darwin: 'Tink', linux: true },
  },
};

export const NOTIFICATION_EVENT_KEYS = Object.keys(EVENT_NOTIFICATION_PROFILES);

export function getProfileForEvent(eventKey: string): EventNotificationProfile | undefined {
  return EVENT_NOTIFICATION_PROFILES[eventKey];
}
