import { AuditMetadata, SseLine } from '../../1-domain/types/audit.types.js';
import { JsonValue } from '../../1-domain/types/json.types.js';

/**
 * Port que define el contrato público de escritura de auditoría.
 * Consumido por los handlers de Capa 3.
 */
export interface IAuditWriter {
  writeFileAtomic(filePath: string, data: Buffer | string): Promise<void>;
  writeJsonAtomic(filePath: string, obj: JsonValue): Promise<void>;
  writeFormattedAndMarkdown(
    requestDir: string,
    baseName: string,
    parsed: JsonValue,
    type: 'request' | 'response',
  ): Promise<void>;
  writeRequestAudit(params: {
    baseDir: string;
    sessionId: string;
    folderName: string;
    headers: Record<string, string | string[] | undefined>;
    bodyBuffer: Buffer | null;
    maxAuditRequestBytes: number;
  }): Promise<{ dir: string; requestBodyOmitted: boolean }>;
  finalizeNonSseResponseAudit(params: {
    requestDir: string;
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
    requestDir: string;
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
  writeUpstreamFailureMeta(
    requestDir: string,
    payload: {
      requestId: string;
      requestSequence: number;
      auditSessionId: string;
      err: Error | { message?: string; code?: string };
      requestStartTime: number;
      upstream: string;
      method: string;
      url: string;
      requestBodyBytes: number;
      requestBodyOmitted: boolean;
    },
  ): Promise<void>;
  writeResponseHeadersAudit(
    requestDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void>;
  writeMetaAtomic(requestDir: string, meta: AuditMetadata): Promise<void>;
  appendSseLine(requestDir: string, lineObj: SseLine): void;
  appendSseRawChunk(requestDir: string, chunk: Buffer): Promise<void>;
}
