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

    it('debería concatenar múltiples bloques del mismo tipo con separador ---', () => {
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
      // El separador --- queda dentro del blockquote (cada línea lleva prefijo >)
      expect(md).toContain('> Pensamiento 1\n> \n> ---\n> \n> Pensamiento 2');
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

    it('debería preservar orden temporal de thinking interleaved con text', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: 'Pienso que debo leer el archivo...' },
          { type: 'text', text: 'Voy a revisar el archivo.' },
          { type: 'thinking', thinking: 'Ahora tengo el contenido, voy a analizarlo...' },
          { type: 'text', text: 'Aqui esta mi analisis.' },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      // Thinking debe aparecer en orden, no todos al principio
      const idxThinking1 = md.indexOf('Pienso que debo leer');
      const idxText1 = md.indexOf('Voy a revisar el archivo.');
      const idxThinking2 = md.indexOf('Ahora tengo el contenido');
      const idxText2 = md.indexOf('Aqui esta mi analisis');
      expect(idxThinking1).toBeLessThan(idxText1);
      expect(idxText1).toBeLessThan(idxThinking2);
      expect(idxThinking2).toBeLessThan(idxText2);
      // Debe usar contadores secuenciales
      expect(md).toContain('## Razonamiento interno');
      expect(md).toContain('## Razonamiento interno (2)');
      expect(md).toContain('## Respuesta');
      expect(md).toContain('## Respuesta (2)');
    });

    it('debería preservar orden de thinking intercalado con tool_use', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          { type: 'thinking', thinking: 'Necesito ejecutar un comando' },
          { type: 'tool_use', id: 'toolu_001', name: 'bash', input: { command: 'ls' } },
          { type: 'thinking', thinking: 'Ahora voy a leer el resultado' },
          { type: 'tool_use', id: 'toolu_002', name: 'read_file', input: { path: '/a.ts' } },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      const idxThinking1 = md.indexOf('Necesito ejecutar');
      const idxTool1 = md.indexOf('**bash**');
      const idxThinking2 = md.indexOf('Ahora voy a leer');
      const idxTool2 = md.indexOf('**read_file**');
      expect(idxThinking1).toBeLessThan(idxTool1);
      expect(idxTool1).toBeLessThan(idxThinking2);
      expect(idxThinking2).toBeLessThan(idxTool2);
    });

    it('debería renderizar solo un thinking sin contador', () => {
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Unico pensamiento' },
          { type: 'text', text: 'Respuesta' },
        ],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('## Razonamiento interno');
      expect(md).not.toContain('## Razonamiento interno (2)');
      expect(md).toContain('## Respuesta');
      expect(md).not.toContain('## Respuesta (2)');
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

  describe('context headers', () => {
    it('debería renderizar heading principal para main-agent sin context', () => {
      const parsed = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hola' }] };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toMatch(/^# Respuesta del Asistente/);
    });

    it('debería renderizar heading de subagente con context', () => {
      const parsed = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Resultado' }] };
      const md = renderer.renderResponseConversationMarkdown(parsed, {
        subagentType: 'general-purpose',
      });
      expect(md).toContain('# Respuesta del Subagente (`general-purpose`)');
      expect(md).toContain('**Tipo:** Subagente (`general-purpose`)');
    });

    it('debería renderizar heading de side-request con context', () => {
      const parsed = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] };
      const md = renderer.renderResponseConversationMarkdown(parsed, {
        interactionType: 'side-request',
      });
      expect(md).toContain('# Respuesta del Side-request');
    });

    it('debería renderizar heading de preflight con context', () => {
      const parsed = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] };
      const md = renderer.renderResponseConversationMarkdown(parsed, {
        interactionType: 'client-preflight',
      });
      expect(md).toContain('# Respuesta del Preflight');
    });

    it('debería incluir stepIndex y stepCount en header', () => {
      const parsed = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] };
      const md = renderer.renderResponseConversationMarkdown(parsed, {
        interactionType: 'agentic',
        stepIndex: 2,
        stepCount: 5,
        modelId: 'claude-3-5-sonnet-20241022',
      });
      expect(md).toContain('**Interacción:** Interacción Principal — Step 2 de 5');
      expect(md).toContain('**Modelo:** claude-3-5-sonnet-20241022');
    });

    it('debería incluir stepIndex y stepCount de subagente en header', () => {
      const parsed = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] };
      const md = renderer.renderResponseConversationMarkdown(parsed, {
        subagentType: 'Explore',
        stepIndex: 1,
        stepCount: 3,
        modelId: 'mimo-v2.5',
      });
      expect(md).toContain('**Interacción:** Subagente (`Explore`) — Step 1 de 3');
      expect(md).toContain('**Modelo:** mimo-v2.5');
    });

    it('debería renderizar request con context de subagente', () => {
      const parsed = {
        model: 'test',
        messages: [{ role: 'user', content: 'Hola' }],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed, {
        subagentType: 'Plan',
      });
      expect(md).toContain('# Prompt del Subagente (`Plan`)');
    });
  });

  describe('TOC multi-step', () => {
    it('debería generar TOC para multi-step', () => {
      const steps = [
        {
          stepIndex: 1,
          parsed: {
            stop_reason: 'tool_use',
            content: [
              { type: 'thinking', thinking: 'Pensando...' },
              { type: 'tool_use', id: 't1', name: 'bash', input: {} },
            ],
          },
        },
        {
          stepIndex: 2,
          parsed: {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Listo' }],
          },
        },
      ];
      const md = renderer.renderMultiStepResponseMarkdown(steps);
      expect(md).toContain('## Contenido');
      expect(md).toContain('- [Step 1 de 2 — tool_use]');
      expect(md).toContain('- [Step 2 de 2 — end_turn]');
      expect(md).toContain('  - [Razonamiento interno]');
      expect(md).toContain('  - [Acciones solicitadas]');
      expect(md).toContain('  - [Respuesta]');
    });

    it('no debería generar TOC para single-step', () => {
      const steps = [
        {
          stepIndex: 1,
          parsed: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] },
        },
      ];
      const md = renderer.renderMultiStepResponseMarkdown(steps);
      expect(md).not.toContain('## Contenido');
    });
  });

  describe('coalesced-agent-step-response', () => {
    it('debería renderizar coalesced-agent-step-response con contrato canónico', () => {
      const coalesced = {
        type: 'coalesced-agent-step-response',
        delegation: {
          message: {
            content: [
              { type: 'text', text: 'Voy a invocar subagentes para analizar el código.' },
              {
                type: 'tool_use',
                id: 'toolu_001',
                name: 'Agent',
                input: { description: 'Análisis de código' },
              },
            ],
          },
        },
        continuation: {
          request: {
            body: {
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'tool_result', tool_use_id: 'toolu_001', content: 'Resultado' },
                  ],
                },
              ],
            },
          },
          response: {
            message: {
              content: [
                { type: 'thinking', thinking: 'Procesando resultados de subagentes...' },
                { type: 'text', text: 'Basado en el análisis, el código está bien estructurado.' },
              ],
              stop_reason: 'end_turn',
            },
          },
        },
        toolUseIds: ['toolu_001'],
      };
      const md = renderer.renderResponseConversationMarkdown(coalesced);
      expect(md).toContain('## 🔀 Fase 1: Delegación inicial');
      expect(md).toContain('Voy a invocar subagentes para analizar el código.');
      expect(md).toContain('## 🔀 Fase 2: Ejecución de subagentes');
      expect(md).toContain('No se encontraron subagentes anidados para esta fase.');
      expect(md).toContain('## 🔀 Fase 3: Respuesta final coalesced');
      expect(md).toContain('Basado en el análisis, el código está bien estructurado.');
      expect(md).toContain('_(stop_reason: end_turn)_');
    });

    it('debería renderizar coalesced-agent-step-response con subagents', () => {
      const coalesced = {
        type: 'coalesced-agent-step-response',
        delegation: {
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_001',
                name: 'Agent',
                input: { description: 'Analizar' },
              },
            ],
          },
        },
        continuation: {
          request: { body: null },
          response: {
            message: {
              content: [{ type: 'text', text: 'Análisis completado.' }],
              stop_reason: 'end_turn',
            },
          },
        },
        toolUseIds: ['toolu_001'],
        subagents: {
          items: [
            {
              index: 1,
              dirName: 'sub-agent-01',
              toolUseId: 'toolu_001',
              inferredByOrder: false,
              description: 'Analizar código',
              prompt: 'Analiza el código del proyecto',
              subagentType: 'Explore',
              outcome: 'completed',
              durationMs: 1500,
              stepCount: 2,
              toolCalls: ['read_file'],
              inputTokens: 1000,
              outputTokens: 500,
              finalStopReason: 'end_turn',
              finalResponsePreview: 'El código está bien estructurado...',
              outputPath: 'sub-agent-01/output/body.parsed.md',
            },
          ],
          count: 1,
          completedCount: 1,
          failedCount: 0,
          orphanedCount: 0,
          totalDurationMs: 1500,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
        },
      };
      const md = renderer.renderResponseConversationMarkdown(coalesced);
      expect(md).toContain('## 🔀 Fase 1: Delegación inicial');
      expect(md).toContain('## 🔀 Fase 2: Ejecución de subagentes');
      expect(md).toContain('Se ejecutaron 1 subagente en paralelo durante esta fase.');
      expect(md).toContain('**Completados:** 1');
      expect(md).toContain('Subagente 1: Analizar código');
      expect(md).toContain('**Tipo:** Explore');
      expect(md).toContain('**Estado:** ✅ Completado');
      expect(md).toContain('**Respuesta preview:** El código está bien estructurado...');
      expect(md).toContain('## 🔀 Fase 3: Respuesta final coalesced');
      expect(md).toContain('Análisis completado.');
    });

    it('debería renderizar multi-step con único step coalesced', () => {
      const steps = [
        {
          stepIndex: 1,
          parsed: {
            type: 'coalesced-agent-step-response',
            delegation: {
              message: {
                content: [
                  {
                    type: 'tool_use',
                    id: 'toolu_001',
                    name: 'Agent',
                    input: { description: 'Análisis' },
                  },
                ],
              },
            },
            continuation: {
              request: { body: null },
              response: {
                message: {
                  content: [{ type: 'text', text: 'Resultado consolidado.' }],
                  stop_reason: 'end_turn',
                },
              },
            },
            toolUseIds: ['toolu_001'],
          },
        },
      ];
      const md = renderer.renderMultiStepResponseMarkdown(steps);
      expect(md).toContain('# Respuesta del Asistente');
      expect(md).toContain('## 🔀 Fase 1: Delegación inicial');
      expect(md).toContain('## 🔀 Fase 2: Ejecución de subagentes');
      expect(md).toContain('## 🔀 Fase 3: Respuesta final coalesced');
      expect(md).toContain('Resultado consolidado.');
    });

    it('debería generar TOC con entradas específicas para steps coalesced', () => {
      const steps = [
        {
          stepIndex: 1,
          parsed: {
            type: 'coalesced-agent-step-response',
            delegation: { message: { content: [] } },
            continuation: {
              request: { body: null },
              response: { message: { content: [], stop_reason: 'end_turn' } },
            },
            toolUseIds: [],
            subagents: {
              items: [
                {
                  index: 1,
                  dirName: 'sub-agent-01',
                  toolUseId: 'toolu_001',
                  inferredByOrder: false,
                  description: 'Test',
                  prompt: 'Test',
                  subagentType: null,
                  outcome: 'completed',
                  durationMs: 100,
                  stepCount: 1,
                  toolCalls: [],
                  inputTokens: 10,
                  outputTokens: 5,
                  finalStopReason: 'end_turn',
                  finalResponsePreview: 'Preview...',
                  outputPath: 'sub-agent-01/output/body.parsed.md',
                },
              ],
              count: 1,
              completedCount: 1,
              failedCount: 0,
              orphanedCount: 0,
              totalDurationMs: 100,
              totalInputTokens: 10,
              totalOutputTokens: 5,
            },
          },
        },
        {
          stepIndex: 2,
          parsed: {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Segundo step normal' }],
          },
        },
      ];
      const md = renderer.renderMultiStepResponseMarkdown(steps);
      expect(md).toContain('## Contenido');
      expect(md).toContain('- [Step 1 de 2 — end_turn]');
      expect(md).toContain('  - [Delegación inicial]');
      expect(md).toContain('  - [Ejecución de subagentes]');
      expect(md).toContain('  - [Respuesta final coalesced]');
      expect(md).toContain('- [Step 2 de 2 — end_turn]');
    });
  });

  describe('referencia thought/content.md', () => {
    it('debería usar referencia a thought/content.md cuando thoughtContentPath está presente', () => {
      const longThinking = 'a'.repeat(6000);
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: longThinking }],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed, {
        thoughtContentPath: 'thought/content.md',
      });
      expect(md).toContain('_[Pensamiento truncado — ver `thought/content.md`]');
      expect(md).not.toContain('_[Pensamiento truncado...]_');
    });

    it('debería usar indicador genérico sin thoughtContentPath', () => {
      const longThinking = 'a'.repeat(6000);
      const parsed = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: longThinking }],
      };
      const md = renderer.renderResponseConversationMarkdown(parsed);
      expect(md).toContain('_[Pensamiento truncado...]_');
    });
  });

  describe('diferenciación de contenido Skill', () => {
    it('debería detectar y renderizar contenido Skill en bloque colapsable', () => {
      const skillContent =
        'Base directory for this skill: /home/user/.claude/skills/test\n\nSkill line 1\nSkill line 2';
      const parsed = {
        model: 'test',
        messages: [{ role: 'user', content: skillContent }],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('### Contenido inyectado por Skill: test');
      expect(md).toContain('<details>');
      expect(md).toContain('<summary>Ver contenido de la Skill');
      expect(md).toContain('</details>');
    });

    it('debería extraer texto después del Skill si coexiste', () => {
      const fullPrompt =
        'Base directory for this skill: /skills/test\n\nLinea skill\n\n\n\nMi pregunta original';
      const parsed = {
        model: 'test',
        messages: [{ role: 'user', content: fullPrompt }],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).toContain('### Contenido inyectado por Skill: test');
      expect(md).toContain('Mi pregunta original');
    });

    it('no debería detectar Skill en prompts normales', () => {
      const parsed = {
        model: 'test',
        messages: [{ role: 'user', content: 'Hola, necesito ayuda' }],
      };
      const md = renderer.renderRequestConversationMarkdown(parsed);
      expect(md).not.toContain('<details>');
      expect(md).not.toContain('Contenido inyectado por Skill');
    });
  });
});
