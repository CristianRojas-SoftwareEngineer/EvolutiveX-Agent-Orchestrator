import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { buildSimulatedSseFromText } from '../1-domain/services/sse-simulator.service.js';
import type { ISessionStore } from '../2-services/ports/session-store.port.js';
import type { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';
import type { JsonValue } from '../1-domain/types/json.types.js';

export type ContextSyncCacheResult =
  | { kind: 'hit'; sseStream: Readable }
  | { kind: 'miss' };

export class ContextSyncHandler {
  constructor(
    private sessionStore: ISessionStore,
    private config: ProxyEnvironmentConfig,
  ) {}

  public async tryServeFromCache(params: {
    sessionId: string;
    url: string;
    model: string;
  }): Promise<ContextSyncCacheResult> {
    const resolved =
      this.sessionStore.resolveWebFetchStep(params.sessionId, params.url)
      ?? await this.sessionStore.onceWebFetchStepResolved(
        params.sessionId,
        params.url,
        this.config.CONTEXT_SYNC_MAX_WAIT_MS,
      );

    if (!resolved) {
      return { kind: 'miss' };
    }

    const summary = await this.extractSummaryFromStep(resolved.stepDir);
    if (!summary) {
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
