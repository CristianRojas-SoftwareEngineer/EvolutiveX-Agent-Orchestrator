import type { IWorkflow } from './IWorkflow.js';

/** Sesión serializable que agrupa la continuidad observada de una sesión Claude Code. */
export interface ISession {
  /** Identificador interno del gateway. */
  id: string;
  /** `session_id` del hook Claude Code, asignado al recibir el primer hook. */
  externalSessionId?: string;
  /** Proveedor por defecto de la sesión. */
  providerId?: string;
  /** Historial de workflows observados en la sesión. */
  workflows: IWorkflow[];
  /** Momento de creación de la sesión. */
  createdAt: Date;
  /** Metadatos adicionales (proyecto, usuario, etc.). */
  metadata?: Record<string, unknown>;
}
