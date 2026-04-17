import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

/**
 * Handler para escribir metadata de error cuando falla la conexión upstream.
 */
export class AuditUpstreamErrorHandler {
  constructor(
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
  ) {}

  /**
   * Ejecuta la escritura de meta.json para errores de upstream.
   */
  public async execute(params: {
    auditRequestDir: string;
    requestId: string;
    requestSequence: number;
    auditSessionId: string;
    method: string;
    url: string;
    requestStartTime: number;
    requestBodyBytes: number;
    requestBodyOmitted: boolean;
    error: Error & { code?: string };
  }): Promise<void> {
    if (!this.config.AUDIT_ENABLED) {
      return;
    }

    await this.auditWriter.writeUpstreamFailureMeta(params.auditRequestDir, {
      requestId: params.requestId,
      requestSequence: params.requestSequence,
      auditSessionId: params.auditSessionId,
      err: params.error,
      requestStartTime: params.requestStartTime,
      upstream: this.config.UPSTREAM_ORIGIN,
      method: params.method,
      url: params.url,
      requestBodyBytes: params.requestBodyBytes,
      requestBodyOmitted: params.requestBodyOmitted,
    });
  }
}
