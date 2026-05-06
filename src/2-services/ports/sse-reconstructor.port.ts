import { SseReconstructOptions, SseReconstructResult, SsePhase } from '../../1-domain/types/audit.types.js';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Port que define el contrato público de reconstrucción SSE.
 * Consumido por los handlers de Capa 3.
 */
export interface ISseReconstructor {
  /**
   * Reconstruye un mensaje Anthropic desde el sse.jsonl de un step individual.
   * Usa el SDK oficial para parsear eventos SSE y ensamblar el mensaje.
   */
  reconstructStepMessage(
    stepDir: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage>;
  reconstructSseJsonlFile(
    jsonlPath: string,
    headersPath?: string,
    phase?: SsePhase,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage>;

  /**
   * Reconstruye mensaje del turno completo.
   */
  runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult>;
}
