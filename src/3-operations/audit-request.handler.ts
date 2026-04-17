import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { IAuditWriter } from '../2-services/ports/audit-writer.port.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

interface AuditRequestResult {
  auditRequestDir: string;
  requestBodyOmitted: boolean;
  requestSequence: number;
  auditSessionId: string;
}

/**
 * Handler para orquestar la auditoría de la petición entrante.
 * Extrae: resuelve sesión → asigna secuencia → escribe request audit.
 */
export class AuditRequestHandler {
  constructor(
    private sessionResolver: SessionResolverService,
    private sessionStore: ISessionStore,
    private auditWriter: IAuditWriter,
    private config: ProxyEnvironmentConfig,
  ) {}

  /**
   * Ejecuta la auditoría de la petición.
   * @returns Metadata necesaria para la auditoría de respuesta.
   */
  public async execute(params: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer;
    requestId: string;
  }): Promise<AuditRequestResult | null> {
    if (!this.config.AUDIT_ENABLED) {
      return null;
    }

    const auditSession = this.sessionResolver.getAuditSessionId(params.headers);
    const auditSessionId = auditSession.sessionId;

    if (this.config.STRIP_AUDIT_SESSION_HEADER && auditSession.stripHeaderName) {
      this.sessionResolver.stripAuditHeaderInPlace(params.headers, auditSession.stripHeaderName);
    }

    const seq = await this.sessionStore.nextAuditRequestSequence(auditSessionId);
    const folderName = this.sessionResolver.formatAuditRequestDirName(seq, params.requestId);

    const wr = await this.auditWriter.writeRequestAudit({
      baseDir: this.sessionStore.getBaseDir(),
      sessionId: auditSessionId,
      folderName,
      headers: params.headers,
      bodyBuffer: params.rawBody,
      maxAuditRequestBytes: this.config.MAX_AUDIT_REQUEST_BODY_BYTES,
    });

    return {
      auditRequestDir: wr.dir,
      requestBodyOmitted: wr.requestBodyOmitted,
      requestSequence: seq,
      auditSessionId,
    };
  }
}
