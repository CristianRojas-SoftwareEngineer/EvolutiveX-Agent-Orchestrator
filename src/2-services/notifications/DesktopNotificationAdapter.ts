// Adaptador concreto que delega en node-notifier (capa 2 PKA).
// v1: subset mínimo de opciones; sin .lnk, sin SnoreToast, sin heroImage,
// sin defaultIcon, sin brandTitle. Solo reenvía `appId` e `icon` si vienen
// en el evento (el branding lo inyecta la CLI, no el adaptador).
//
// IMPORTANTE: `node-notifier` v10 usa la clave `appID` (con "ID" en
// mayúsculas) en su `allowedToasterFlags` (lib/utils.js). Si pasamos
// `appId` (camelCase), `node-notifier` lo ignora silenciosamente y
// SnoreToast recibe su AUMID por defecto "SnoreToast", por lo que
// Windows firma los toasts como "SnoreToast" en lugar de "AI
// Assistant". La traducción a `appID` ocurre aquí para preservar la
// API pública idiomática (`appId` camelCase) sin acoplar el
// dominio al quirk de nomenclatura de `node-notifier`.
import notifier from 'node-notifier';
import type { INotificationService } from './INotificationService.js';
import type { NotificationEvent } from './types.js';

/**
 * Opciones que DesktopNotificationAdapter pasa a node-notifier.
 * El campo `wait` se acota a `false` para no bloquear el CLI; cualquier
 * otro campo de node-notifier queda fuera del contrato en v1.
 *
 * `appID` (mayúsculas) es la clave que `node-notifier` reconoce para
 * el `-appID` de SnoreToast. Ver nota al inicio del archivo.
 */
interface NodeNotifierOptions {
  title: string;
  message: string;
  sound?: boolean;
  wait: false;
  appID?: string;
  icon?: string;
}

export class DesktopNotificationAdapter implements INotificationService {
  /**
   * Traduce `silent: true` a `sound: false` para silenciar el toast.
   * Copia `appId` (dominio, camelCase) → `appID` (node-notifier, con
   * mayúsculas) SOLO si está presente en el evento (degradación con
   * gracia). Copia `icon` con el mismo criterio. Cualquier otro campo
   * del evento se ignora intencionalmente.
   */
  notify(event: NotificationEvent): Promise<void> {
    const options: NodeNotifierOptions = {
      title: event.title,
      message: event.message,
      sound: event.silent === true ? false : event.sound ?? false,
      wait: false,
    };
    if (event.appId !== undefined) options.appID = event.appId;
    if (event.icon !== undefined) options.icon = event.icon;
    return new Promise<void>((resolve, reject) => {
      notifier.notify(options, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
