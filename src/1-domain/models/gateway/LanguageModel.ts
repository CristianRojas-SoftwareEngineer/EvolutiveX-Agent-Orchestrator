import type { ILanguageModel } from '../../interfaces/gateway/ILanguageModel.js';

export class LanguageModel implements ILanguageModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName?: string;
  supportsEffort?: boolean;
  supportsExtendedThinking?: boolean;

  constructor(data: ILanguageModel) {
    this.id = data.id;
    this.providerId = data.providerId;
    this.modelId = data.modelId;
    this.displayName = data.displayName;
    this.supportsEffort = data.supportsEffort;
    this.supportsExtendedThinking = data.supportsExtendedThinking;
  }

  /** Devuelve el ID del modelo tal como se envía a la API upstream. */
  toModelId(): string {
    return this.modelId;
  }
}
