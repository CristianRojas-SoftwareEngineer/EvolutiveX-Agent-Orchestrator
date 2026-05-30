import type { IProvider } from './IProvider.js';
import type { ILanguageModel } from './ILanguageModel.js';

/** Port de solo lectura para resolver proveedores y modelos de lenguaje configurados. */
export interface IProviderCatalog {
  /** Devuelve el proveedor con el id dado, o `undefined` si no existe. */
  getProvider(id: string): IProvider | undefined;

  /**
   * Devuelve el modelo con el `modelId` dado.
   * Si no existe en el catálogo, lo crea en modo pass-through y lo cachea.
   */
  getLanguageModel(modelId: string): ILanguageModel | undefined;

  /** Lista todos los modelos actualmente en el catálogo. */
  listModels(): ILanguageModel[];
}
