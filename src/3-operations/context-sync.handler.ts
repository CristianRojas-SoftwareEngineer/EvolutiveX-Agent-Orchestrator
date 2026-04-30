import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { buildSimulatedSseFromText } from '../1-domain/services/sse-simulator.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { JsonValue } from '../1-domain/types/json.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';

export type ContextSyncCacheResult =
  | { kind: 'hit'; sseStream: Readable }
  | { kind: 'miss' };

export class ContextSyncHandler {
  constructor(
    private sessionStore: ISessionStore,
    private config: ProxyEnvironmentConfig,
    private logger: Logger,
) {}

  public async tryServeFromCache(params: {
    sessionId: string;
    url: string;
    model: string;
    requestId?: string;
  }): Promise<ContextSyncCacheResult> {
    const startTime = Date.now();

    this.logger.debug({
      event: 'context_sync_try_cache_start',
      sessionId: params.sessionId,
      url: params.url,
      requestId: params.requestId,
      startTime,
    }, 'Context Sync: iniciando consulta a caché');

    // 1. Primera consulta síncrona al índice
    const cached = this.sessionStore.resolveWebFetchStep(params.sessionId, params.url);

    this.logger.debug({
      event: 'context_sync_first_lookup',
      sessionId: params.sessionId,
      url: params.url,
      requestId: params.requestId,
      hit: !!cached,
      cachedStepDir: cached?.stepDir ?? null,
      elapsedMs: Date.now() - startTime,
    }, `Context Sync: primera consulta al índice ${cached ? 'HIT' : 'MISS'}`);

    if (cached) {
      this.logger.info({
        event: 'context_sync_hit_immediate',
        sessionId: params.sessionId,
        url: params.url,
        requestId: params.requestId,
        stepDir: cached.stepDir,
        totalElapsedMs: Date.now() - startTime,
      }, 'Context Sync: HIT inmediato desde caché');

      const summary = await this.extractSummaryFromStep(cached.stepDir);
      if (!summary) {
        this.logger.warn({
          event: 'context_sync_hit_no_summary',
          sessionId: params.sessionId,
          url: params.url,
          requestId: params.requestId,
          stepDir: cached.stepDir,
        }, 'Context Sync: HIT pero no se pudo extraer summary');
        return { kind: 'miss' };
      }

      const payload = buildSimulatedSseFromText({
        text: summary,
        model: params.model,
      });

      return { kind: 'hit', sseStream: Readable.from([payload]) };
    }

    // 2. Inicia espera asíncrona con timeout
    const waitStartTime = Date.now();
    const configuredTimeout = this.config.CONTEXT_SYNC_MAX_WAIT_MS;

    this.logger.debug({
      event: 'context_sync_wait_start',
      sessionId: params.sessionId,
      url: params.url,
      requestId: params.requestId,
      configuredTimeoutMs: configuredTimeout,
      waitStartTime,
    }, 'Context Sync: iniciando espera asíncrona');

    const resolved = await this.sessionStore.onceWebFetchStepResolved(
      params.sessionId,
      params.url,
      configuredTimeout,
    );

    const waitElapsedMs = Date.now() - waitStartTime;
    const totalElapsedMs = Date.now() - startTime;

    this.logger.debug({
      event: 'context_sync_wait_end',
      sessionId: params.sessionId,
      url: params.url,
      requestId: params.requestId,
      resolved: !!resolved,
      configuredTimeoutMs: configuredTimeout,
      actualWaitMs: waitElapsedMs,
      differenceMs: waitElapsedMs - configuredTimeout,
      totalElapsedMs,
    }, `Context Sync: espera finalizada ${resolved ? 'con HIT' : 'con MISS'}`);

    if (!resolved) {
      this.logger.info({
        event: 'context_sync_miss_timeout',
        sessionId: params.sessionId,
        url: params.url,
        requestId: params.requestId,
        configuredTimeoutMs: configuredTimeout,
        actualWaitMs: waitElapsedMs,
        differenceMs: waitElapsedMs - configuredTimeout,
        premature: waitElapsedMs < configuredTimeout * 0.5,
      }, waitElapsedMs < configuredTimeout * 0.5
        ? 'Context Sync: MISS por timeout prematuro'
        : 'Context Sync: MISS por timeout normal');
      return { kind: 'miss' };
    }

    this.logger.info({
      event: 'context_sync_hit_after_wait',
      sessionId: params.sessionId,
      url: params.url,
      requestId: params.requestId,
      stepDir: resolved.stepDir,
      waitElapsedMs,
      totalElapsedMs,
    }, 'Context Sync: HIT después de espera');

    const summary = await this.extractSummaryFromStep(resolved.stepDir);
    if (!summary) {
      this.logger.warn({
        event: 'context_sync_hit_after_wait_no_summary',
        sessionId: params.sessionId,
        url: params.url,
        requestId: params.requestId,
        stepDir: resolved.stepDir,
      }, 'Context Sync: HIT después de espera pero no se pudo extraer summary');
      return { kind: 'miss' };
    }

    const payload = buildSimulatedSseFromText({
      text: summary,
      model: params.model,
    });

    return { kind: 'hit', sseStream: Readable.from([payload]) };
  }

  private async extractSummaryFromStep(stepDir: string): Promise<string | null> {
    const bodyPath = path.join(stepDir, 'response', 'body.json');
    try {
      const raw = await fs.readFile(bodyPath, 'utf8');
      const parsed = JSON.parse(raw) as JsonValue;
      const text = this.extractAssistantText(parsed);
      return text || null;
    } catch {
      return null;
    }
  }

  private extractAssistantText(message: JsonValue): string {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return '';
    const obj = message as Record<string, JsonValue>;
    const content = obj.content;
    if (!Array.isArray(content)) return '';
    const chunks: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      const b = block as Record<string, JsonValue>;
      if (b.type === 'text' && typeof b.text === 'string') {
        chunks.push(b.text);
      }
    }
    return chunks.join('\n').trim();
  }
}
