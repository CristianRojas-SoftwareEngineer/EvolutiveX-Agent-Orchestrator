import { describe, it, expect } from 'vitest';
import { MarkdownRendererService } from '../../src/1-domain/services/markdown-renderer.service.js';

const renderer = new MarkdownRendererService();

describe('MarkdownRendererService', () => {
  describe('renderRequestConversationMarkdown', () => {
    it('debería renderizar el prompt del usuario en formato conversacional', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hola, explícame este proyecto' }],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('# Prompt del Usuario');
      expect(md).toContain('Hola, explícame este proyecto');
      expect(md).toContain('<!-- model: claude-3-5-sonnet-20241022, max_tokens: 1024 -->');
      // No debe contener el formato técnico antiguo
      expect(md).not.toContain('**model:**');
      expect(md).not.toContain('### Message');
    });

    it('debería extraer el último mensaje user de un array de mensajes con content array', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Mensaje anterior' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Respuesta' }] },
          { role: 'user', content: [{ type: 'text', text: 'Último mensaje' }] },
        ],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('# Prompt del Usuario');
      expect(md).toContain('Último mensaje');
      expect(md).not.toContain('Mensaje anterior');
    });

    it('debería mostrar contexto de tool_results para mensajes de continuación', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_123', name: 'read_file', input: {} }],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_123', content: 'Contenido' },
              { type: 'text', text: 'Analiza el contenido' },
            ],
          },
        ],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('# Prompt del Usuario');
      expect(md).toContain('Analiza el contenido');
      expect(md).toContain('**Contexto:**');
      expect(md).toContain('read_file (toolu_123)');
    });

    it('debería indicar adjuntos de imagen y documento', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Revisa esta imagen' },
              { type: 'image', source: { type: 'base64', data: 'abc123' } },
              {
                type: 'document',
                title: 'documento.pdf',
                source: { type: 'base64', data: 'xyz789' },
              },
            ],
          },
        ],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('# Prompt del Usuario');
      expect(md).toContain('Revisa esta imagen');
      expect(md).toContain('**Adjuntos:**');
      expect(md).toContain('[Imagen adjunta]');
      expect(md).toContain('[Documento: documento.pdf]');
    });

    it('debería hacer fallback a JSON genérico para datos no-objeto', () => {
      const md = renderer.renderRequestConversationMarkdown('texto simple');
      expect(md).toContain('```json');
      expect(md).toContain('# Prompt del Usuario');
    });

    it('debería manejar mensajes sin texto de usuario', () => {
      const parsed = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('# Prompt del Usuario');
      expect(md).toContain('_[No se detectó mensaje de usuario]_');
    });

    it('debería retornar solo el último bloque text cuando el mensaje user tiene múltiples bloques text', () => {
      const parsed = {
        model: 'claude-haiku-4-5',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<system-reminder>\nLista de skills inyectada\n</system-reminder>\n',
              },
              {
                type: 'text',
                text: '<system-reminder>\nCLAUDE.md y entorno inyectados\n</system-reminder>\n',
              },
              { type: 'text', text: 'Explicame este proyecto' },
            ],
          },
        ],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('# Prompt del Usuario');
      expect(md).toContain('Explicame este proyecto');
      expect(md).not.toContain('<system-reminder>');
      expect(md).not.toContain('Lista de skills inyectada');
      expect(md).not.toContain('CLAUDE.md y entorno inyectados');
    });
  });

  describe('renderResponseConversationMarkdown', () => {
    it('debería renderizar respuesta con pensamiento, texto y acciones', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        content: [
          { type: 'thinking', thinking: 'Necesito leer el archivo para responder.' },
          { type: 'text', text: 'Voy a revisar el archivo para ti.' },
          { type: 'tool_use', id: 'toolu_456', name: 'read_file', input: { path: '/test.ts' } },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('# Respuesta del Asistente');
      expect(md).toContain('## Razonamiento interno');
      expect(md).toContain('> Necesito leer el archivo para responder.');
      expect(md).toContain('## Respuesta');
      expect(md).toContain('Voy a revisar el archivo para ti.');
      expect(md).toContain('## Acciones solicitadas');
      expect(md).toContain('**read_file** (id: `toolu_456`)');
      expect(md).toContain('  ```json');
      expect(md).toContain('"path": "/test.ts"');
      expect(md).toContain('_(stop_reason: tool_use)_');
    });

    it('debería omitir sección de razonamiento si no hay thinking', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Aquí está tu respuesta.' }],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('# Respuesta del Asistente');
      expect(md).not.toContain('## Razonamiento interno');
      expect(md).toContain('## Respuesta');
      expect(md).toContain('Aquí está tu respuesta.');
      expect(md).toContain('_(stop_reason: end_turn)_');
    });

    it('debería omitir sección de acciones si no hay tool_use', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Respuesta final sin herramientas.' }],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('# Respuesta del Asistente');
      expect(md).not.toContain('## Acciones solicitadas');
      expect(md).toContain('Respuesta final sin herramientas.');
    });

    it('debería truncar thinking muy largo', () => {
      const longThinking = 'a'.repeat(6000);
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: longThinking }],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('# Respuesta del Asistente');
      expect(md).toContain('## Razonamiento interno');
      expect(md).toContain('_[Pensamiento truncado...]_');
      expect(md.length).toBeLessThan(longThinking.length + 1000);
    });

    it('debería concatenar múltiples bloques del mismo tipo', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: 'Pensamiento 1' },
          { type: 'thinking', thinking: 'Pensamiento 2' },
          { type: 'text', text: 'Texto 1' },
          { type: 'text', text: 'Texto 2' },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('> Pensamiento 1');
      expect(md).toContain('> Pensamiento 2');
      expect(md).toContain('Texto 1\n\nTexto 2');
    });

    it('debería renderizar múltiples tool_use con sus inputs', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_111',
            name: 'skill',
            input: { skill: 'test', args: 'arg1' },
          },
          {
            type: 'tool_use',
            id: 'toolu_222',
            name: 'bash',
            input: { command: 'ls', description: 'Listar' },
          },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('## Acciones solicitadas');
      expect(md).toContain('**skill** (id: `toolu_111`)');
      expect(md).toContain('"skill": "test"');
      expect(md).toContain('**bash** (id: `toolu_222`)');
      expect(md).toContain('"command": "ls"');
    });

    it('debería hacer fallback a JSON genérico para datos no-objeto', () => {
      const md = renderer.renderResponseConversationMarkdown('texto simple');
      expect(md).toContain('```json');
      expect(md).toContain('# Respuesta del Asistente');
    });

    it('debería renderizar el code fence de tool_use sin líneas en blanco internas', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_abc', name: 'read_file', input: { path: '/src/app.ts' } },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      // El contenido del JSON debe estar directamente después del header del fence, sin línea en blanco
      expect(md).toContain('  ```json\n  {\n    "path": "/src/app.ts"\n  }\n  ```');
      // No debe haber líneas en blanco entre el header del fence y el contenido
      expect(md).not.toMatch(/```json\n\n/);
    });

    it('debería separar múltiples tool_use con línea en blanco entre ellos pero sin blancos internos en cada fence', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_111', name: 'read_file', input: { path: '/a.ts' } },
          { type: 'tool_use', id: 'toolu_222', name: 'bash', input: { command: 'ls' } },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      // Cada tool_use debe renderizarse sin blancos internos
      expect(md).toContain('  ```json\n  {\n    "path": "/a.ts"\n  }\n  ```');
      expect(md).toContain('  ```json\n  {\n    "command": "ls"\n  }\n  ```');
      // Los dos tool_use deben estar separados por \n\n (el join del array parts)
      expect(md).toContain('  ```\n\n- **bash**');
    });
  });
});
