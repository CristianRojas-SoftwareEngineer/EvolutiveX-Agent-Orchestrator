// Adaptador concreto que delega en node-notifier (capa 2 PKA).
// v1: subset mínimo de opciones; sin personalización (sin icon, sin AUMID,
// sin .lnk, sin SnoreToast, sin heroImage, sin defaultIcon, sin brandTitle).
import notifier from 'node-notifier';
import type { INotificationService } from './INotificationService.js';
import type { NotificationEvent } from './types.js';

/**
 * Opciones que DesktopNotificationAdapter pasa a node-notifier.
 * El campo `wait` se acota a `false` para no bloquear el CLI; cualquier
 * otro campo de node-notifier queda fuera del contrato en v1.
 */
interface NodeNotifierOptions {
  title: string;
  message: string;
  sound?: boolean;
  wait: false;
}

export class DesktopNotificationAdapter implements INotificationService {
  /**
   * Traduce `silent: true` a `sound: false` para silenciar el toast.
   * Cualquier otro campo del evento se ignora intencionalmente.
   */
  notify(event: NotificationEvent): Promise<void> {
    const options: NodeNotifierOptions = {
      title: event.title,
      message: event.message,
      sound: event.silent === true ? false : event.sound ?? false,
      wait: false,
    };
    return new Promise<void>((resolve, reject) => {
      notifier.notify(options, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
