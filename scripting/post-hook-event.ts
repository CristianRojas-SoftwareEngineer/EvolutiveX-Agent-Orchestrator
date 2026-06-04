/**
 * Relay de hooks Claude Code → POST /hooks del proxy.
 * Lee stdin (payload JSON del hook) y reenvía con fetch; evita curl/@- en PowerShell.
 */
import { stdin } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

export function resolveHooksUrl(
  baseUrl: string = process.env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL,
): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return `${trimmed}/hooks`;
}

export async function readStdinBuffer(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function postHookEvent(
  body: Buffer,
  options: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<number> {
  const url = resolveHooksUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body.toString('utf-8'),
    });
    if (!res.ok) {
      process.stderr.write(`post-hook-event: HTTP ${res.status} ${url}\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`post-hook-event: ${msg}\n`);
  }
  return 0;
}

export async function runPostHookEventCli(): Promise<number> {
  const body = await readStdinBuffer();
  return postHookEvent(body);
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isEntryPoint) {
  runPostHookEventCli()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`post-hook-event: ${msg}\n`);
      process.exit(0);
    });
}
