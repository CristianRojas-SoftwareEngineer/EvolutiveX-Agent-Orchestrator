/**
 * Tipos reservados para la futura integración de cálculo de costos.
 *
 * Este archivo establece la correspondencia tipada con el esquema JSON
 * documentado en \`how-to-calculate-anthropic-api-costs.md\` (configs/anthropic-model-pricing.json),
 * diseñado para ser consumido externamente o usado en integraciones futuras.
 *
 * @see configs/anthropic-model-pricing.json
 */

/**
 * Modificadores globales que afectan el cálculo de precio de todos los modelos
 * (por ejemplo, cargos extras por localización geográfica).
 */
export interface PricingDefaultModifiers {
  /**
   * Multiplicador asociado a inferencia que requiere residencia de datos en EE. UU.
   * Por defecto en las estimaciones de Anthropic suele ser 1.1x.
   */
  inferenceGeoUs?: number;
  [key: string]: number | undefined;
}

/**
 * Mapeo de precios por millón de tokens (MTok) para un modelo.
 */
export interface ModelCosts {
  input: {
    /** USD por MTok para tokens de entrada base (input_tokens). */
    base: number;
    /** USD por MTok para operaciones de guardado de cache (5m TTL). */
    cacheWrite5m: number;
    /** USD por MTok para operaciones de guardado de cache (1h TTL). */
    cacheWrite1h: number;
    /** USD por MTok para lectura de cache (hits/refreshes). */
    cacheRead: number;
  };
  /** USD por MTok para salida generada (output_tokens). */
  output: number;
}

/**
 * Definición individual de un modelo con sus costos y alias permitidos.
 */
export interface PricingModelDefinition {
  /** Identificador exacto oficial del modelo según sale en peticiones/respuestas (e.g. claude-haiku-4-5-20251001). */
  modelId: string;
  /** Strings alternativos/nombres amistosos que resuelven a este modelo. */
  aliases?: string[];
  /** Las asignaciones de tarifas para la facturación. */
  costs: ModelCosts;
}

/**
 * Raíz de la jerarquía del esquema de archivo de configuración de modelos y precios.
 */
export interface ModelPricingConfig {
  /** Versión estricta del esquema para trackear cambios estructurales (actual: 1). */
  schemaVersion: number;
  /** ISO Date informando la última actualización de snapshot del precio publicado. */
  updatedAt: string;
  /** Referencia a la documentación oficial para validación humana de tarifas. */
  pricingSourceUrl: string;
  /** Moneda usada en los valores numéricos (e.g. "USD"). */
  currency: string;
  /** Unidad base en la métrica original del proveedor (e.g. "per_million_tokens"). */
  unit: string;
  /** Reglas de cargos extra que podrían aplicar según uso. */
  defaultModifiers?: PricingDefaultModifiers;
  /** Catálogo de los modelos soportados. */
  models: PricingModelDefinition[];
}
