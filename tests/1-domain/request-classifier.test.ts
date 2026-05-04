import { describe, it, expect } from 'vitest';
import {
  classifyRequestBody,
  classifySideRequestSubType,
  extractModelFromRequestBody,
  extractToolResultIdsFromRequestBody,
  HARNESS_CONTEXT_SYNC_SUFFIX,
} from '../../src/1-domain/services/request-classifier.service.js';

describe('classifyRequestBody', () => {
  it('clasifica buffer vacío como preflight-warmup', () => {
    expect(classifyRequestBody(Buffer.alloc(0))).toEqual({ type: 'preflight-warmup' });
  });

  it('clasifica body con tool_result como continuation', () => {
    const body = Buffer.from(
      JSON.stringify({
        messages: [
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
        ],
      }),
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'continuation' });
  });

  it('clasifica body con quota y max_tokens:1 como preflight-quota', () => {
    const body = Buffer.from(
      '{"model":"claude","messages":[{"role":"user","content":"quota"}],"max_tokens":1}',
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'preflight-quota' });
  });

  it('clasifica body con tools como fresh', () => {
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hola' }],
        tools: [
          {
            name: 'Read',
            description: 'lee un archivo',
            input_schema: { type: 'object', properties: {} },
          },
        ],
        max_tokens: 4096,
      }),
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'fresh' });
  });

  it('clasifica body sin tools y sin quota como preflight-warmup', () => {
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hola' }],
        max_tokens: 4096,
      }),
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'preflight-warmup' });
  });

  it('clasifica body con "tools": [] como side-request', () => {
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'count tokens' }],
        tools: [],
        max_tokens: 4096,
      }),
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'side-request' });
  });

  it('clasifica body con "tools": [] con espacios como side-request', () => {
    const body = Buffer.from('{"model":"claude","messages":[],"tools" :  [ ],"max_tokens":4096}');
    expect(classifyRequestBody(body)).toEqual({ type: 'side-request' });
  });

  it('tool_result tiene prioridad sobre tools vacío', () => {
    const body = Buffer.from(
      JSON.stringify({
        messages: [
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
        ],
        tools: [],
        max_tokens: 4096,
      }),
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'continuation' });
  });

  it('tool_result tiene prioridad sobre ausencia de tools', () => {
    const body = Buffer.from(
      JSON.stringify({
        messages: [
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
        ],
        max_tokens: 4096,
      }),
    );
    expect(classifyRequestBody(body)).toEqual({ type: 'continuation' });
  });
});

describe('classifySideRequestSubType — detección por sufijo del harness', () => {
  it('detecta context-sync-webfetch por HARNESS_CONTEXT_SYNC_SUFFIX', () => {
    const html = '<html><body>contenido</body></html>';
    const content = `Web page content:\n---\n${html}\n---\n${HARNESS_CONTEXT_SYNC_SUFFIX}`;
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        tools: [],
        messages: [{ role: 'user', content }],
      }),
    );

    expect(classifySideRequestSubType(body)).toEqual({
      subType: 'context-sync-webfetch',
    });
  });

  it('retorna harness-auxiliary si no contiene HARNESS_CONTEXT_SYNC_SUFFIX', () => {
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        tools: [],
        messages: [
          { role: 'user', content: 'Web page content:\n---\n<html>ok</html>\n---\nResume' },
        ],
      }),
    );

    expect(classifySideRequestSubType(body)).toEqual({ subType: 'harness-auxiliary' });
  });

  it('retorna harness-auxiliary si no hay patrón Web page content', () => {
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        tools: [],
        messages: [{ role: 'user', content: 'count tokens' }],
      }),
    );

    expect(classifySideRequestSubType(body)).toEqual({ subType: 'harness-auxiliary' });
  });

  it('retorna harness-auxiliary si tools no es array vacío', () => {
    const content = `Web page content:\n---\n<html></html>\n---\n${HARNESS_CONTEXT_SYNC_SUFFIX}`;
    const body = Buffer.from(
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        tools: [{ name: 'Read' }],
        messages: [{ role: 'user', content }],
      }),
    );

    expect(classifySideRequestSubType(body)).toEqual({ subType: 'harness-auxiliary' });
  });

  it('HARNESS_CONTEXT_SYNC_SUFFIX está exportado y es un string no vacío', () => {
    expect(typeof HARNESS_CONTEXT_SYNC_SUFFIX).toBe('string');
    expect(HARNESS_CONTEXT_SYNC_SUFFIX.length).toBeGreaterThan(10);
    expect(HARNESS_CONTEXT_SYNC_SUFFIX).toContain('125-character');
  });
});

describe('extractToolResultIdsFromRequestBody', () => {
  it('extrae ids de tool_result', () => {
    const body = Buffer.from(
      JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' },
              { type: 'tool_result', tool_use_id: 'tool-2', content: 'ok' },
            ],
          },
        ],
      }),
    );

    expect(extractToolResultIdsFromRequestBody(body)).toEqual(['tool-1', 'tool-2']);
  });
});

describe('extractModelFromRequestBody', () => {
  it('retorna model o null', () => {
    expect(extractModelFromRequestBody(Buffer.from('{"model":"claude-sonnet-4-6"}'))).toBe(
      'claude-sonnet-4-6',
    );
    expect(extractModelFromRequestBody(Buffer.from('{"messages":[]}'))).toBeNull();
  });
});
