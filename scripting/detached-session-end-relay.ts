/**
 * Relay SessionEnd: lee stdin y lanza post-hook-event.ts en proceso detached.
 * Permite que el POST /hooks complete aunque Claude Code cierre el proceso padre.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdinBuffer } from './post-hook-event.js';
import { resolvePosixAbsolutePath } from './shared/npx-tsx-command.js';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function resolveNodeExecutable(): string {
  return process.execPath;
}

function resolveTsxCli(repo: string): string {
  return resolvePosixAbsolutePath(repo, 'node_modules/tsx/dist/cli.mjs');
}

function resolvePostHookEventScript(repo: string): string {
  return resolvePosixAbsolutePath(repo, 'scripting/post-hook-event.ts');
}

/** Lanza post-hook-event.ts en proceso detached con el body ya leído. */
export function spawnDetachedPostHookEvent(body: Buffer, repo: string = repoRoot): void {
  const node = resolveNodeExecutable();
  const tsxCli = resolveTsxCli(repo);
  const relayScript = resolvePostHookEventScript(repo);

  const child = spawn(node, [tsxCli, relayScript], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
    env: process.env,
    windowsHide: true,
  });

  if (!child.stdin) {
    throw new Error('stdin del hijo detached no disponible');
  }

  child.stdin.write(body);
  child.stdin.end();
  child.unref();
}

async function main(): Promise<number> {
  const body = await readStdinBuffer();
  spawnDetachedPostHookEvent(body);
  return 0;
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`detached-session-end-relay: ${msg}\n`);
      process.exit(1);
    });
}
