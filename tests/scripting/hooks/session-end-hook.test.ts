import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El hook SessionEnd se invoca con `node` directo (type-stripping nativo), por lo
 * que NO puede importar módulos del repo: debe ser autocontenido (solo `node:`
 * builtins + `fetch` global) y erasable-only. Verificamos esas invariantes sobre
 * el fuente para no acoplar el test a la ejecución `node`-directa.
 */
describe('session-end-hook (autocontenido)', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../../scripting/hooks/session-end-hook.ts'),
    'utf-8',
  );

  it('solo importa builtins node: (sin imports relativos al repo)', () => {
    const importLines = source.match(/^import .*$/gm) ?? [];
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line, `import no-builtin: ${line}`).toMatch(/from ['"]node:/);
    }
  });

  it('resuelve la URL de /hooks vía ANTHROPIC_BASE_URL y hace POST', () => {
    expect(source).toContain('ANTHROPIC_BASE_URL');
    expect(source).toContain('/hooks');
    expect(source).toContain("method: 'POST'");
  });

  it('no usa async hook ni spawn detached (entrega síncrona)', () => {
    expect(source).not.toContain('spawn');
    expect(source).not.toContain('detached');
    expect(source).not.toContain('unref');
  });
});
