import {
  SseReconstructOptions,
  SseReconstructResult,
  SsePhase,
} from '../../1-domain/types/audit.types.js';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Port que define el contrato público de reconstrucción SSE.
 * Consumido por los handlers de Capa 3.
 */
export interface ISseReconstructor {
  /**
   * Reconstruye un mensaje Anthropic desde los chunks streaming/ de un step.
   * Lee `stepDir/response/streaming/*.ndjson` como fuente canónica (P2+).
   */
  reconstructStepMessage(
    stepDir: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage>;

  /**
   * Reconstruye un mensaje Anthropic desde un buffer JSONL serializado.
   * Para streams completos (no coalesced o coalesced completo).
   */
  reconstructSseJsonlFile(
    jsonlPath: string,
    headersPath?: string,
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage>;

  /**
   * Reconstruye un mensaje Anthropic desde una fase específica de un buffer JSONL.
   * Parsea eventos SSE directamente sin el SDK, permitiendo reconstruir fases
   * parciales (delegation/continuation) sin message_stop.
   */
  reconstructSseJsonlPhaseMessage(jsonlPath: string, phase: SsePhase): Promise<Anthropic.Message>;

  /**
   * Reconstruye un mensaje Anthropic filtrando por fase desde los chunks
   * `stepDir/response/streaming/*.ndjson`. Fuente canónica P2+.
   */
  reconstructStepPhaseMessage(stepDir: string, phase: SsePhase): Promise<Anthropic.Message>;

  /**
   * Reconstruye mensaje del turno completo.
   */
  runReconstruction(opts: SseReconstructOptions): Promise<SseReconstructResult>;
}
