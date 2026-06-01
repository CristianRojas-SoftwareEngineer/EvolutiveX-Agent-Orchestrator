import 'fastify';
import { WorkflowRequestKind, RequestClassification } from '../../1-domain/types/audit.types.js';

declare module 'fastify' {
  interface FastifyRequest {
    auditSessionId?: string;
    auditWorkflowDir?: string;
    requestSequence?: number;
    requestStartTime?: number;
    requestBodyOmitted?: boolean;
    rawBodyBytes?: number;
    workflowKind?: WorkflowRequestKind;
    requestClassification?: RequestClassification;
    /** Índice del step asignado durante request audit, inmutable hasta response audit. */
    auditStepIndex?: number;
    isInternalToolStep?: boolean;
    coalescedAgentContinuation?: {
      targetStepIndex: number;
      toolUseIds: string[];
    };
  }
}
