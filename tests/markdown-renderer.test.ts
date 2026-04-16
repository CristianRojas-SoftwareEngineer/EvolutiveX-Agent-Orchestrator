import { describe, it, expect } from 'vitest';
import { MarkdownRendererService } from '../src/services/markdown-renderer.service.js';

const renderer = new MarkdownRendererService();

describe('MarkdownRendererService', () => {
  describe('renderRequestBodyMarkdown', () => {
    it('debería renderizar parámetros top-level de una petición', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hola' }],
      };
      const md = renderer.renderRequestBodyMarkdown(parsed);
      expect(md).toContain('# Request body');
      expect(md).toContain('**model:**');
      expect(md).toContain('**max_tokens:**');
    });

    it('debería renderizar mensajes con bloques de contenido', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hola mundo' }],
          },
        ],
      };
      const md = renderer.renderRequestBodyMarkdown(parsed);
      expect(md).toContain('### Message 1 (user)');
      expect(md).toContain('Hola mundo');
    });

    it('debería hacer fallback a JSON genérico para datos no-objeto', () => {
      const md = renderer.renderRequestBodyMarkdown('texto simple');
      expect(md).toContain('```json');
      expect(md).toContain('# Request body');
    });
  });

  describe('renderResponseBodyMarkdown', () => {
    it('debería renderizar metadatos de respuesta (id, model, usage)', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [{ type: 'text', text: 'Respuesta' }],
      };
      const md = renderer.renderResponseBodyMarkdown(parsed);
      expect(md).toContain('# Response message');
      expect(md).toContain('**id:** "msg_123"');
      expect(md).toContain('**model:**');
      expect(md).toContain('**usage:**');
      expect(md).toContain('## Content');
      expect(md).toContain('Respuesta');
    });
  });

  describe('renderBlock - tipos especiales', () => {
    it('debería renderizar bloques thinking con nota de signature', () => {
      const parsed = {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          {
            type: 'thinking',
            thinking: 'Estoy pensando...',
            signature: 'a'.repeat(100),
          },
        ],
      };
      const md = renderer.renderResponseBodyMarkdown(parsed);
      expect(md).toContain('Block 1: thinking');
      expect(md).toContain('_(signature: 100 chars)_');
      expect(md).toContain('Estoy pensando...');
    });

    it('debería renderizar bloques tool_use con nombre e ID', () => {
      const parsed = {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'read_file',
            input: { path: '/test.ts' },
          },
        ],
      };
      const md = renderer.renderResponseBodyMarkdown(parsed);
      expect(md).toContain('Block 1: tool_use');
      expect(md).toContain('**tool:** read_file');
      expect(md).toContain('**id:** `toolu_123`');
    });

    it('debería renderizar bloques tool_result con tool_use_id', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123',
                content: 'Contenido del archivo',
              },
            ],
          },
        ],
      };
      const md = renderer.renderRequestBodyMarkdown(parsed);
      expect(md).toContain('Block 1: tool_result');
      expect(md).toContain('**tool_use_id:** `toolu_123`');
      expect(md).toContain('Contenido del archivo');
    });

    it('debería renderizar bloques text plano', () => {
      const parsed = {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'test',
        content: [{ type: 'text', text: 'Texto plano de respuesta' }],
      };
      const md = renderer.renderResponseBodyMarkdown(parsed);
      expect(md).toContain('Block 1: text');
      expect(md).toContain('Texto plano de respuesta');
    });
  });
});
