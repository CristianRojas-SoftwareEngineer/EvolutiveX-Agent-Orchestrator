import type { ProviderKind } from '../../types/gateway/provider.types.js';

/** Snapshot del proveedor de inferencia del LLM. */
export interface IProvider {
  /** Identificador interno del gateway. */
  id: string;
  /** Tipo de proveedor. */
  kind: ProviderKind;
  /** URL base cuando no es first-party Anthropic. */
  baseUrl?: string;
  /** Etiqueta para UI/logs. */
  displayName?: string;
}
