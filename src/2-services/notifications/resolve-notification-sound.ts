// Traduce el perfil de sonido del catálogo al valor que acepta node-notifier por SO.
import type { NotificationSoundProfile } from './event-notification-profile.js';

export function resolveNotificationSound(
  profile: NotificationSoundProfile | undefined,
  platform: NodeJS.Platform,
): boolean | string {
  if (!profile) {
    return false;
  }
  if (platform === 'win32') {
    const token = profile.win32;
    if (token === false || token === undefined) {
      return false;
    }
    return token;
  }
  if (platform === 'darwin') {
    const name = profile.darwin;
    if (name === false || name === undefined) {
      return false;
    }
    return name;
  }
  if (platform === 'linux') {
    return profile.linux === true;
  }
  return false;
}
