import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

/**
 * Tests para la resolución de la variable MAX_AUDIT_SSE_RAW_BYTES
 * y la lógica de parseBytesLimit en env.config.ts.
 */
describe('Resolución de configuración de entorno', () => {
  const originalEnv = { ...process.env };

  const DEFAULT_FILTERED_TOOLS = [
    'ScheduleWakeup',
    'NotebookEdit',
    'ExitWorktree',
    'EnterWorktree',
    'CronList',
    'CronDelete',
    'CronCreate',
  ];

  beforeEach(() => {
    vi.resetModules();
    delete process.env.MAX_AUDIT_SSE_RAW_BYTES;
    delete process.env.AUDIT_SESSION_FALLBACK_HEADER;
    delete process.env.FILTERED_TOOLS;
  });

  // Restaurar el entorno completo después de todos los tests
  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('MAX_AUDIT_SSE_RAW_BYTES=0 debería resolverse a Infinity', async () => {
    process.env.MAX_AUDIT_SSE_RAW_BYTES = '0';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_SSE_RAW_BYTES).toBe(Infinity);
  });

  it('MAX_AUDIT_SSE_RAW_BYTES sin definir debería usar el default (52428800)', async () => {
    delete process.env.MAX_AUDIT_SSE_RAW_BYTES;
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_SSE_RAW_BYTES).toBe(52428800);
  });

  it('MAX_AUDIT_SSE_RAW_BYTES con valor negativo debería usar el default', async () => {
    process.env.MAX_AUDIT_SSE_RAW_BYTES = '-1';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_SSE_RAW_BYTES).toBe(52428800);
  });

  it('MAX_AUDIT_SSE_RAW_BYTES con valor NaN debería usar el default', async () => {
    process.env.MAX_AUDIT_SSE_RAW_BYTES = 'abc';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_SSE_RAW_BYTES).toBe(52428800);
  });

  it('MAX_AUDIT_SSE_RAW_BYTES con valor positivo debería usarlo directamente', async () => {
    process.env.MAX_AUDIT_SSE_RAW_BYTES = '1024';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.MAX_AUDIT_SSE_RAW_BYTES).toBe(1024);
  });

  it('AUDIT_SESSION_FALLBACK_HEADER="" debería deshabilitar el fallback', async () => {
    process.env.AUDIT_SESSION_FALLBACK_HEADER = '';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.AUDIT_SESSION_FALLBACK_HEADER).toBe('');
  });

  it('AUDIT_SESSION_FALLBACK_HEADER sin definir debería usar el default', async () => {
    delete process.env.AUDIT_SESSION_FALLBACK_HEADER;
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.AUDIT_SESSION_FALLBACK_HEADER).toBe('x-claude-code-session-id');
  });

  it('FILTERED_TOOLS sin definir debería usar la lista por defecto', async () => {
    delete process.env.FILTERED_TOOLS;
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toEqual(DEFAULT_FILTERED_TOOLS);
  });

  it('FILTERED_TOOLS="" debería desactivar el filtrado', async () => {
    process.env.FILTERED_TOOLS = '';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toEqual([]);
  });

  it('FILTERED_TOOLS con solo espacios debería desactivar el filtrado', async () => {
    process.env.FILTERED_TOOLS = '   ';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toEqual([]);
  });

  it('FILTERED_TOOLS="," debería desactivar el filtrado', async () => {
    process.env.FILTERED_TOOLS = ',';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toEqual([]);
  });

  it('FILTERED_TOOLS con lista personalizada debería parsearla', async () => {
    process.env.FILTERED_TOOLS = 'ScheduleWakeup,CronCreate';
    const { config } = await import('../../src/4-api/config/env.config.js');
    expect(config.FILTERED_TOOLS).toEqual(['ScheduleWakeup', 'CronCreate']);
  });
});
