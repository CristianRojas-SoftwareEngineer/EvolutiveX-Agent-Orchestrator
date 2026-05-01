import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelMetadata } from './types.js';

/**
 * Resuelve el modelId real desde una ruta relativa como "models/claude-sonnet-4-6".
 * Lee el metadata.json correspondiente y extrae el campo modelId.
 */
export function resolveModelId(modelPath: string, providerDir: string): string {
  if (!modelPath.startsWith('models/')) {
    throw new Error(
      `Ruta de modelo inválida: "${modelPath}". Debe comenzar con "models/".`,
    );
  }

  const metadataPath = join(providerDir, modelPath, 'metadata.json');

  let raw: string;
  try {
    raw = readFileSync(metadataPath, 'utf-8');
  } catch {
    throw new Error(
      `No se encontró metadata.json en: ${metadataPath}`,
    );
  }

  let metadata: ModelMetadata;
  try {
    metadata = JSON.parse(raw) as ModelMetadata;
  } catch {
    throw new Error(
      `Error al parsear JSON en: ${metadataPath}`,
    );
  }

  if (!metadata.modelId) {
    throw new Error(
      `metadata.json no contiene campo "modelId": ${metadataPath}`,
    );
  }

  return metadata.modelId;
}
