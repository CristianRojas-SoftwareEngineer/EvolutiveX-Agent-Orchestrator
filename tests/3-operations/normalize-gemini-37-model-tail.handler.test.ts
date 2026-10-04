import { describe, it, expect } from 'vitest';
import { NormalizeGemini37ModelTailHandler } from '../../src/3-operations/normalize-gemini-37-model-tail.handler.js';
import { ProxyEnvironmentConfig } from '../../src/1-domain/types/config.types.js';

const baseConfig: ProxyEnvironmentConfig = {
  PORT: 8787,
  UPSTREAM_ORIGIN: 'http://localhost:20128',
  MAX_REQUEST_BODY: '50mb',
  MAX_AUDIT_BYTES: 1024 * 1024,
  MAX_RESPONSE_BUFFER_BYTES: 1024 * 1024,
  LOG_LEVEL: 'info',
  PROXY_UNREDACT_THINKING: false,
  FILTERED_TOOLS: [],
  TRANSCRIPT_CONTEXT_N: 3,
  LOG_HTTP_BODIES: false,
  LOG_HTTP_HEADERS: false,
  GEMINI_37_TAIL_PATTERN: 'gemini-3\\.7-flash',
};

describe('NormalizeGemini37ModelTailHandler', () => {
  it('retorna el mismo buffer si el body está vacío', () => {
    const handler = new NormalizeGemini37ModelTailHandler(baseConfig);
    const buf = Buffer.alloc(0);
    expect(handler.execute(buf)).toBe(buf);
  });

  it('retorna el mismo buffer si el modelo no coincide con el patrón', () => {
    const handler = new NormalizeGemini37ModelTailHandler(baseConfig);
    const original = JSON.stringify({
      model: 'claude-3-7-sonnet-20250219',
      messages: [{ role: 'assistant', content: 'test' }],
    });
    const buf = Buffer.from(original, 'utf-8');
    expect(handler.execute(buf)).toBe(buf);
  });

  it('agrega un mensaje de usuario si el último turno es assistant', () => {
    const handler = new NormalizeGemini37ModelTailHandler(baseConfig);
    const original = JSON.stringify({
      model: 'vertex/gemini-3.7-flash',
      messages: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: [{ type: 'text', text: 'Respuesta' }] },
      ],
    });
    const result = handler.execute(Buffer.from(original, 'utf-8'));
    const parsed = JSON.parse(result.toString('utf-8'));
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: '.' }],
    });
  });

  it('convierte mensajes con role system a role user y los fusiona con el turno adyacente', () => {
    const handler = new NormalizeGemini37ModelTailHandler(baseConfig);
    const original = JSON.stringify({
      model: 'vertex/gemini-3.7-flash',
      messages: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call_552010' }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_552010' }] },
        { role: 'system', content: [{ type: 'text', text: '<total_tokens>100</total_tokens>' }] },
      ],
    });
    const result = handler.execute(Buffer.from(original, 'utf-8'));
    const parsed = JSON.parse(result.toString('utf-8'));
    // El turno system se convierte a user y se fusiona con el user anterior -> 3 mensajes
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[0].role).toBe('user');
    expect(parsed.messages[1].role).toBe('assistant');
    expect(parsed.messages[2].role).toBe('user');
    expect(parsed.messages[2].content).toHaveLength(2);
  });

  it('remapea tool_use.id y tool_result.tool_use_id a IDs canónicos toolu_N', () => {
    const handler = new NormalizeGemini37ModelTailHandler(baseConfig);
    const original = JSON.stringify({
      model: 'vertex/gemini-3.7-flash',
      messages: [
        { role: 'user', content: 'Hola' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_552010', name: 'tool_a', input: {} },
            { type: 'tool_use', id: 'call_552013', name: 'tool_b', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call_552010', content: 'res a' },
            { type: 'tool_result', tool_use_id: 'call_552013', content: 'res b' },
          ],
        },
      ],
    });
    const result = handler.execute(Buffer.from(original, 'utf-8'));
    const parsed = JSON.parse(result.toString('utf-8'));
    expect(parsed.messages[1].content[0].id).toBe('toolu_1');
    expect(parsed.messages[1].content[1].id).toBe('toolu_2');
    expect(parsed.messages[2].content[0].tool_use_id).toBe('toolu_1');
    expect(parsed.messages[2].content[1].tool_use_id).toBe('toolu_2');
  });
});
