import type { IProviderCatalog } from '../1-domain/interfaces/gateway/IProviderCatalog.js';
import type { IProvider } from '../1-domain/interfaces/gateway/IProvider.js';
import type { ILanguageModel } from '../1-domain/interfaces/gateway/ILanguageModel.js';
import { Provider } from '../1-domain/models/gateway/Provider.js';
import { LanguageModel } from '../1-domain/models/gateway/LanguageModel.js';

export class ProviderCatalogService implements IProviderCatalog {
  private readonly provider: Provider;
  private readonly modelCache = new Map<string, LanguageModel>();

  constructor(upstreamOrigin: string) {
    const isAnthropic = upstreamOrigin.includes('api.anthropic.com');
    this.provider = new Provider(
      isAnthropic
        ? { id: 'anthropic', kind: 'anthropic' }
        : { id: 'custom', kind: 'custom', baseUrl: upstreamOrigin },
    );
  }

  getProvider(id: string): IProvider | undefined {
    return this.provider.id === id ? this.provider : undefined;
  }

  getLanguageModel(modelId: string): ILanguageModel {
    let model = this.modelCache.get(modelId);
    if (!model) {
      model = new LanguageModel({ id: modelId, providerId: this.provider.id, modelId });
      this.modelCache.set(modelId, model);
    }
    return model;
  }

  listModels(): ILanguageModel[] {
    return [...this.modelCache.values()];
  }
}
