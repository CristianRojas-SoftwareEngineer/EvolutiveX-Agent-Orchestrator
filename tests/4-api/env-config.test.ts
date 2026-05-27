/**
 * Tests para la resolución de MAX_AUDIT_BYTES y límites derivados en env.config.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_MAX_AUDIT_BYTES,
  DEFAULT_PROXY_BUFFER_CEILING_BYTES,
} from '../../src/1-domain/constants/audit-limits.js';

describe('env.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MAX_AUDIT_BYTES;
    delete process.env.FILTERED_TOOLS;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('MAX_AUDIT_BYTES sin definir debería usar el default', async () => {
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(DEFAULT_MAX_AUDIT_BYTES);
  });

  it.each([
    ['negativo', '-1'],
    ['NaN', 'abc'],
    ['vacío', ''],
  ])('MAX_AUDIT_BYTES inválido (%s) debería usar el default', async (_label, envValue) => {
    process.env.MAX_AUDIT_BYTES = envValue;
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(DEFAULT_MAX_AUDIT_BYTES);
  });

  it('MAX_AUDIT_BYTES con valor positivo debería usarlo directamente', async () => {
    process.env.MAX_AUDIT_BYTES = '1024';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(1024);
  });

  it.each([
    ['audit menor que techo', '1024', DEFAULT_PROXY_BUFFER_CEILING_BYTES],
    [
      'audit mayor que techo',
      String(DEFAULT_PROXY_BUFFER_CEILING_BYTES + 1),
      DEFAULT_PROXY_BUFFER_CEILING_BYTES + 1,
    ],
  ])(
    'MAX_RESPONSE_BUFFER_BYTES debería ser max(audit, techo) cuando %s',
    async (_label, auditEnv, expectedBuffer) => {
      process.env.MAX_AUDIT_BYTES = auditEnv;
      const { config } = await import('../../src/4-api/config/env.config.js');
      expect(config.MAX_RESPONSE_BUFFER_BYTES).toBe(expectedBuffer);
    },
  );

  it('LOG_LEVEL sin definir debería usar info', async () => {
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('FILTERED_TOOLS sin definir debería usar la lista por defecto', async () => {
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toContain('ScheduleWakeup');
    expect(config.FILTERED_TOOLS).toHaveLength(7);
  });

  it('FILTERED_TOOLS="" debería deshabilitar el filtrado', async () => {
    process.env.FILTERED_TOOLS = '';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toEqual([]);
  });
});
