import { describe, it, expect } from 'vitest';
import {
  getWorkflowDir,
  getStepDir,
  getToolsDir,
  getToolDir,
} from '../../src/2-services/session-routing.js';

describe('session-routing', () => {
  it('getWorkflowDir genera ruta correcta', () => {
    expect(getWorkflowDir('sess-abc', 1)).toBe('sess-abc/workflows/01/');
  });

  it('getStepDir genera ruta correcta', () => {
    expect(getStepDir('sess-abc', 1, 3)).toBe('sess-abc/workflows/01/steps/03/');
  });

  it('getToolsDir genera ruta correcta', () => {
    expect(getToolsDir('sess-abc', 1, 1)).toBe('sess-abc/workflows/01/steps/01/tools/');
  });

  it('getToolDir genera ruta con slug normalizado', () => {
    expect(getToolDir('sess-abc', 1, 1, 1, 'Read')).toBe(
      'sess-abc/workflows/01/steps/01/tools/01-Read/',
    );
  });

  it('índices con zero-padding correcto para >= 10', () => {
    expect(getWorkflowDir('sess-1', 10)).toContain('workflows/10/');
  });

  it('tool name con caracteres especiales se normaliza a slug con guiones', () => {
    expect(getToolDir('s', 1, 1, 2, 'my_custom.tool')).toBe(
      's/workflows/01/steps/01/tools/02-my-custom-tool/',
    );
  });

  it('tool name largo se trunca a 32 caracteres de slug (máx 35 con índice)', () => {
    const dir = getToolDir('s', 1, 1, 1, 'A'.repeat(50));
    const slug = dir.split('tools/')[1].replace(/\/$/, '');
    expect(slug.length).toBeLessThanOrEqual(35);
  });
});
