import { describe, it, expect } from 'vitest';
import { RedactService } from '../../src/1-domain/services/redact.service.js';

const redact = new RedactService();

describe('RedactService', () => {
  describe('redactHeaders', () => {
    it('debería redactar cabeceras sensibles', () => {
      const headers = {
        authorization: 'Bearer <ANTHROPIC_KEY_REDACTED>secret',
        'x-api-key': 'my-key',
        'content-type': 'application/json',
        cookie: 'session=abc',
      };
      const result = redact.redactHeaders(headers);
      expect(result['authorization']).toBe('[REDACTED]');
      expect(result['x-api-key']).toBe('[REDACTED]');
      expect(result['cookie']).toBe('[REDACTED]');
      expect(result['content-type']).toBe('application/json');
    });

    it('debería manejar cabeceras con arrays', () => {
      const headers = {
        'set-cookie': ['session=abc', 'token=xyz'],
        accept: 'text/html',
      };
      const result = redact.redactHeaders(headers);
      expect(result['set-cookie']).toEqual(['[REDACTED]', '[REDACTED]']);
      expect(result['accept']).toBe('text/html');
    });

    it('debería retornar objeto vacío para input inválido', () => {
      const result = redact.redactHeaders(null as unknown as Record<string, string>);
      expect(result).toEqual({});
    });
  });

  describe('deepRedactJson', () => {
    it('debería redactar claves sensibles en JSON anidado', () => {
      const obj = {
        user: 'alice',
        api_key: 'secret-123',
        nested: {
          password: 'hunter2',
          data: 'visible',
        },
      };
      const result = redact.deepRedactJson(obj) as Record<string, unknown>;
      expect(result['api_key']).toBe('[REDACTED]');
      expect((result['nested'] as Record<string, unknown>)['password']).toBe('[REDACTED]');
      expect((result['nested'] as Record<string, unknown>)['data']).toBe('visible');
      expect(result['user']).toBe('alice');
    });

    it('debería manejar arrays', () => {
      const arr = [{ token: 'abc' }, { name: 'visible' }];
      const result = redact.deepRedactJson(arr) as Record<string, unknown>[];
      expect(result[0]['token']).toBe('[REDACTED]');
      expect(result[1]['name']).toBe('visible');
    });

    it('debería limitar profundidad de recursión', () => {
      const result = redact.deepRedactJson({ a: 'b' }, 33);
      expect(result).toBe('[MAX_DEPTH]');
    });
  });

  describe('tryParseJson', () => {
    it('debería parsear JSON válido', () => {
      const buf = Buffer.from('{"key":"value"}', 'utf8');
      expect(redact.tryParseJson(buf)).toEqual({ key: 'value' });
    });

    it('debería retornar null para JSON inválido', () => {
      const buf = Buffer.from('not json', 'utf8');
      expect(redact.tryParseJson(buf)).toBeNull();
    });

    it('debería retornar null para buffer vacío', () => {
      expect(redact.tryParseJson(Buffer.alloc(0))).toBeNull();
      expect(redact.tryParseJson(null)).toBeNull();
    });
  });
});
