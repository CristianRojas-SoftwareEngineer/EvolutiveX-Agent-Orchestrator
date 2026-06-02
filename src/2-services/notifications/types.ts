// Tipos del servicio de notificaciones de escritorio.
// Capa 1 PKA: tipos puros, sin imports de infraestructura.

/**
 * Evento que el adaptador concreto recibe y traduce a un toast del SO.
 * Forma mínima: el contrato del puerto no expone personalización
 * (icono, AUMID, branding) en v1.
 */
export interface NotificationEvent {
  title: string;
  message: string;
  sound?: boolean;
  silent?: boolean;
}

/**
 * Tipos de evento del lifecycle de Claude Code que el CLI acepta en
 * `--event-type`. Reutiliza `HookEventName` de la spec canónica
 * `hooks-lifecycle-correlation` para mantener consistencia con el resto
 * del sistema.
 */
import type { HookEventName } from '../../1-domain/types/hook.types.js';
export type EventType = HookEventName;
