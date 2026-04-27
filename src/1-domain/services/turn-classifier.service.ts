import { TurnClassification } from '../types/audit.types.js';

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
  if (/'"type"\s*:\s*"(web_search_|web_fetch_|text_editor_)'/.test(str)) return { type: 'builtin-tool-execution' };
  return { type: 'fresh' };
}
