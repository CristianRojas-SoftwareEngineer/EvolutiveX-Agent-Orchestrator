import { createReadStream, createWriteStream } from 'node:fs';
import { renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
/** Firmas Anthropic válidas ~344 chars; Smart Code Proxy puede dejar firmas vacías o cortas. */
export function isValidThinkingSignature(sig: string | undefined): boolean {
  return (sig?.length ?? 0) >= 200;
}

interface ContentBlock {
  type?: string;
  signature?: string;
  [key: string]: unknown;
}

interface JsonlMessageLine {
  message?: {
    role?: string;
    content?: ContentBlock[];
  };
  [key: string]: unknown;
}

export async function countCorruptThinkingBlocks(jsonlPath: string): Promise<number> {
  let count = 0;
  const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }) });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as JsonlMessageLine;
        if (obj.message?.role !== 'assistant') continue;
        for (const block of obj.message.content ?? []) {
          if (block.type === 'thinking' && !isValidThinkingSignature(block.signature)) {
            count++;
          }
        }
      } catch {
        /* ignore */
      }
    }
  } finally {
    rl.close();
  }
  return count;
}

export async function repairJsonlFile(jsonlPath: string): Promise<number> {
  const tempPath = `${jsonlPath}.tmp`;
  let removedCount = 0;

  const rl = createInterface({ input: createReadStream(jsonlPath, { encoding: 'utf-8' }) });
  const writer = createWriteStream(tempPath, { encoding: 'utf-8' });

  const writeLine = (text: string): Promise<void> =>
    new Promise((resolve, reject) => {
      writer.write(text + '\n', (err) => (err ? reject(err) : resolve()));
    });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        await writeLine('');
        continue;
      }
      try {
        const obj = JSON.parse(trimmed) as JsonlMessageLine;
        if (obj.message?.role === 'assistant' && Array.isArray(obj.message.content)) {
          const originalCount = obj.message.content.length;
          obj.message.content = obj.message.content.filter(
            (block) => !(block.type === 'thinking' && !isValidThinkingSignature(block.signature)),
          );
          removedCount += originalCount - obj.message.content.length;
        }
        await writeLine(JSON.stringify(obj));
      } catch {
        await writeLine(trimmed);
      }
    }
  } finally {
    rl.close();
    await new Promise<void>((resolve, reject) => {
      writer.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
  }

  renameSync(tempPath, jsonlPath);
  return removedCount;
}
