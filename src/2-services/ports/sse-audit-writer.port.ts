import type { MarkdownRenderContext, SseLine } from '../../1-domain/types/audit.types.js';
import type { JsonValue } from '../../1-domain/types/json.types.js';

/**
 * Escrituras SSE inline en disco (@deprecated-p2).
 * Sustituye el puerto legacy `IAuditWriter` para la fase P1.
 */
export interface ISseAuditWriter {
  appendSseLine(sseJsonlPath: string, line: SseLine): void;
  appendSseRawChunk(stepDirOrPath: string, chunk: Buffer): void;
  writeResponseHeadersAudit(
    stepDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void>;
  writeTopLevelResponseHeaders(
    interactionDir: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void>;
  writeStepThought(stepDir: string, thinkingBlocks: JsonValue[]): Promise<void>;
  writeStepResponseMarkdown(
    stepDir: string,
    message: JsonValue,
    context?: MarkdownRenderContext,
  ): Promise<void>;
  writeCoalescedAgentStepResponse(params: {
    stepDir: string;
    initialMessage: JsonValue;
    continuationRequest: JsonValue | null;
    continuationHeaders?: Record<string, string | string[] | undefined>;
    finalMessage: JsonValue;
    toolUseIds: string[];
    subagentsSummary?: JsonValue;
    context?: MarkdownRenderContext;
  }): Promise<void>;
  writeTopLevelMultiStepResponse(
    interactionDir: string,
    stepCount: number,
    context?: MarkdownRenderContext,
  ): Promise<{ written: boolean; error?: string }>;
  extractFinalTextFromJson(parsed: JsonValue): string | null;
}
