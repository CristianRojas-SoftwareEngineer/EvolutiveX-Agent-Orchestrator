import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderConfig } from './types.js';
import { resolveModelId } from './model-resolver.js';

const PROVIDERS_BASE_PATH = join(process.cwd(), 'routing', 'providers');

/**
 * Escanea subdirectorios de routing/providers/ que contengan config.json.
 */
export function getAvailableProviders(basePath = PROVIDERS_BASE_PATH): string[] {
  if (!existsSync(basePath)) return [];

  return readdirSync(basePath, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(basePath, d.name, 'config.json')))
    .map((d) => d.name);
}

/**
 * Carga la configuración completa de un provider: config.json + secrets.json (merge),
 * resuelve rutas relativas de modelos a modelId reales.
 */
export function loadProviderConfig(
  providerName: string,
  basePath = PROVIDERS_BASE_PATH,
): ProviderConfig {
  const providerDir = join(basePath, providerName);
  const configPath = join(providerDir, 'config.json');
  const secretsPath = join(providerDir, 'secrets.json');

  if (!existsSync(providerDir)) {
    const available = getAvailableProviders(basePath);
    throw new Error(
      `El provider "${providerName}" no existe en ${basePath}. ` +
        `Proveedores disponibles: ${available.join(', ')}`,
    );
  }

  if (!existsSync(configPath)) {
    throw new Error(
      `No se encontró config.json en: ${configPath}\n` +
        `Cree el archivo con URLs y modelos para el provider "${providerName}".`,
    );
  }

  // Leer config.json
  const configJson = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, string>;

  // Resolver rutas relativas de modelos
  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(configJson)) {
    if (
      (key.startsWith('ANTHROPIC_DEFAULT_') || key === 'CLAUDE_CODE_SUBAGENT_MODEL') &&
      typeof value === 'string' &&
      value.startsWith('models/')
    ) {
      config[key] = resolveModelId(value, providerDir);
    } else {
      config[key] = value;
    }
  }

  // Merge secrets.json si existe
  if (existsSync(secretsPath)) {
    try {
      const secrets = JSON.parse(readFileSync(secretsPath, 'utf-8')) as Record<string, string>;
      Object.assign(config, secrets);
    } catch {
      console.warn(`No se pudo leer ${secretsPath}. Se usarán placeholders para secrets.`);
    }
  } else {
    console.warn(
      `Archivo de secrets no encontrado: ${secretsPath}. Se usarán placeholders para API keys.`,
    );
  }

  // AUTH_TOKEN: si falta o sigue con placeholder, usar placeholder genérico
  if (!config.ANTHROPIC_AUTH_TOKEN || /^<.*>$/.test(config.ANTHROPIC_AUTH_TOKEN)) {
    config.ANTHROPIC_AUTH_TOKEN = `<${providerName.toUpperCase()}_API_KEY>`;
  }

  // Siempre deshabilitar API_KEY para que no compita con AUTH_TOKEN
  config.ANTHROPIC_API_KEY = '';

  return config as ProviderConfig;
}
