import { randomUUID } from 'node:crypto';

export function buildSimulatedSseFromText(args: {
  text: string;
  model: string;
  messageId?: string;
}): string {
  const messageId = args.messageId ?? `msg_simctx_${randomUUID().replace(/-/g, '')}`;
  const safeText = String(args.text ?? '');
  const model = args.model || 'unknown';

  const events: Array<{ event: string; data: Record<string, unknown> }> = [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    },
    {
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    },
    {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: safeText },
      },
    },
    {
      event: 'content_block_stop',
      data: {
        type: 'content_block_stop',
        index: 0,
      },
    },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 },
      },
    },
    {
      event: 'message_stop',
      data: {
        type: 'message_stop',
      },
    },
  ];

  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}
