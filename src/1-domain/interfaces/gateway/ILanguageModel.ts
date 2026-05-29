/** Snapshot del modelo de lenguaje disponible a través de un proveedor. */
export interface ILanguageModel {
  /** Identificador interno del gateway. */
  id: string;
  /** FK lógica al proveedor. */
  providerId: string;
  /** ID del modelo enviado a la API (campo `model` de AnthropicRequest). */
  modelId: string;
  /** Etiqueta para UI/logs. */
  displayName?: string;
  /** Si el modelo/proveedor soporta control de esfuerzo. */
  supportsEffort?: boolean;
  /** Si el modelo/proveedor soporta extended thinking. */
  supportsExtendedThinking?: boolean;
}
