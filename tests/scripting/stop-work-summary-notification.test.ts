import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  buildContinuityUserMessage,
  CONTINUITY_PROMPT_PREFIX,
  extractWorkflowContext,
  fallbackSummary,
  generateContinuityMessage,
  readLastAssistantMessage,
  runContinuityNotification,
  writeContinuityMessage,
} from '../../scripting/stop-work-summary-notification.js';

describe('readLastAssistantMessage', () => {
  it('extrae last_assistant_message no vacío', () => {
    expect(readLastAssistantMessage({ last_assistant_message: '  Hecho.  ' })).toBe('Hecho.');
  });

  it('devuelve undefined si falta o está vacío', () => {
    expect(readLastAssistantMessage({})).toBeUndefined();
    expect(readLastAssistantMessage({ last_assistant_message: '   ' })).toBeUndefined();
  });
});

describe('extractWorkflowContext', () => {
  it('extrae contexto con dos turnos de usuario', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'continuity-'));
    const path = join(dir, 'transcript.jsonl');
    await writeFile(
      path,
      [
        '{"message":{"role":"user","content":[{"type":"text","text":"Primera pregunta"}]}}',
        '{"message":{"role":"assistant","content":[{"type":"text","text":"Primera respuesta."}]}}',
        '{"message":{"role":"assistant","content":[{"type":"text","text":"Respuesta final turno 1."}]}}',
        '{"message":{"role":"user","content":[{"type":"text","text":"Segunda pregunta"}]}}',
        '{"message":{"role":"assistant","content":[{"type":"text","text":"Respuesta turno 2."}]}}',
      ].join('\n'),
      'utf-8',
    );

    const ctx = await extractWorkflowContext(path);
    expect(ctx).toBeDefined();
    expect(ctx!.previous).toBeDefined();
    expect(ctx!.previous!.userPrompt).toBe('Primera pregunta');
    expect(ctx!.previous!.lastAssistantText).toBe('Respuesta final turno 1.');
    expect(ctx!.current.userPrompt).toBe('Segunda pregunta');
    expect(ctx!.current.messages).toEqual(['Respuesta turno 2.']);
  });

  it('extrae contexto con un solo turno de usuario', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'continuity-'));
    const path = join(dir, 'transcript.jsonl');
    await writeFile(
      path,
      [
        '{"message":{"role":"user","content":[{"type":"text","text":"Única pregunta"}]}}',
        '{"message":{"role":"assistant","content":[{"type":"text","text":"Única respuesta."}]}}',
      ].join('\n'),
      'utf-8',
    );

    const ctx = await extractWorkflowContext(path);
    expect(ctx).toBeDefined();
    expect(ctx!.previous).toBeUndefined();
    expect(ctx!.current.userPrompt).toBe('Única pregunta');
    expect(ctx!.current.messages).toEqual(['Única respuesta.']);
  });

  it('devuelve undefined para archivo no legible', async () => {
    const ctx = await extractWorkflowContext('/ruta/inexistente/transcript.jsonl');
    expect(ctx).toBeUndefined();
  });
});

describe('buildContinuityUserMessage', () => {
  it('incluye el prefijo y solo el turno actual cuando no hay previo', () => {
    const msg = buildContinuityUserMessage({
      current: { userPrompt: 'Haz el deploy', messages: ['Deploy listo.'] },
    });
    expect(msg.startsWith(CONTINUITY_PROMPT_PREFIX)).toBe(true);
    expect(msg).toContain('Turno actual:');
    expect(msg).not.toContain('Turno anterior:');
    expect(msg).toContain('Haz el deploy');
    expect(msg).toContain('Deploy listo.');
  });

  it('incluye turno anterior cuando existe', () => {
    const msg = buildContinuityUserMessage({
      previous: { userPrompt: 'Pregunta anterior', lastAssistantText: 'Respuesta anterior.' },
      current: { userPrompt: 'Pregunta actual', messages: ['Respuesta actual.'] },
    });
    expect(msg).toContain('Turno anterior:');
    expect(msg).toContain('Pregunta anterior');
    expect(msg).toContain('Respuesta anterior.');
    expect(msg).toContain('Turno actual:');
    expect(msg).toContain('Pregunta actual');
  });

  it('trunca el input a MAX_INPUT_CHARS', () => {
    const longText = 'x'.repeat(20_000);
    const msg = buildContinuityUserMessage({
      current: { userPrompt: '', messages: [longText] },
    });
    expect(msg.length).toBeLessThanOrEqual(CONTINUITY_PROMPT_PREFIX.length + 15_000 + 2);
  });
});

