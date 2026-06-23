import type { SessionMessage } from '../../1-domain/ports/IContextExtractor.js';
import type { ITtsTextProvider } from '../../1-domain/ports/ITtsTextProvider.js';

export class TtsTextProviderChain implements ITtsTextProvider {
  constructor(
    private readonly primary: ITtsTextProvider,
    private readonly fallback: ITtsTextProvider,
  ) {}

  async generateText(
    eventName: string,
    messages: SessionMessage[],
    mode: 'prompt' | 'summary',
  ): Promise<string> {
    try {
      return await this.primary.generateText(eventName, messages, mode);
    } catch {
      return await this.fallback.generateText(eventName, messages, mode);
    }
  }
}
