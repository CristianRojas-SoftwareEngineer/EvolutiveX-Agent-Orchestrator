import { describe, it, expect } from 'vitest';
import { resolveNotificationSound } from '../../../src/2-services/notifications/resolve-notification-sound.js';
import { getProfileForEvent } from '../../../src/2-services/notifications/event-notification-profile.js';

describe('resolveNotificationSound', () => {
  it('StopFailure en win32 devuelve Notification.Looping.Alarm7', () => {
    const sound = getProfileForEvent('StopFailure')?.sound;
    expect(resolveNotificationSound(sound, 'win32')).toBe('Notification.Looping.Alarm7');
  });

  it('PreToolUse en win32 devuelve Notification.SMS (no token BurntToast crudo)', () => {
    const sound = getProfileForEvent('PreToolUse')?.sound;
    expect(resolveNotificationSound(sound, 'win32')).toBe('Notification.SMS');
  });

  it('SubagentStart en darwin devuelve Ping', () => {
    const sound = getProfileForEvent('SubagentStart')?.sound;
    expect(resolveNotificationSound(sound, 'darwin')).toBe('Ping');
  });

  it('PermissionRequest en linux devuelve true sin string', () => {
    const sound = getProfileForEvent('PermissionRequest')?.sound;
    const resolved = resolveNotificationSound(sound, 'linux');
    expect(resolved).toBe(true);
    expect(typeof resolved).toBe('boolean');
  });

  it('StopFailure en linux devuelve true, no LoopingAlarm7', () => {
    const sound = getProfileForEvent('StopFailure')?.sound;
    expect(resolveNotificationSound(sound, 'linux')).toBe(true);
  });

  it('perfil undefined devuelve false', () => {
    expect(resolveNotificationSound(undefined, 'win32')).toBe(false);
  });
});
