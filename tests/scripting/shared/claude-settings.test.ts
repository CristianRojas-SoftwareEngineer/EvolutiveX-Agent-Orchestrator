import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveRefreshInterval,
  STATUSLINE_REFRESH_INTERVAL_KEY,
} from '../../../scripting/shared/claude-settings.js';

describe('resolveRefreshInterval', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna 3 cuando la variable está ausente', () => {
    expect(resolveRefreshInterval({})).toBe(3);
  });

  it('retorna null cuando la variable es string vacío', () => {
    expect(resolveRefreshInterval({ [STATUSLINE_REFRESH_INTERVAL_KEY]: '' })).toBeNull();
  });

  it('retorna null cuando la variable es "0"', () => {
    expect(resolveRefreshInterval({ [STATUSLINE_REFRESH_INTERVAL_KEY]: '0' })).toBeNull();
  });

  it('retorna el entero cuando la variable es numérica válida', () => {
    expect(resolveRefreshInterval({ [STATUSLINE_REFRESH_INTERVAL_KEY]: '2' })).toBe(2);
  });

  it('retorna 3 con warning cuando la variable no es numérica', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(resolveRefreshInterval({ [STATUSLINE_REFRESH_INTERVAL_KEY]: 'off' })).toBe(3);
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toContain('off');
    expect(written).toContain('3');
  });
});
