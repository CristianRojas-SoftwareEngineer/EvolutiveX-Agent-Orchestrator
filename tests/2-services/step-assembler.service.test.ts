import { describe, it, expect } from 'vitest';
import { StepAssemblerService } from '../../src/2-services/step-assembler.service.js';

function feed(assembler: StepAssemblerService, events: unknown[]): void {
  for (const evt of events) {
    assembler.onEvent(evt);
  }
}

describe('StepAssemblerService', () => {
  it('ensambla usage desde message_start y message_delta', () => {
    const assembler = new StepAssemblerService();
    feed(assembler, [
      {
        type: 'message_start',
        message: {
          id: 'msg-1',
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 100, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 },
        },
      },
      { type: 'message_delta', usage: { output_tokens: 42 } },
    ]);
    const result = assembler.result();
    expect(result.usage.input_tokens).toBe(100);
    expect(result.usage.output_tokens).toBe(42);
    expect(result.usage.cache_creation_input_tokens).toBe(10);
    expect(result.usage.cache_read_input_tokens).toBe(5);
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.anthropicMessageId).toBe('msg-1');
  });

  it('fallback de input_tokens y cache desde message_delta', () => {
    const assembler = new StepAssemblerService();
    feed(assembler, [
      { type: 'message_start', message: { id: 'msg-2', usage: {} } },
      {
        type: 'message_delta',
        usage: {
          output_tokens: 20,
          input_tokens: 50,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 7,
        },
      },
    ]);
    const result = assembler.result();
    expect(result.usage.input_tokens).toBe(50);
    expect(result.usage.output_tokens).toBe(20);
    expect(result.usage.cache_creation_input_tokens).toBe(3);
    expect(result.usage.cache_read_input_tokens).toBe(7);
  });

  it('captura stopReason desde message_delta y fallback en message_stop', () => {
    const assembler = new StepAssemblerService();
    feed(assembler, [
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    ]);
    expect(assembler.result().stopReason).toBe('end_turn');

    const assembler2 = new StepAssemblerService();
    feed(assembler2, [{ type: 'message_stop', stop_reason: 'max_tokens' }]);
    expect(assembler2.result().stopReason).toBe('max_tokens');
  });

  it('ensambla bloque tool_use con input acumulado', () => {
    const assembler = new StepAssemblerService();
    feed(assembler, [
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tu-1', name: 'Agent' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"subagent_type":"explore"' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: ',"prompt":"hola"}' },
      },
      { type: 'content_block_stop', index: 0 },
    ]);
    const result = assembler.result();
    expect(result.toolUseBlocks).toHaveLength(1);
    expect(result.toolUseBlocks[0].id).toBe('tu-1');
    expect(result.toolUseBlocks[0].name).toBe('Agent');
    expect(result.toolUseBlocks[0].subagentType).toBe('explore');
    expect(result.toolUseBlocks[0].prompt).toBe('hola');
  });

  it('ensambla bloque thinking', () => {
    const assembler = new StepAssemblerService();
    feed(assembler, [
      { type: 'content_block_start', index: 1, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'razonando' } },
      { type: 'content_block_stop', index: 1 },
    ]);
    const result = assembler.result();
    expect(result.thinkingTexts).toEqual(['razonando']);
    const thinkingBlock = result.assistantMessage.content as { type: string; thinking?: string }[];
    expect(thinkingBlock[0].type).toBe('thinking');
    expect(thinkingBlock[0].thinking).toBe('razonando');
  });
});
