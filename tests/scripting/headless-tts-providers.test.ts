import { describe, it, expect } from 'vitest';
import {
  discoverCatalogProviders,
  EXCLUDED_PROVIDERS,
  resolveTestProviders,
  sortProviders,
} from '../../scripting/headless/modules/providers.js';

const PROJECT_ROOT = process.cwd();

describe('discoverCatalogProviders', () => {
  it('incluye proveedores con config.json en routing/providers', () => {
    const catalog = discoverCatalogProviders(PROJECT_ROOT);
    expect(catalog).toContain('ollama');
    expect(catalog).toContain('minimax');
    expect(catalog).toContain('openrouter');
    expect(catalog).toContain('anthropic');
    expect(catalog).toContain('opencode');
    expect(catalog).toContain('xiaomi');
  });
});

describe('resolveTestProviders', () => {
  it('excluye opencode y xiaomi por defecto e incluye default', () => {
    const { providers, excludedByDefault } = resolveTestProviders({ projectRoot: PROJECT_ROOT });
    expect(providers).toEqual(['ollama', 'minimax', 'openrouter', 'anthropic', 'default']);
    expect(excludedByDefault).toEqual(['opencode', 'xiaomi']);
    for (const excluded of EXCLUDED_PROVIDERS) {
      expect(providers).not.toContain(excluded);
    }
  });

  it('respeta lista explícita aunque incluya proveedores excluidos por defecto', () => {
    const { providers } = resolveTestProviders({
      projectRoot: PROJECT_ROOT,
      explicit: ['opencode', 'ollama'],
    });
    expect(providers).toEqual(['ollama', 'opencode']);
  });

  it('aplica exclusiones adicionales al descubrir automáticamente', () => {
    const { providers } = resolveTestProviders({
      projectRoot: PROJECT_ROOT,
      extraExclude: ['anthropic'],
    });
    expect(providers).not.toContain('anthropic');
    expect(providers).toContain('default');
  });

  it('ordena según PROVIDER_EXECUTION_ORDER', () => {
    const sorted = sortProviders(['default', 'openrouter', 'ollama', 'minimax']);
    expect(sorted).toEqual(['ollama', 'minimax', 'openrouter', 'default']);
  });

  it('avisa sobre proveedores desconocidos', () => {
    const { warnings } = resolveTestProviders({
      projectRoot: PROJECT_ROOT,
      explicit: ['no-existe'],
    });
    expect(warnings.some((w) => w.includes('no-existe'))).toBe(true);
  });
});
