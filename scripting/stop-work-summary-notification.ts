/**
 * Hook Stop: genera un mensaje de continuidad con modelo y emite un toast de escritorio.
 * Lee el contexto completo del workflow actual + turno previo desde el transcript JSONL.
 * El mensaje completo se persiste en sessions/.last-continuity-message.txt (Fase 2 TTS).
 */
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { DesktopNotificationAdapter } from '../src/2-services/notifications/DesktopNotificationAdapter.js';
import { buildEvent } from '../src/2-services/notifications/cli.js';
import { truncate, normalizeWhitespace } from '../src/2-services/notifications/hook-payload-notification-message.js';

const DEFAULT_HAIKU = 'claude-haiku-4-5-20251001';
const MAX_INPUT_CHARS = 15_000;
const MAX_TOAST_PREVIEW_CHARS = 250;

export const CONTINUITY_PROMPT_PREFIX =
  'Eres un asistente de continuidad para una sesión de programación con Claude Code. ' +
  'En 3-5 frases en español, en prosa continua (sin markdown, sin listas), cubre: ' +
  '(1) qué se completó en este turno, (2) qué está abierto, ambiguo o sin resolver, ' +
  '(3) la dirección sugerida para el siguiente prompt o trabajo. Sé concreto.\n\n';

interface WorkflowContext {
  previous?: { userPrompt: string; lastAssistantText: string };
  current: { userPrompt: string; messages: string[] };
}

interface TranscriptLine {
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
}

interface Segment {
  role: string;
  texts: string[];
}

export function readLastAssistantMessage(payload: Record<string, unknown>): string | undefined {
  const value = payload['last_assistant_message'];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function extractWorkflowContext(
  transcriptPath: string,
): Promise<WorkflowContext | undefined> {
  const segments: Segment[] = [];
  const rl = createInterface({
    input: createReadStream(transcriptPath, { encoding: 'utf-8' }),
  });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as TranscriptLine;
        if (!row.message?.role || !Array.isArray(row.message.content)) continue;
        const texts = row.message.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .filter((t) => t.trim().length > 0);
        if (texts.length === 0) continue;
        segments.push({ role: row.message.role, texts });
      } catch {
        /* línea no JSON */
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: transcript: ${msg}\n`);
    return undefined;
  } finally {
    rl.close();
  }

  const userIndices = segments
    .map((s, i) => (s.role === 'user' ? i : -1))
    .filter((i) => i !== -1);

  if (userIndices.length === 0) return undefined;

  if (userIndices.length === 1) {
    const userIdx = userIndices[0];
    const userPrompt = normalizeWhitespace(segments[userIdx].texts.join(' '));
    const messages = segments
      .slice(userIdx + 1)
      .filter((s) => s.role === 'assistant')
      .map((s) => normalizeWhitespace(s.texts.join(' ')))
      .filter(Boolean);
    return { current: { userPrompt, messages } };
  }

  const prevUserIdx = userIndices[userIndices.length - 2];
  const lastUserIdx = userIndices[userIndices.length - 1];

  const prevUserPrompt = normalizeWhitespace(segments[prevUserIdx].texts.join(' '));
  const assistantsBetween = segments
    .slice(prevUserIdx + 1, lastUserIdx)
    .filter((s) => s.role === 'assistant');
  const lastAssistantText =
    assistantsBetween.length > 0
      ? normalizeWhitespace(assistantsBetween[assistantsBetween.length - 1].texts.join(' '))
      : '';

  const lastUserPrompt = normalizeWhitespace(segments[lastUserIdx].texts.join(' '));
  const currentMessages = segments
    .slice(lastUserIdx + 1)
    .filter((s) => s.role === 'assistant')
    .map((s) => normalizeWhitespace(s.texts.join(' ')))
    .filter(Boolean);

  return {
    previous: { userPrompt: prevUserPrompt, lastAssistantText },
    current: { userPrompt: lastUserPrompt, messages: currentMessages },
  };
}

export function buildContinuityUserMessage(context: WorkflowContext): string {
  let body = '';
  if (context.previous) {
    body += `Turno anterior:\nUsuario: ${context.previous.userPrompt}\nAsistente: ${context.previous.lastAssistantText}\n\n`;
  }
  body += `Turno actual:\nUsuario: ${context.current.userPrompt}\n${context.current.messages.join('\n')}`;
  const clipped = body.length > MAX_INPUT_CHARS ? body.slice(0, MAX_INPUT_CHARS) + '…' : body;
  return CONTINUITY_PROMPT_PREFIX + clipped;
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

export async function generateContinuityMessage(
  context: WorkflowContext,
): Promise<string | undefined> {
  const client = resolveAnthropicClient();
  if (!client) return undefined;

  try {
    const response = await client.messages.create({
      model: resolveSummaryModel(),
      max_tokens: 600,
      messages: [{ role: 'user', content: buildContinuityUserMessage(context) }],
    });
    const parts = response.content
      .filter(
        (block): block is Extract<(typeof response.content)[number], { type: 'text' }> =>
          block.type === 'text',
      )
      .map((block) => block.text);
    const joined = normalizeWhitespace(parts.join(' '));
    return joined || undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: ${msg}\n`);
    return undefined;
  }
}

export async function writeContinuityMessage(text: string, projectDir: string): Promise<void> {
  const filePath = join(projectDir, 'sessions', '.last-continuity-message.txt');
  try {
    await writeFile(filePath, text, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: write continuity message: ${msg}\n`);
  }
}

export function fallbackSummary(assistantText: string): string {
  return normalizeWhitespace(assistantText);
}

export async function notifyContinuityMessage(message?: string): Promise<void> {
  const built = buildEvent({
    eventType: 'Stop',
    ...(message !== undefined ? { message } : {}),
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

export async function runContinuityNotification(
  rawStdin: string,
  projectDir: string,
  deps?: {
    extract?: (path: string) => Promise<WorkflowContext | undefined>;
    generate?: (ctx: WorkflowContext) => Promise<string | undefined>;
    write?: (text: string, dir: string) => Promise<void>;
    notify?: (msg?: string) => Promise<void>;
  },
): Promise<number> {
  const extract = deps?.extract ?? extractWorkflowContext;
  const generate = deps?.generate ?? generateContinuityMessage;
  const write = deps?.write ?? writeContinuityMessage;
  const notify = deps?.notify ?? notifyContinuityMessage;

  let payload: Record<string, unknown>;
  try {
    if (!rawStdin) throw new Error('stdin vacío');
    const parsed: unknown = JSON.parse(rawStdin);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('stdin no es un objeto JSON');
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    await notify();
    return 0;
  }

  const transcriptPath = payload['transcript_path'];
  let context: WorkflowContext | undefined;
  if (typeof transcriptPath === 'string' && transcriptPath.trim()) {
    context = await extract(transcriptPath.trim());
  }

  if (context === undefined) {
    const assistantText = readLastAssistantMessage(payload);
    if (assistantText) {
      context = { current: { userPrompt: '', messages: [assistantText] } };
    } else {
      await notify();
      return 0;
    }
  }

  const generated = await generate(context);
  const fullText = generated ?? fallbackSummary(context.current.messages.at(-1) ?? '');

  if (fullText && projectDir) {
    await write(fullText, projectDir);
  }

  const preview = truncate(normalizeWhitespace(fullText), MAX_TOAST_PREVIEW_CHARS);
  try {
    await notify(preview);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stop-work-summary-notification: toast: ${msg}\n`);
  }
  return 0;
}
