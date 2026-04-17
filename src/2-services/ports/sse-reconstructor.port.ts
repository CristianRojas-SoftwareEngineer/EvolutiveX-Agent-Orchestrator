import { SseReconstructOptions, SseReconstructResult } from '../../1-domain/types/audit.types.js';

/**
 * Port que define el contrato público de reconstrucción SSE.
 * Consumido por los handlers de Capa 3.
 */
export interface ISseReconstructor {
  runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult>;
}
