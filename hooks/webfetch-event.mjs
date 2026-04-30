#!/usr/bin/env node
/**
 * Hook PostToolUse para registrar WebFetch completado en el caché del proxy.
 *
 * Cuando un subagente completa un WebFetch, el harness emite un Context Sync
 * que reinyecta el HTML crudo + prompt del subagente. Este hook hace un fetch
 * independiente del HTML y calcula sha256(html) + sha256(prompt) para que el
 * proxy pueda correlacionar el Context Sync entrante con el WebFetch original
 * de forma determinista (sin heurísticas de extracción de URL).
 *
 * Configuración en .claude/settings.json:
 * ```json
 * {
 *   "hooks": {
 *     "PostToolUse": [
 *       {
 *         "matcher": "WebFetch",
 *         "hooks": [
 *           {
 *             "type": "command",
 *             "command": "node hooks/webfetch-event.mjs"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * ```
 */

import { createHash } from 'node:crypto';

const PROXY_INTERNAL_URL = 'http://127.0.0.1:8787/__internal/cacheWebFetchResponse';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  if (input.tool_name !== 'WebFetch') {
    process.exit(0);
  }

  const sessionId = input.session_id;
  const url = input.tool_input?.url;
  const prompt = input.tool_input?.prompt || '';
  const toolResponse = typeof input.tool_response === 'string'
    ? input.tool_response
    : JSON.stringify(input.tool_response ?? '');

  if (!sessionId || !url) {
    process.exit(0);
  }

  const promptHash = createHash('sha256').update(prompt).digest('hex');

  let htmlBody = '';
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (resp.ok) {
      htmlBody = await resp.text();
    }
  } catch {
    // Fallo al hacer fetch del HTML — no es crítico, el proxy seguirá con MISS
    process.exit(0);
  }

  const htmlHash = createHash('sha256').update(htmlBody).digest('hex');

  try {
    await fetch(PROXY_INTERNAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        url,
        prompt,
        htmlHash,
        promptHash,
        response: toolResponse,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Fallo al enviar al proxy — no interrumpir al agente
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
