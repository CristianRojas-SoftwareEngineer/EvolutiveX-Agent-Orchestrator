import { SideRequestSubType, TurnClassification } from '../types/audit.types.js';

/**
 * Clasifica el tipo de request según el contenido del body.
 * Búsqueda string-based sobre el buffer sin parsear JSON completo.
 * Asume protocolo Claude Code donde los mensajes de usuario incluyen "tools".
 */
export function classifyRequestBody(bodyBuffer: Buffer): TurnClassification {
  if (!bodyBuffer.length) return { type: 'preflight-warmup' };
  const str = bodyBuffer.toString('utf8');
  if (str.includes('"tool_result"')) return { type: 'continuation' };
  if (str.includes('"quota"') && str.includes('"max_tokens":1')) return { type: 'preflight-quota' };
  if (!str.includes('"tools"')) return { type: 'preflight-warmup' };
  if (/"tools"\s*:\s*\[\s*\]/.test(str)) return { type: 'side-request' };
  // Detectar ejecuciones de built-in tools: tools con campo "type" que empieza con web_search_, web_fetch_, o text_editor_
  if (/"type"\s*:\s*"(web_search_|web_fetch_|text_editor_)/.test(str)) return { type: 'builtin-tool-execution' };
  return { type: 'fresh' };
}

function safeParse(bodyBuffer: Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(bodyBuffer.toString('utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    if (typeof block.text === 'string') {
      parts.push(block.text);
      continue;
    }
    if (typeof block.content === 'string') {
      parts.push(block.content);
    }
  }
  return parts.join('\n');
}

function extractLastUserMessageText(root: Record<string, unknown>): string {
  const messages = root.messages;
  if (!Array.isArray(messages) || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;
    if (m.role === 'user') {
      return extractTextFromContent(m.content);
    }
  }
  return '';
}

export function classifySideRequestSubType(
  bodyBuffer: Buffer,
): { subType: SideRequestSubType; url?: string } {
  const parsed = safeParse(bodyBuffer);
  if (!parsed) {
    return { subType: 'harness-auxiliary' };
  }

  const tools = parsed.tools;
  if (!Array.isArray(tools) || tools.length !== 0) {
    return { subType: 'harness-auxiliary' };
  }

  const text = extractLastUserMessageText(parsed);
  if (!text.includes('Web page content:') || !text.includes('---')) {
    return { subType: 'harness-auxiliary' };
  }

  const url = extractContextSyncUrl(text);
  if (!url) {
    return { subType: 'harness-auxiliary' };
  }

  return { subType: 'context-sync-webfetch', url };
}

function findWebFetchUrlInObject(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;

  const obj = node as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.toLowerCase() : '';
  const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';

  if (name === 'web_fetch' || type === 'web_fetch' || type.startsWith('web_fetch_')) {
    if (obj.input && typeof obj.input === 'object' && !Array.isArray(obj.input)) {
      const input = obj.input as Record<string, unknown>;
      if (typeof input.url === 'string') return input.url;
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findWebFetchUrlInObject(item);
      if (found) return found;
    }
    return null;
  }

  for (const value of Object.values(obj)) {
    const found = findWebFetchUrlInObject(value);
    if (found) return found;
  }

  return null;
}

export function extractWebFetchUrlFromRequestBody(bodyBuffer: Buffer): string | null {
  const parsed = safeParse(bodyBuffer);
  if (!parsed) return null;
  return findWebFetchUrlInObject(parsed);
}

export function extractToolResultIdsFromRequestBody(bodyBuffer: Buffer): string[] {
  const parsed = safeParse(bodyBuffer);
  if (!parsed) return [];
  const messages = parsed.messages;
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || typeof lastMsg !== 'object') return [];
  const content = (lastMsg as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  const ids: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      ids.push(block.tool_use_id);
    }
  }
  return ids;
}

export function extractModelFromRequestBody(bodyBuffer: Buffer): string | null {
  const parsed = safeParse(bodyBuffer);
  if (!parsed) return null;
  return typeof parsed.model === 'string' ? parsed.model : null;
}

function extractContextSyncUrl(text: string): string | null {
  const firstFence = text.indexOf('---');
  if (firstFence < 0) return null;
  const secondFence = text.indexOf('---', firstFence + 3);
  if (secondFence < 0) return null;
  const betweenFences = text.slice(firstFence + 3, secondFence);
  const m = betweenFences.match(/https?:\/\/[^\s"'`<>()]+/i);
  return m?.[0] ?? null;
}
