import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TranscriptContextExtractor } from '../../../src/2-services/tts/transcript-extractor.service.js';

function writeTempJsonl(lines: object[]): string {
  const path = join(tmpdir(), `transcript-test-${Date.now()}.jsonl`);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
  return path;
}

describe('TranscriptContextExtractor', () => {
  const extractor = new TranscriptContextExtractor();
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles.splice(0)) {
      try {
        unlinkSync(f);
      } catch {
        /* ignorar */
      }
    }
  });

  it('extrae mensajes de usuario con content string', async () => {
    const path = writeTempJsonl([
      { message: { role: 'user', content: 'Hola, implementa el cambio' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'Entendido' }] } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractLastNMessages(path, 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', text: 'Hola, implementa el cambio' });
    expect(result[1]).toEqual({ role: 'assistant', text: 'Entendido' });
  });

  it('respeta el límite N', async () => {
    const path = writeTempJsonl([
      { message: { role: 'user', content: 'mensaje 1' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'respuesta 1' }] } },
      { message: { role: 'user', content: 'mensaje 2' } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractLastNMessages(path, 2);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'assistant', text: 'respuesta 1' });
    expect(result[1]).toEqual({ role: 'user', text: 'mensaje 2' });
  });

  it('ignora líneas sin role y líneas no-JSON', async () => {
    const path = writeTempJsonl([
      { type: 'mode', mode: 'normal' },
      { message: { role: 'user', content: 'mensaje válido' } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractLastNMessages(path, 10);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('mensaje válido');
  });

  it('devuelve vacío si el archivo no existe', async () => {
    const result = await extractor.extractLastNMessages('/ruta/inexistente.jsonl', 5);
    expect(result).toEqual([]);
  });

  it('ignora bloques assistant con content vacío o solo thinking', async () => {
    const path = writeTempJsonl([
      { message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'razonando...' }] } },
      { message: { role: 'user', content: 'pregunta' } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractLastNMessages(path, 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', text: 'pregunta' });
  });
});

describe('TranscriptContextExtractor.extractUserPromptSubmitContext', () => {
  const extractor = new TranscriptContextExtractor();
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles.splice(0)) {
      try {
        unlinkSync(f);
      } catch {
        /* ignorar */
      }
    }
  });

  it('devuelve la tríada cuando hay un turno previo cerrado', async () => {
    const path = writeTempJsonl([
      { message: { role: 'user', content: 'Refactoriza calculateTotal' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'Voy a refactorizar' }] } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractUserPromptSubmitContext(path, 'Aplica tests');

    expect(result).toEqual({
      previousUserMessage: 'Refactoriza calculateTotal',
      lastAssistantResponse: 'Voy a refactorizar',
      currentPrompt: 'Aplica tests',
    });
  });

  it('devuelve solo el prompt actual cuando el transcript está vacío', async () => {
    const result = await extractor.extractUserPromptSubmitContext(
      '/ruta/inexistente.jsonl',
      'Hola Claude',
    );

    expect(result).toEqual({
      previousUserMessage: undefined,
      lastAssistantResponse: undefined,
      currentPrompt: 'Hola Claude',
    });
  });

  it('selecciona el último user y el último assistant con varios turnos', async () => {
    const path = writeTempJsonl([
      { message: { role: 'user', content: 'turno 1 user' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'turno 1 assistant' }] } },
      { message: { role: 'user', content: 'turno 2 user' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'turno 2 assistant' }] } },
      { message: { role: 'user', content: 'turno 3 user' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'turno 3 assistant' }] } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractUserPromptSubmitContext(path, 'turno 4 prompt');

    expect(result.previousUserMessage).toBe('turno 3 user');
    expect(result.lastAssistantResponse).toBe('turno 3 assistant');
    expect(result.currentPrompt).toBe('turno 4 prompt');
  });

  it('ignora bloques system intercalados al seleccionar por rol', async () => {
    const path = writeTempJsonl([
      { message: { role: 'user', content: 'primera petición' } },
      { message: { role: 'system', content: 'system reminder intermedio' } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'respuesta 1' }] } },
      { message: { role: 'system', content: 'otro reminder' } },
      { message: { role: 'user', content: 'segunda petición' } },
    ]);
    tempFiles.push(path);

    const result = await extractor.extractUserPromptSubmitContext(path, 'tercera petición');

    expect(result.previousUserMessage).toBe('segunda petición');
    expect(result.lastAssistantResponse).toBe('respuesta 1');
    expect(result.currentPrompt).toBe('tercera petición');
  });

  it('devuelve lastAssistantResponse undefined si no hay assistant previo', async () => {
    const path = writeTempJsonl([{ message: { role: 'user', content: 'única petición' } }]);
    tempFiles.push(path);

    const result = await extractor.extractUserPromptSubmitContext(path, 'prompt nuevo');

    expect(result.previousUserMessage).toBe('única petición');
    expect(result.lastAssistantResponse).toBeUndefined();
    expect(result.currentPrompt).toBe('prompt nuevo');
  });
});
