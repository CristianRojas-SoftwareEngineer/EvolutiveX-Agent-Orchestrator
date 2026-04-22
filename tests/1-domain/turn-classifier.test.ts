import { describe, it, expect } from 'vitest';
import { classifyRequestBody } from '../../src/1-domain/services/turn-classifier.service.js';

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
});
