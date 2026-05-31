import type { IWorkflowRepository } from '../1-domain/repositories/IWorkflowRepository.js';

/**
 * Handler para cerrar el workflow con outcome `upstream-error` cuando falla la
 * conexión al upstream. SessionPersistence escribe meta.json vía el evento
 * `workflow_complete` emitido por `forceClose`.
 */
export class AuditUpstreamErrorHandler {
  constructor(private workflowRepo: IWorkflowRepository) {}

  public execute(params: {
    auditSessionId: string;
    error: Error & { code?: string };
  }): void {
    const workflow = this.workflowRepo.getWorkflowBySessionId(params.auditSessionId);
    if (!workflow) return;
    this.workflowRepo.forceClose(workflow.id, 'upstream-error');
  }
}
