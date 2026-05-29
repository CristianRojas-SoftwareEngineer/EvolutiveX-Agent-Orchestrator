import type { ProviderKind } from '../../types/gateway/provider.types.js';
import type { IProvider } from '../../interfaces/gateway/IProvider.js';

export class Provider implements IProvider {
  id: string;
  kind: ProviderKind;
  baseUrl?: string;
  displayName?: string;

  constructor(data: IProvider) {
    this.id = data.id;
    this.kind = data.kind;
    this.baseUrl = data.baseUrl;
    this.displayName = data.displayName;
  }

  /** Indica si el proveedor requiere `baseUrl` explícita (kind 'custom'). */
  requiresBaseUrl(): boolean {
    return this.kind === 'custom';
  }
}
