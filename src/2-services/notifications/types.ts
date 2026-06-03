// Tipos del servicio de notificaciones de escritorio.
// Capa 1 PKA: tipos puros, sin imports de infraestructura.

/**
 * Evento que el adaptador concreto recibe y traduce a un toast del SO.
 * Forma mínima: además de los campos base (`title`, `message`, `sound?`,
 * `silent?`), admite dos campos opcionales de branding (`appId?`, `icon?`).
 * El contrato del puerto no expone otros campos de personalización
 * (`image`, `contentImage`, `appIdPath`, `subtitle`, `category`,
 * `urgency`, `timeout`, `wait`, `open`, `closeLabel`, `actions`,
 * `heroImage`) en v1.
 */
export interface NotificationEvent {
  title: string;
  message: string;
  sound?: boolean;
  silent?: boolean;
  /** Identificador de aplicación (AUMID en Windows). Inyectado por la CLI. */
  appId?: string;
  /** Ruta a un asset de imagen usado como icono cosmético del toast. */
  icon?: string;
}

/**
 * Tipos de evento del lifecycle de Claude Code que el CLI acepta en
 * `--event-type`. Reutiliza `HookEventName` de la spec canónica
 * `hooks-lifecycle-correlation` para mantener consistencia con el resto
 * del sistema.
 */
import type { HookEventName } from '../../1-domain/types/hook.types.js';
export type EventType = HookEventName;
