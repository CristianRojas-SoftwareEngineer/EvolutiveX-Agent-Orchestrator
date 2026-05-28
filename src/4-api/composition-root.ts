import * as path from 'node:path';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { SessionStoreService } from '../2-services/session-store.service.js';
import { AuditWriterService } from '../2-services/audit-writer.service.js';
import { SseReconstructService } from '../2-services/sse-reconstruct.service.js';
import { StreamTeeService } from '../2-services/stream-tee.service.js';
import { WorkflowRepositoryService } from '../2-services/workflow-repository.service.js';
import { AuditInteractionHandler } from '../3-operations/audit-interaction.handler.js';
import { AuditSseResponseHandler } from '../3-operations/audit-sse-response.handler.js';
import { AuditStandardResponseHandler } from '../3-operations/audit-standard-response.handler.js';
import { AuditUpstreamErrorHandler } from '../3-operations/audit-upstream-error.handler.js';
import { FilterToolsHandler } from '../3-operations/filter-tools.handler.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';

/**
 * Crea el grafo completo de dependencias del proxy.
 *
 * @param config Configuración del entorno del proxy.
 * @param logger Logger de Fastify para logging estructurado.
 * @param auditBaseDir Directorio donde se escribirán las sesiones auditadas.
 *   Por defecto `./sessions` relativo al CWD del proceso. Los tests de
 *   integración pueden inyectar un path absoluto para aislar capturas.
 */
export async function createProxyDependencies(
  config: ProxyEnvironmentConfig,
  logger: Logger,
  auditBaseDir: string = path.join(process.cwd(), 'sessions'),
) {
  // Capa 1 — Domain Services
  const sessionResolver = new SessionResolverService();

  // Capa 2 — Adapters
  const redactService = new RedactService();
  const markdownRenderer = new MarkdownRendererService();
  const sessionStore = new SessionStoreService(auditBaseDir, logger);
  const auditWriter = new AuditWriterService(redactService, markdownRenderer);
  const sseReconstruct = new SseReconstructService(auditWriter);
  const streamTee = new StreamTeeService();
  const workflowRepo = new WorkflowRepositoryService();

  await sessionStore.ensureAuditSessionsRoot();

  // Capa 3 — Handlers
  const auditInteractionHandler = new AuditInteractionHandler(
    sessionResolver,
    sessionStore,
    auditWriter,
    config,
    logger,
    workflowRepo,
  );
  const auditSseResponseHandler = new AuditSseResponseHandler(
    auditWriter,
    sseReconstruct,
    config,
    sessionStore,
    logger,
  );
  const auditStandardResponseHandler = new AuditStandardResponseHandler(
    auditWriter,
    config,
    sessionStore,
  );
  const auditUpstreamErrorHandler = new AuditUpstreamErrorHandler(
    auditWriter,
    config,
    sessionStore,
  );
  const filterToolsHandler = new FilterToolsHandler(config);

  return {
    auditInteractionHandler,
    auditSseResponseHandler,
    auditStandardResponseHandler,
    auditUpstreamErrorHandler,
    filterToolsHandler,
    streamTee,
    sessionStore,
    config,
  };
}

export type ProxyDependencies = Awaited<ReturnType<typeof createProxyDependencies>>;
