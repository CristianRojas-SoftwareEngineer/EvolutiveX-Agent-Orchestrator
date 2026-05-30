import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import { RedactService } from '../1-domain/services/redact.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { SessionStoreService } from '../2-services/session-store.service.js';
import { AuditWriterService } from '../2-services/audit-writer.service.js';
import { SseReconstructService } from '../2-services/sse-reconstruct.service.js';
import { StreamTeeService } from '../2-services/stream-tee.service.js';
import { WorkflowRepositoryService } from '../2-services/workflow-repository.service.js';
import { EventBus } from '../2-services/event-bus.service.js';
import { SessionPersistence } from '../2-services/session-persistence.service.js';
import { ProviderCatalogService } from '../2-services/provider-catalog.service.js';
import { StepAssemblerService } from '../2-services/step-assembler.service.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { AuditWorkflowClosureHandler } from '../3-operations/audit-workflow-closure.handler.js';
import { AuditHookEventHandler } from '../3-operations/audit-hook-event.handler.js';
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
  // EventBus único por arranque; SessionPersistence se auto-suscribe en su constructor
  // y el correlador publica sus mutaciones al mismo bus (Opción A, §28b/§40).
  const eventBus = new EventBus(logger);
  const sessionPersistence = new SessionPersistence(eventBus, {
    rootDir: path.dirname(auditBaseDir),
    logger,
  });
  const workflowRepo = new WorkflowRepositoryService(eventBus);
  const providerCatalog = new ProviderCatalogService(config.UPSTREAM_ORIGIN);

  await sessionStore.ensureAuditSessionsRoot();
  await cleanCutLegacySessions(auditBaseDir, logger);

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
    () => new StepAssemblerService(),
    workflowRepo,
    logger,
  );
  const sessionMetrics = new SessionMetricsService(auditWriter);
  const auditWorkflowClosureHandler = new AuditWorkflowClosureHandler(
    auditWriter,
    sessionMetrics,
    config,
  );
  const auditStandardResponseHandler = new AuditStandardResponseHandler(
    auditWriter,
    config,
    sessionStore,
    workflowRepo,
  );
  const auditUpstreamErrorHandler = new AuditUpstreamErrorHandler(
    auditWriter,
    config,
    sessionStore,
  );
  const filterToolsHandler = new FilterToolsHandler(config);
  const hookEventHandler = new AuditHookEventHandler(
    workflowRepo,
    sessionStore,
    auditWorkflowClosureHandler,
    logger,
  );

  return {
    auditInteractionHandler,
    auditSseResponseHandler,
    auditStandardResponseHandler,
    auditUpstreamErrorHandler,
    filterToolsHandler,
    hookEventHandler,
    streamTee,
    sessionStore,
    providerCatalog,
    eventBus,
    sessionPersistence,
    config,
  };
}

export type ProxyDependencies = Awaited<ReturnType<typeof createProxyDependencies>>;

/**
 * Corte limpio (§D-5): si `sessionsDir` contiene sesiones con el layout flat
 * legacy (presencia de `main-agent/`, `side-interactions/` o
 * `interaction-sequence.json` bajo cualquier sesión), elimina todo el contenido
 * y recrea `.gitkeep`. Idempotente: no hace nada si el layout ya es
 * `causal-workflows-v1` o si no hay sesiones.
 */
export async function cleanCutLegacySessions(sessionsDir: string, logger: Logger): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return; // El directorio no existe todavía.
  }

  let legacyDetected = false;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const children = await fs.readdir(path.join(sessionsDir, entry.name));
      if (
        children.includes('main-agent') ||
        children.includes('side-interactions') ||
        children.includes('interaction-sequence.json')
      ) {
        legacyDetected = true;
        break;
      }
    } catch {
      /* sesión ilegible: ignorar */
    }
  }

  if (!legacyDetected) return;

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;
    await fs.rm(path.join(sessionsDir, entry.name), { recursive: true, force: true });
  }
  await fs.writeFile(path.join(sessionsDir, '.gitkeep'), '', 'utf8');
  logger.info('corte limpio: sesiones con layout legacy eliminadas (causal-workflows-v1)');
}
