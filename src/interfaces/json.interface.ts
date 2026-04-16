/**
 * Representa cualquier valor JSON válido de forma tipo-segura.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: JsonValue }
  | JsonValue[];

/**
 * Representa un objeto JSON (mapeo de claves a valores JSON).
 */
export interface JsonObject {
  [key: string]: JsonValue;
}