describe('fallbackSummary', () => {
  it('normaliza el espacio sin truncar texto largo', () => {
    const long = 'a'.repeat(400);
    const result = fallbackSummary(long);
    expect(result.length).toBeGreaterThan(320);
  });

  it('normaliza espacios múltiples', () => {
    expect(fallbackSummary('hola   mundo')).toBe('hola mundo');
  });
});

describe('writeContinuityMessage', () => {
  it('escribe el texto en sessions/.last-continuity-message.txt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'continuity-'));
    await mkdir(join(dir, 'sessions'));

    await writeContinuityMessage('Mensaje de continuidad.', dir);

    const content = await readFile(join(dir, 'sessions', '.last-continuity-message.txt'), 'utf-8');
    expect(content).toBe('Mensaje de continuidad.');
  });

  it('no lanza si la escritura falla', async () => {
    await expect(
      writeContinuityMessage('texto', '/ruta/que/no/existe/nunca'),
    ).resolves.toBeUndefined();
  });
});

describe('generateContinuityMessage', () => {
  it('devuelve undefined si no hay credenciales', async () => {
    const saved = {
      key: process.env.ANTHROPIC_API_KEY,
      token: process.env.ANTHROPIC_AUTH_TOKEN,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    try {
      const result = await generateContinuityMessage({
        current: { userPrompt: 'Test', messages: ['Respuesta.'] },
      });
      expect(result).toBeUndefined();
    } finally {
      if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
      if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
    }
  });
});

describe('runContinuityNotification', () => {
  it('emite toast de catálogo si stdin está vacío', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const code = await runContinuityNotification('', '', { notify });
    expect(code).toBe(0);
    expect(notify).toHaveBeenCalledWith();
  });

  it('emite toast de catálogo si stdin es JSON inválido', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const code = await runContinuityNotification('no-es-json', '', { notify });
    expect(code).toBe(0);
    expect(notify).toHaveBeenCalledWith();
  });

  it('emite toast de catálogo si no hay texto fuente', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const code = await runContinuityNotification(JSON.stringify({ hook_event_name: 'Stop' }), '', {
      notify,
    });
    expect(code).toBe(0);
    expect(notify).toHaveBeenCalledWith();
  });

  it('flujo completo con contexto y modelo disponible', async () => {
    const context = { current: { userPrompt: 'Haz los tests', messages: ['Tests pasando.'] } };
    const extract = vi.fn().mockResolvedValue(context);
    const generate = vi.fn().mockResolvedValue('Mensaje de continuidad generado.');
    const write = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn().mockResolvedValue(undefined);

    const code = await runContinuityNotification(
      JSON.stringify({ hook_event_name: 'Stop', transcript_path: '/ruta/transcript.jsonl' }),
      '/proyecto',
      { extract, generate, write, notify },
    );

    expect(code).toBe(0);
    expect(extract).toHaveBeenCalledWith('/ruta/transcript.jsonl');
    expect(generate).toHaveBeenCalledWith(context);
    expect(write).toHaveBeenCalledWith('Mensaje de continuidad generado.', '/proyecto');
    expect(notify).toHaveBeenCalledWith('Mensaje de continuidad generado.');
  });

  it('usa fallback de last_assistant_message cuando extract devuelve undefined', async () => {
    const extract = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn().mockResolvedValue(undefined);

    await runContinuityNotification(
      JSON.stringify({
        hook_event_name: 'Stop',
        transcript_path: '/ruta/transcript.jsonl',
        last_assistant_message: 'Listo el deploy.',
      }),
      '',
      { extract, generate, write, notify },
    );

    expect(notify).toHaveBeenCalledWith('Listo el deploy.');
  });

  it('usa fallback de texto truncado si el modelo no devuelve texto', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    await runContinuityNotification(
      JSON.stringify({ last_assistant_message: 'Refactor completo.' }),
      '',
      {
        generate: async () => undefined,
        notify,
      },
    );
    expect(notify).toHaveBeenCalledWith('Refactor completo.');
  });
});
