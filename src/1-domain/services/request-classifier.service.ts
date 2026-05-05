import { RequestClassification } from '../types/audit.types.js';

/**
 * Clasifica el tipo de request según el contenido del body.
 * Búsqueda string-based sobre el buffer sin parsear JSON completo.
 * Asume protocolo Claude Code donde los mensajes de usuario incluyen "tools".
 */
export function classifyRequestBody(bodyBuffer: Buffer): RequestClassification {
  if (!bodyBuffer.length) return { type: 'preflight-warmup' };
  const str = bodyBuffer.toString('utf8');
  if (str.includes('"tool_result"')) return { type: 'continuation' };
  if (str.includes('"quota"') && str.includes('"max_tokens":1')) return { type: 'preflight-quota' };
  if (!str.includes('"tools"')) return { type: 'preflight-warmup' };
  if (/"tools"\s*:\s*\[\s*\]/.test(str)) return { type: 'side-request' };
  return { type: 'fresh' };
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
