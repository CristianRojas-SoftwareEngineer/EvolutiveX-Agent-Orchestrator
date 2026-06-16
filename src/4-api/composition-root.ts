import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { SessionResolverService } from '../1-domain/services/session-resolver.service.js';
import { MarkdownRendererService } from '../1-domain/services/markdown-renderer.service.js';
import { SseReconstructService } from '../2-services/sse-reconstruct.service.js';
import { StreamTeeService } from '../2-services/stream-tee.service.js';
import { WorkflowRepositoryService } from '../2-services/workflow-repository.service.js';
import { EventBus } from '../2-services/event-bus.service.js';
import { SessionPersistence } from '../2-services/session-persistence.service.js';
import { ProviderCatalogService } from '../2-services/provider-catalog.service.js';
import { StepAssemblerService } from '../2-services/step-assembler.service.js';
import { SessionMetricsService } from '../2-services/session-metrics.service.js';
import { ProviderRoutingResolverService } from '../2-services/provider-routing-resolver.service.js';
import { SubscriptionQuotaService } from '../2-services/subscription-quota.service.js';
import { AuditHookEventHandler } from '../3-operations/audit-hook-event.handler.js';
import { KanbanBoardProjector } from '../3-operations/kanban-board.projector.js';
import { AuditWorkflowHandler } from '../3-operations/audit-workflow.handler.js';
import { AuditSseResponseHandler } from '../3-operations/audit-sse-response.handler.js';
import { AuditStandardResponseHandler } from '../3-operations/audit-standard-response.handler.js';
import { AuditUpstreamErrorHandler } from '../3-operations/audit-upstream-error.handler.js';
import { FilterToolsHandler } from '../3-operations/filter-tools.handler.js';
import { SapiTTSService } from '../2-services/tts/sapi-tts.service.js';
import { TranscriptContextExtractor } from '../2-services/tts/transcript-extractor.service.js';
import { DesktopNotificationAdapter } from '../2-services/notifications/DesktopNotificationAdapter.js';
import { resolveBranding } from '../2-services/notifications/cli.js';
import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';

/**
 * Crea el grafo completo de dependencias del proxy.
 *
 * @param config Configuración del entorno del proxy.
 * @param logger Logger de Fastify para logging estructurado.
 * @param auditBaseDir Directorio base de sesiones. Todos los artefactos
 *   (workflows, eventos y métricas) se escriben directamente bajo él.
 *   Por defecto `./sessions` relativo al CWD del proceso.
 */
export async function createProxyDependencies(
  config: ProxyEnvironmentConfig,
  logger: Logger,
  auditBaseDir: string = path.join(process.cwd(), 'sessions'),
) {
  // Capa 1 — Domain Services
  const sessionResolver = new SessionResolverService();

  // Capa 2 — Adapters
  const markdownRenderer = new MarkdownRendererService();
  const sseReconstruct = new SseReconstructService(markdownRenderer);
  const streamTee = new StreamTeeService();
  // EventBus único por arranque; SessionPersistence se auto-suscribe en su constructor
  // y el correlador publica sus mutaciones al mismo bus (Opción A, §28b/§40).
  const eventBus = new EventBus(logger);
  const sessionPersistence = new SessionPersistence(eventBus, {
    rootDir: auditBaseDir,
    logger,
    sseReconstruct,
    markdownRenderer,
  });
  const workflowRepo = new WorkflowRepositoryService(eventBus);
  const providerCatalog = new ProviderCatalogService(config.UPSTREAM_ORIGIN);

  await ensureAuditSessionsRoot(auditBaseDir);
  await cleanCutLegacySessions(auditBaseDir, logger);

  // Capa 3 — Handlers
  const auditWorkflowHandler = new AuditWorkflowHandler(
    sessionResolver,
    auditBaseDir,
    workflowRepo,
    eventBus,
    config,
    logger,
  );
  const sessionMetrics = new SessionMetricsService();
  const providerRoutingResolver = new ProviderRoutingResolverService(process.cwd());
  const subscriptionQuota = new SubscriptionQuotaService(providerRoutingResolver, undefined, logger);
  const auditSseResponseHandler = new AuditSseResponseHandler(
    config,
    () => new StepAssemblerService(),
    workflowRepo,
    eventBus,
    auditBaseDir,
    sessionMetrics,
    logger,
    subscriptionQuota,
  );
  const auditStandardResponseHandler = new AuditStandardResponseHandler(
    eventBus,
    config,
    workflowRepo,
    auditBaseDir,
    sessionMetrics,
    subscriptionQuota,
  );
  const auditUpstreamErrorHandler = new AuditUpstreamErrorHandler(workflowRepo);
  const filterToolsHandler = new FilterToolsHandler(config);

  // Servicios de TTS — opcionales; se desactivan si TTS_ENABLED=false
  const ttsEnabled = config.TTS_ENABLED !== false;
  const ttsService = ttsEnabled ? new SapiTTSService() : undefined;
  const contextExtractor = ttsEnabled ? new TranscriptContextExtractor() : undefined;

  if (ttsService) {
    // Inicializar en segundo plano para no bloquear el arranque del servidor
    void ttsService.initialize().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, '[TTS] Fallo en la inicialización del motor TTS; TTS desactivado');
    });
  }

  // Branding por defecto para el toast del Stop (appId + icono fallback global)
  const toastBranding = resolveBranding({ sound: false, silent: false, stdinJson: false });

  // Credencial TTS dedicada: leída una vez al arranque desde el secrets de OpenRouter
  const ttsApiKey = await resolveTtsApiKey();

  const kanbanProjector = new KanbanBoardProjector(
    path.join(process.cwd(), '.agentkanban'),
    logger,
  );

  const hookEventHandler = new AuditHookEventHandler(
    workflowRepo,
    auditBaseDir,
    sessionMetrics,
    logger,
    ttsService,
    contextExtractor,
    config.TTS_CONTEXT_N ?? 3,
    new DesktopNotificationAdapter(),
    toastBranding,
    ttsApiKey,
    kanbanProjector,
  );

  return {
    auditWorkflowHandler,
    auditSseResponseHandler,
    auditStandardResponseHandler,
    auditUpstreamErrorHandler,
    filterToolsHandler,
    hookEventHandler,
    streamTee,
    providerCatalog,
    eventBus,
    sessionPersistence,
    config,
  };
}

export type ProxyDependencies = Awaited<ReturnType<typeof createProxyDependencies>>;

/** Lee la API key de OpenRouter para el provider TTS dedicado. Devuelve `undefined` si el archivo no existe o no contiene la clave. Acepta override de ruta via OPENROUTER_SECRETS_PATH (para tests). */
async function resolveTtsApiKey(): Promise<string | undefined> {
  const secretsPath =
    process.env['OPENROUTER_SECRETS_PATH'] ??
    path.join(process.cwd(), 'routing', 'providers', 'openrouter', 'secrets.json');
  try {
    const raw = await fs.readFile(secretsPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const key = parsed['ANTHROPIC_AUTH_TOKEN'];
    return typeof key === 'string' && key.trim() ? key.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Crea el directorio raíz de sesiones auditadas y `.gitkeep` si no existen. */
async function ensureAuditSessionsRoot(auditBaseDir: string): Promise<void> {
  await fs.mkdir(auditBaseDir, { recursive: true });
  const keep = path.join(auditBaseDir, '.gitkeep');
  try {
    await fs.access(keep);
  } catch {
    await fs.writeFile(keep, '', 'utf8');
  }
}

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
