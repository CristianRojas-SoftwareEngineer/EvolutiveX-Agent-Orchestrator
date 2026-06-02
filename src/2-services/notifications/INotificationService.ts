// Puerto del servicio de notificaciones de escritorio (capa 1 PKA).
// Sin imports de infraestructura: no node-notifier, no fs, no os, no path.
import type { NotificationEvent } from './types.js';

/**
 * Contrato mínimo del servicio: un único método `notify`.
 * La implementación concreta (`DesktopNotificationAdapter`) delega en
 * `node-notifier`; este puerto permanece agnóstico del canal.
 */
export interface INotificationService {
  notify(event: NotificationEvent): Promise<void> | void;
}
