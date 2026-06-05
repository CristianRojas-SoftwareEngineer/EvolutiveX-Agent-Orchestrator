import { RequestClassification } from '../types/audit.types.js';

/**
 * Clasifica el tipo de request según el contenido del body.
 * Búsqueda string-based sobre el buffer sin parsear JSON completo.
 * Asume protocolo Claude Code donde los mensajes de usuario incluyen "tools".
 */
export function classifyRequestBody(bodyBuffer: Buffer): RequestClassification {
  if (!bodyBuffer.length) return { type: 'preflight-warmup' };
  const str = bodyBuffer.toString('utf8');
  // Fast-path: si no hay "tool_result" en todo el buffer, no es continuation.
  // Si hay, confirmar semánticamente que esté en el último mensaje (no en historial acumulado).
  if (str.includes('"tool_result"') && extractToolResultIdsFromRequestBody(bodyBuffer).length > 0) {
    return { type: 'continuation' };
  }
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

/**
 * Detecta si un request es una llamada de implementación WebFetch interna.
 * Las implementaciones WebFetch reales llegan como requests con "tools": [] y
 * el primer mensaje contiene contenido de página ("Web page content:").
 * Esta función permite distinguir WebFetch interno de side-request genérico.
 */
export function isWebFetchImplementationRequestBody(rawBody: Buffer): boolean {
  const parsed = safeParse(rawBody);
  if (!parsed) return false;

  // Verificar que tools sea un array vacío
  const tools = parsed.tools;
  if (!Array.isArray(tools) || tools.length !== 0) return false;

  // Verificar que el primer mensaje contenga "Web page content:"
  const messages = parsed.messages;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const firstMsg = messages[0];
  if (!firstMsg || typeof firstMsg !== 'object') return false;

  const content = (firstMsg as Record<string, unknown>).content;
  if (!Array.isArray(content)) return false;

  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text.includes('Web page content:')) {
        return true;
      }
    }
  }

  return false;
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
