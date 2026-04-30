import { describe, it, expect } from 'vitest';
import {
  classifyRequestBody,
  classifySideRequestSubType,
  extractModelFromRequestBody,
  extractToolResultIdsFromRequestBody,
  extractWebFetchUrlFromRequestBody,
} from '../../src/1-domain/services/turn-classifier.service.js';

describe('classifyRequestBody', () => {
  it('clasifica buffer vacío como preflight-warmup', () => {
    expect(classifyRequestBody(Buffer.alloc(0))).toEqual({ type: 'preflight-warmup' });
  });

  it('clasifica body con tool_result como continuation', () => {
    const body = Buffer.from(JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] }],
    }));
    expect(classifyRequestBody(body)).toEqual({ type: 'continuation' });
  });

  it('clasifica body con quota y max_tokens:1 como preflight-quota', () => {
    const body = Buffer.from('{"model":"claude","messages":[{"role":"user","content":"quota"}],"max_tokens":1}');
    expect(classifyRequestBody(body)).toEqual({ type: 'preflight-quota' });
  });

  it('clasifica body con tools como fresh', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hola' }],
      tools: [{ name: 'Read', description: 'lee un archivo', input_schema: { type: 'object', properties: {} } }],
      max_tokens: 4096,
    }));
    expect(classifyRequestBody(body)).toEqual({ type: 'fresh' });
  });

  it('clasifica body sin tools y sin quota como preflight-warmup', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hola' }],
      max_tokens: 4096,
    }));
    expect(classifyRequestBody(body)).toEqual({ type: 'preflight-warmup' });
  });

  it('clasifica body con "tools": [] como side-request', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'count tokens' }],
      tools: [],
      max_tokens: 4096,
    }));
    expect(classifyRequestBody(body)).toEqual({ type: 'side-request' });
  });

  it('clasifica body con "tools": [] con espacios como side-request', () => {
    const body = Buffer.from('{"model":"claude","messages":[],"tools" :  [ ],"max_tokens":4096}');
    expect(classifyRequestBody(body)).toEqual({ type: 'side-request' });
  });

  it('tool_result tiene prioridad sobre tools vacío', () => {
    const body = Buffer.from(JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] }],
      tools: [],
      max_tokens: 4096,
    }));
    expect(classifyRequestBody(body)).toEqual({ type: 'continuation' });
  });

  it('tool_result tiene prioridad sobre ausencia de tools', () => {
    const body = Buffer.from(JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] }],
      max_tokens: 4096,
    }));
    expect(classifyRequestBody(body)).toEqual({ type: 'continuation' });
  });

  it('classifySideRequestSubType detecta context-sync-webfetch y extrae URL', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-6',
      tools: [],
      messages: [{ role: 'user', content: 'Web page content:\n---\nhttps://example.com/path\n<html>ok</html>\n---\nResume' }],
    }));

    expect(classifySideRequestSubType(body)).toEqual({
      subType: 'context-sync-webfetch',
      url: 'https://example.com/path',
    });
  });

  it('classifySideRequestSubType extrae URL correctamente sin incluir paréntesis de markdown', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-6',
      tools: [],
      messages: [{ role: 'user', content: 'Web page content:\n---\n[Learn more](https://example.com/path)\n<html>ok</html>\n---\nResume' }],
    }));

    expect(classifySideRequestSubType(body)).toEqual({
      subType: 'context-sync-webfetch',
      url: 'https://example.com/path',
    });
  });

  it('classifySideRequestSubType retorna harness-auxiliary si no hay patrón Web page content', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-6',
      tools: [],
      messages: [{ role: 'user', content: 'count tokens' }],
    }));

    expect(classifySideRequestSubType(body)).toEqual({ subType: 'harness-auxiliary' });
  });

  it('classifySideRequestSubType retorna harness-auxiliary si la URL no está entre los dos primeros ---', () => {
    const body = Buffer.from(JSON.stringify({
      model: 'claude-sonnet-4-6',
      tools: [],
      messages: [{ role: 'user', content: 'Web page content:\n---\n<html>sin url</html>\n---\nFuera del bloque: https://example.com/outside' }],
    }));

    expect(classifySideRequestSubType(body)).toEqual({ subType: 'harness-auxiliary' });
  });

  it('extractWebFetchUrlFromRequestBody extrae URL de bloque tool_use web_fetch', () => {
    const body = Buffer.from(JSON.stringify({
      messages: [{
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'web_fetch', input: { url: 'https://example.org/a' } }],
      }],
      tools: [{ type: 'web_fetch_20250305', name: 'web_fetch' }],
    }));

    expect(extractWebFetchUrlFromRequestBody(body)).toBe('https://example.org/a');
  });

  it('extractToolResultIdsFromRequestBody extrae ids de tool_result', () => {
    const body = Buffer.from(JSON.stringify({
      messages: [{
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' },
          { type: 'tool_result', tool_use_id: 'tool-2', content: 'ok' },
        ],
      }],
    }));

    expect(extractToolResultIdsFromRequestBody(body)).toEqual(['tool-1', 'tool-2']);
  });

  it('extractModelFromRequestBody retorna model o null', () => {
    expect(extractModelFromRequestBody(Buffer.from('{"model":"claude-sonnet-4-6"}'))).toBe('claude-sonnet-4-6');
    expect(extractModelFromRequestBody(Buffer.from('{"messages":[]}'))).toBeNull();
  });
});
