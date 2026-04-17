import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { SessionStoreService } from '../2-services/session-store.service.js';
import { AuditWriterService } from '../2-services/audit-writer.service.js';
import { SseReconstructService } from '../2-services/sse-reconstruct.service.js';
import { StreamTeeService } from '../2-services/stream-tee.service.js';
import { AuditRequestHandler } from '../3-operations/audit-request.handler.js';
import { AuditSseResponseHandler } from '../3-operations/audit-sse-response.handler.js';
import { AuditStandardResponseHandler } from '../3-operations/audit-standard-response.handler.js';
import { AuditUpstreamErrorHandler } from '../3-operations/audit-upstream-error.handler.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

/**
 * Crea el grafo completo de dependencias del proxy.
 * Función async para permitir inicialización de infraestructura (ej: ensureAuditSessionsRoot).
 */
export async function createProxyDependencies(config: ProxyEnvironmentConfig) {
  // Capa 1 — Domain Services
  const sessionResolver = new SessionResolverService(config);

  // Capa 2 — Adapters
  const redactService = new RedactService();
  const markdownRenderer = new MarkdownRendererService();
  const sessionStore = new SessionStoreService(config.AUDIT_SESSIONS_DIR);
  const auditWriter = new AuditWriterService(redactService, markdownRenderer);
  const sseReconstruct = new SseReconstructService(
    auditWriter,
    markdownRenderer,
    config.AUDIT_SSE_REPLAY_MODEL,
  );
  const streamTee = new StreamTeeService();

  // Inicialización de infraestructura (Capa 2, invocada aquí para encapsular)
  if (config.AUDIT_ENABLED) {
    await sessionStore.ensureAuditSessionsRoot();
  }

  // Capa 3 — Handlers
  const auditRequestHandler = new AuditRequestHandler(
    sessionResolver,
    sessionStore,
    auditWriter,
    config,
  );
  const auditSseResponseHandler = new AuditSseResponseHandler(auditWriter, sseReconstruct, config);
  const auditStandardResponseHandler = new AuditStandardResponseHandler(auditWriter, config);
  const auditUpstreamErrorHandler = new AuditUpstreamErrorHandler(auditWriter, config);

  return {
    auditRequestHandler,
    auditSseResponseHandler,
    auditStandardResponseHandler,
    auditUpstreamErrorHandler,
    streamTee,
    config,
  };
}

/** Tipo inferido del struct de dependencias — Capa 5 importa solo este tipo. */
export type ProxyDependencies = Awaited<ReturnType<typeof createProxyDependencies>>;
