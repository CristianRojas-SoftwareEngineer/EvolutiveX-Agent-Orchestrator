/**
 * Tests para la resolución de MAX_AUDIT_BYTES y límites derivados en env.config.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MAX_AUDIT_BYTES;
    delete process.env.FILTERED_TOOLS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('MAX_AUDIT_BYTES sin definir debería usar el default (52428800)', async () => {
    delete process.env.MAX_AUDIT_BYTES;
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(52428800);
  });

  it('MAX_AUDIT_BYTES con valor negativo debería usar el default', async () => {
    process.env.MAX_AUDIT_BYTES = '-1';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(52428800);
  });

  it('MAX_AUDIT_BYTES con valor NaN debería usar el default', async () => {
    process.env.MAX_AUDIT_BYTES = 'abc';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(52428800);
  });

  it('MAX_AUDIT_BYTES con valor positivo debería usarlo directamente', async () => {
    process.env.MAX_AUDIT_BYTES = '1024';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_BYTES).toBe(1024);
  });

  it('MAX_RESPONSE_BUFFER_BYTES debería derivarse como max(audit, techo 100MB)', async () => {
    process.env.MAX_AUDIT_BYTES = '1024';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_RESPONSE_BUFFER_BYTES).toBe(104857600);
  });

  it('LOG_LEVEL sin definir debería usar info', async () => {
    delete process.env.LOG_LEVEL;
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('FILTERED_TOOLS sin definir debería usar la lista por defecto', async () => {
    delete process.env.FILTERED_TOOLS;
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
