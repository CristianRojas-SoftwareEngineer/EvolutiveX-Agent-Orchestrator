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

  /**
   * Reconstruye un mensaje Anthropic desde un archivo sse.jsonl.
   * Usa el SDK oficial para parsear eventos SSE y ensamblar el mensaje.
   * Para streams completos (no coalesced o coalesced completo).
   */
  reconstructSseJsonlFile(
    jsonlPath: string,
    headersPath?: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage>;

  /**
   * Reconstruye un mensaje Anthropic desde una fase específica de un sse.jsonl coalesced.
   * Parsea eventos SSE directamente desde el archivo sin usar el SDK,
   * permitiendo reconstruir fases parciales (delegation/continuation) que no
   * necesariamente contienen message_stop.
   */
  reconstructSseJsonlPhaseMessage(
    jsonlPath: string,
    phase: SsePhase,
  ): Promise<Anthropic.Message>;

  /**
   * Reconstruye mensaje del turno completo.
   */
  runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult>;
}
