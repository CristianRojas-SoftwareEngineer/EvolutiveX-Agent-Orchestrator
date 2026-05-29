import type { ISession } from '../../interfaces/gateway/ISession.js';
import type { IWorkflow } from '../../interfaces/gateway/IWorkflow.js';

export class Session implements ISession {
  id: string;
  externalSessionId?: string;
  providerId?: string;
  workflows: IWorkflow[];
  createdAt: Date;
  metadata?: Record<string, unknown>;

  constructor(data: ISession) {
    this.id = data.id;
    this.externalSessionId = data.externalSessionId;
    this.providerId = data.providerId;
    this.workflows = data.workflows;
    this.createdAt = data.createdAt;
    this.metadata = data.metadata;
  }

  /** Añade un workflow al historial de la sesión. */
  addWorkflow(workflow: IWorkflow): void {
    this.workflows.push(workflow);
  }

  /** Devuelve el último workflow activo (running o pending), o `undefined`. */
  getActiveWorkflow(): IWorkflow | undefined {
    return [...this.workflows]
      .reverse()
      .find((w) => w.status === 'running' || w.status === 'pending');
  }
}
