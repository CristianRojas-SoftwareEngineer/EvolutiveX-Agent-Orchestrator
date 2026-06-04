/**
 * Hook Stop: resume el turno con un modelo y emite un segundo toast de escritorio.
 * Los prompt hooks de Claude Code no pueden invocar el CLI de notificaciones; este relay
 * replica el prompt configurado en `.claude/settings.json` y envía el resumen.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { stdin } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { DesktopNotificationAdapter } from '../src/2-services/notifications/DesktopNotificationAdapter.js';
import { buildEvent } from '../src/2-services/notifications/cli.js';
import { truncate, normalizeWhitespace } from '../src/2-services/notifications/hook-payload-notification-message.js';

const DEFAULT_HAIKU = 'claude-haiku-4-5-20251001';
const MAX_INPUT_CHARS = 12_000;
const MAX_SUMMARY_CHARS = 320;

export const STOP_SUMMARY_PROMPT_PREFIX =
  'Resume en 2-4 frases, en español y para el usuario, el trabajo realizado en este turno de asistente de código. ' +
  'Sé concreto (qué se hizo, resultado). Sin markdown ni listas. Solo el texto del resumen.\n\n' +
  'Mensaje final del asistente:\n';

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export function readLastAssistantMessage(payload: Record<string, unknown>): string | undefined {
  const value = payload['last_assistant_message'];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface TranscriptLine {
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
}

/** Último bloque `text` de un mensaje assistant en el transcript JSONL del hook. */
export async function readLastAssistantTextFromTranscript(
  transcriptPath: string,
): Promise<string | undefined> {
  let lastText: string | undefined;
  const rl = createInterface({
    input: createReadStream(transcriptPath, { encoding: 'utf-8' }),
  });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as TranscriptLine;
        if (row.message?.role !== 'assistant' || !Array.isArray(row.message.content)) {
          continue;
        }
        const parts = row.message.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string);
        const joined = normalizeWhitespace(parts.join(' '));
        if (joined) lastText = joined;
      } catch {
        /* línea no JSON */
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: transcript: ${msg}\n`);
  } finally {
    rl.close();
  }
  return lastText;
}

export async function resolveAssistantTextForSummary(
  payload: Record<string, unknown>,
): Promise<string | undefined> {
  const fromField = readLastAssistantMessage(payload);
  if (fromField) return fromField;

  const transcriptPath = payload['transcript_path'];
  if (typeof transcriptPath === 'string' && transcriptPath.trim()) {
    return readLastAssistantTextFromTranscript(transcriptPath.trim());
  }
  return undefined;
}

export function buildSummarizationUserMessage(assistantText: string): string {
  const clipped =
    assistantText.length > MAX_INPUT_CHARS
      ? assistantText.slice(0, MAX_INPUT_CHARS) + '…'
      : assistantText;
  return STOP_SUMMARY_PROMPT_PREFIX + clipped;
}

export function resolveAnthropicClient(): Anthropic | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey?.trim()) return undefined;
  const base = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, '');
  return new Anthropic({
    apiKey,
    ...(base ? { baseURL: base } : {}),
  });
}

export function resolveSummaryModel(): string {
  return process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL?.trim() || DEFAULT_HAIKU;
}

export async function summarizeWorkWithModel(assistantText: string): Promise<string | undefined> {
  const client = resolveAnthropicClient();
  if (!client) return undefined;

  try {
    const response = await client.messages.create({
      model: resolveSummaryModel(),
      max_tokens: 300,
      messages: [{ role: 'user', content: buildSummarizationUserMessage(assistantText) }],
    });
    const parts = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text);
    const joined = normalizeWhitespace(parts.join(' '));
    if (!joined) return undefined;
    return truncate(joined, MAX_SUMMARY_CHARS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: ${msg}\n`);
    return undefined;
  }
}

export function fallbackSummary(assistantText: string): string {
  return truncate(normalizeWhitespace(assistantText), MAX_SUMMARY_CHARS);
}

export async function notifyStopTurnFinished(): Promise<void> {
  const built = buildEvent({
    eventType: 'Stop',
    stdinJson: false,
    sound: false,
    silent: false,
  });
  if ('error' in built) {
    throw new Error(built.error);
  }
  const adapter = new DesktopNotificationAdapter();
  await adapter.notify(built);
}

export async function notifyWorkSummary(summary: string): Promise<void> {
  const built = buildEvent({
    eventType: 'Stop',
    title: 'Resumen del trabajo',
    message: summary,
    stdinJson: false,
    sound: false,
    silent: false,
  });
  if ('error' in built) {
    throw new Error(built.error);
  }
  const adapter = new DesktopNotificationAdapter();
  await adapter.notify(built);
}

export async function runStopWorkSummaryNotification(
  rawStdin: string,
  deps: {
    summarize?: (text: string) => Promise<string | undefined>;
    notify?: (summary: string) => Promise<void>;
  } = {},
): Promise<number> {
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawStdin);
    if (typeof parsed !== 'object' || parsed === null) {
      process.stderr.write('stop-work-summary-notification: stdin no es un objeto JSON\n');
      return 0;
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    process.stderr.write('stop-work-summary-notification: stdin no parseable como JSON\n');
    return 0;
  }

  const assistantText = await resolveAssistantTextForSummary(payload);
  if (!assistantText) {
    process.stderr.write(
      'stop-work-summary-notification: sin last_assistant_message ni texto en transcript_path\n',
    );
    return 0;
  }

  const summarize = deps.summarize ?? summarizeWorkWithModel;
  const notify = deps.notify ?? notifyWorkSummary;
  const summary = (await summarize(assistantText)) ?? fallbackSummary(assistantText);
  try {
    await notify(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: toast resumen: ${msg}\n`);
  }
  return 0;
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  readStdinText()
    .then((raw) => runStopWorkSummaryNotification(raw))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`stop-work-summary-notification: ${msg}\n`);
      process.exit(0);
    });
}
