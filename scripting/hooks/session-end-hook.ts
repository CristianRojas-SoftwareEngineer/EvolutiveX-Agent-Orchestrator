/**
 * Hook SessionEnd → POST /hooks del proxy.
 *
 * Cliente HTTP autocontenido invocado con `node` directo (type-stripping nativo,
 * sin npx/tsx/build). Lee el payload JSON de stdin y lo reenvía con `fetch` de
 * forma síncrona dentro de la ventana de teardown de Claude Code. Solo usa
 * builtins `node:` y sintaxis borrable (erasable-only) para que `node` lo ejecute
 * sin resolver módulos del repo; por eso NO importa `post-hook-event.ts` (es un
 * cliente delgado e independiente del contrato estable `/hooks`).
 */
import { stdin, stderr, env, exit } from 'node:process';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

function resolveHooksUrl(baseUrl: string = env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return `${trimmed}/hooks`;
}

async function readStdinBuffer(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function main(): Promise<number> {
  const body = await readStdinBuffer();
  const url = resolveHooksUrl();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body.toString('utf-8'),
    });
    if (!res.ok) {
      stderr.write(`session-end-hook: HTTP ${res.status} ${url}\n`);
      return 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`session-end-hook: ${msg}\n`);
    return 1;
  }
  return 0;
}

main()
  .then((code) => exit(code))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`session-end-hook: ${msg}\n`);
    exit(1);
  });
