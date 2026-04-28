import { describe, it, expect } from 'vitest';
import { buildSimulatedSseFromText } from '../../src/1-domain/services/sse-simulator.service.js';

describe('buildSimulatedSseFromText', () => {
  it('genera una secuencia SSE válida con eventos en orden', () => {
    const raw = buildSimulatedSseFromText({ text: 'Hola mundo', model: 'claude-sonnet-4-6' });
    const chunks = raw.trim().split('\n\n');

    expect(chunks).toHaveLength(6);
    expect(chunks[0]).toContain('event: message_start');
    expect(chunks[1]).toContain('event: content_block_start');
    expect(chunks[2]).toContain('event: content_block_delta');
    expect(chunks[3]).toContain('event: content_block_stop');
    expect(chunks[4]).toContain('event: message_delta');
    expect(chunks[5]).toContain('event: message_stop');
  });

  it('embebe el texto y modelo en el payload JSON', () => {
    const raw = buildSimulatedSseFromText({
      text: 'Resumen cacheado',
      model: 'claude-haiku-4.5',
      messageId: 'msg_test_1',
    });

    expect(raw).toContain('"msg_test_1"');
    expect(raw).toContain('"claude-haiku-4.5"');
    expect(raw).toContain('"Resumen cacheado"');
  });
});
