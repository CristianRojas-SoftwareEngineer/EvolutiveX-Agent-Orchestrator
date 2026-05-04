import { InteractionState, InteractionMetadata, SessionModelMetrics, SseLine } from '../../1-domain/types/audit.types.js';
import { JsonValue } from '../../1-domain/types/json.types.js';

/**
 * Port que define el contrato público de escritura de auditoría.
 * Consumido por los handlers de Capa 3.
 */
export interface IAuditWriter {
  writeFileAtomic(filePath: string, data: Buffer | string): Promise<void>;
  writeJsonAtomic(filePath: string, obj: JsonValue): Promise<void>;
  writeFormattedAndMarkdown(
    dir: string,
    baseName: string,
    parsed: JsonValue,
    type: 'request' | 'response',
  ): Promise<void>;
  writeInteractionRequest(params: {
    baseDir: string;
    sessionId: string;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
    skipTopLevelRequest?: boolean;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }>;
  /**
   * Inicializa el directorio de un subagente bajo
   * `<parentInteractionDir>/steps/<NNN>/sub-interactions/<MMM>_<requestId>/`
   * y guarda el request top-level con la misma estructura que
   * `writeInteractionRequest`. No usa `sessions/<id>/interactions/` porque la
   * sub-interacción es hija lógica del step padre.
   */
  writeSubInteractionRequest(params: {
    parentInteractionDir: string;
    parentStepIndex: number;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }>;
  /**
   * Devuelve la siguiente secuencia local para sub-interacciones bajo el step
   * indicado. Examina los directorios existentes con prefijo numérico de 3
   * dígitos y devuelve `max + 1` (1-indexado). Idempotente y stateless.
   */
  nextSubInteractionSequence(
    parentInteractionDir: string,
    parentStepIndex: number,
  ): Promise<number>;
  writeStepRequest(params: {
    stepDir: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<void>;
  finalizeNonSseResponseAudit(params: {
    interactionDir: string;
    bodyBuffer: Buffer;
    totalBytes: number;
    maxAuditResponseBytes: number;
    maxBufferBytes: number;
    contentType: string;
  }): Promise<{
    responseBodyBytesAudited: number;
    responseTruncatedByProxyBuffer: boolean;
    responseTruncatedByAuditLimit: boolean;
  }>;
  finalizeNonSseResponseAuditOnStreamError(params: {
    interactionDir: string;
    bodyBuffer: Buffer;
    totalBytes: number;
    maxAuditResponseBytes: number;
    maxBufferBytes: number;
    contentType: string;
    streamErrorMessage: string;
  }): Promise<{
    responseBodyBytesAudited: number;
    responseTruncatedByProxyBuffer: boolean;
    responseTruncatedByAuditLimit: boolean;
  }>;
  writeResponseHeadersAudit(
    interactionDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void>;
  writeInteractionMeta(interactionDir: string, meta: InteractionMetadata): Promise<void>;
  updateSessionMetrics(
    sessionDir: string,
    modelId: string,
    totals: Pick<SessionModelMetrics, 'inputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'outputTokens'>,
    stepCount: number,
  ): Promise<void>;
  appendSseLine(interactionDir: string, lineObj: SseLine): void;
  /**
   * Apéndice síncrono del raw dump `sse.txt`. Síncrono para preservar el
   * orden de los chunks bajo ráfagas. El raw dump es puramente de depuración;
   * la reconstrucción SSE se basa en `sse.jsonl`.
   */
  appendSseRawChunk(interactionDir: string, chunk: Buffer): void;
  /**
   * Escribe un marcador `state.json` en el directorio de interacción indicando
   * que la interacción está en curso. Debe eliminarse al cerrar la interacción.
   */
  writeInteractionState(interactionDir: string, state: InteractionState): Promise<void>;
  /**
   * Elimina el marcador `state.json` del directorio de interaccion. Idempotente:
   * no falla si el archivo no existe.
   */
  removeInteractionState(interactionDir: string): Promise<void>;
  /**
   * Escribe body.json y body.parsed.md
   * con el mensaje reconstruido de un step SSE.
   */
  writeStepResponseMarkdown(stepDir: string, message: JsonValue): Promise<void>;
  /**
   * Combina los body.json de todos los steps y escribe response/body.json
   * (formato multi-step) y response/body.parsed.md en el top-level de la interacción.
   */
  writeTopLevelMultiStepResponse(
    interactionDir: string,
    stepCount: number,
  ): Promise<{ written: boolean; error?: string }>;
}
