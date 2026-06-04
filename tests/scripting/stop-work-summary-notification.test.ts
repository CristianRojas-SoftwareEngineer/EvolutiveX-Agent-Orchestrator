import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSummarizationUserMessage,
  fallbackSummary,
  readLastAssistantMessage,
  readLastAssistantTextFromTranscript,
  resolveAssistantTextForSummary,
  runStopWorkSummaryNotification,
  STOP_SUMMARY_PROMPT_PREFIX,
} from '../../scripting/stop-work-summary-notification.js';

describe('readLastAssistantMessage', () => {
  it('extrae last_assistant_message no vacío', () => {
    expect(
      readLastAssistantMessage({ last_assistant_message: '  Hecho.  ' }),
    ).toBe('Hecho.');
  });

  it('devuelve undefined si falta o está vacío', () => {
    expect(readLastAssistantMessage({})).toBeUndefined();
    expect(readLastAssistantMessage({ last_assistant_message: '   ' })).toBeUndefined();
  });
});

describe('buildSummarizationUserMessage', () => {
  it('incluye el prefijo y el texto del asistente', () => {
    const msg = buildSummarizationUserMessage('Refactor listo.');
    expect(msg.startsWith(STOP_SUMMARY_PROMPT_PREFIX)).toBe(true);
    expect(msg.endsWith('Refactor listo.')).toBe(true);
  });
});

describe('fallbackSummary', () => {
  it('normaliza y trunca texto largo', () => {
    const long = 'a'.repeat(400);
    expect(fallbackSummary(long).length).toBeLessThanOrEqual(321);
  });
});

describe('readLastAssistantTextFromTranscript', () => {
  it('devuelve el último mensaje assistant con bloques text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stop-summary-'));
    const path = join(dir, 'transcript.jsonl');
    await writeFile(
      path,
      [
        '{"message":{"role":"user","content":[{"type":"text","text":"Hola"}]}}',
        '{"message":{"role":"assistant","content":[{"type":"text","text":"Primera respuesta."}]}}',
        '{"message":{"role":"assistant","content":[{"type":"text","text":"Respuesta final del turno."}]}}',
      ].join('\n'),
      'utf-8',
    );
    await expect(readLastAssistantTextFromTranscript(path)).resolves.toBe(
      'Respuesta final del turno.',
    );
  });
});

describe('resolveAssistantTextForSummary', () => {
  it('prefiere last_assistant_message', async () => {
    await expect(
      resolveAssistantTextForSummary({ last_assistant_message: 'Directo' }),
    ).resolves.toBe('Directo');
  });
});

describe('runStopWorkSummaryNotification', () => {
  it('no notifica si no hay texto del asistente', async () => {
    const notify = vi.fn();
    const code = await runStopWorkSummaryNotification(
      JSON.stringify({ hook_event_name: 'Stop' }),
      { notify },
    );
    expect(code).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifica con resumen del modelo o fallback', async () => {
    const notify = vi.fn();
    await runStopWorkSummaryNotification(
      JSON.stringify({
        hook_event_name: 'Stop',
        last_assistant_message: 'Completé los tests.',
      }),
      {
        summarize: async () => 'Tests pasando.',
        notify,
      },
    );
    expect(notify).toHaveBeenCalledWith('Tests pasando.');
  });

  it('usa fallback si el modelo no devuelve texto', async () => {
    const notify = vi.fn();
    await runStopWorkSummaryNotification(
      JSON.stringify({
        last_assistant_message: 'Listo el deploy.',
      }),
      {
        summarize: async () => undefined,
        notify,
      },
    );
    expect(notify).toHaveBeenCalledWith('Listo el deploy.');
  });
});
