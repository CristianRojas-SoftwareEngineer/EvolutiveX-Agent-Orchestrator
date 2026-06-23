/**
 * Resolución de configuración de providers (routing/providers/<name>/).
 * Compartido entre configure-provider.ts (mutación de settings.json) y el
 * harness headless-tts (inyección de entorno en memoria, sin tocar estado global).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type ModelMetadata = { modelId: string; displayName?: string };

/** Bloque declarativo de cuota de suscripción en config.json del proveedor. */
export interface SubscriptionQuotaConfig {
  enabled: boolean;
  adapter: string;
  endpoint: string;
  auth_credential: string;
  model_filter?: string;
  refresh_interval_seconds?: number;
}

export interface ProviderConfig {
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL: string;
  ANTHROPIC_DEFAULT_FABLE_MODEL: string;
  CLAUDE_CODE_SUBAGENT_MODEL: string;
  SUBSCRIPTION_QUOTA?: SubscriptionQuotaConfig;
  [key: string]: string | SubscriptionQuotaConfig | undefined;
}

export const MANAGED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
] as const;

export const PROVIDERS_BASE_PATH = join(process.cwd(), 'routing', 'providers');

/**
 * Resuelve el modelId real desde una ruta relativa como "models/claude-sonnet-4-6".
 * Lee el metadata.json correspondiente y extrae el campo modelId.
 */
export function resolveModelId(modelPath: string, providerDir: string): string {
  if (!modelPath.startsWith('models/')) {
    throw new Error(`Ruta de modelo inválida: "${modelPath}". Debe comenzar con "models/".`);
  }

  const metadataPath = join(providerDir, modelPath, 'metadata.json');

  let raw: string;
  try {
    raw = readFileSync(metadataPath, 'utf-8');
  } catch {
    throw new Error(`No se encontró metadata.json en: ${metadataPath}`);
  }

  let metadata: ModelMetadata;
  try {
    metadata = JSON.parse(raw) as ModelMetadata;
  } catch {
    throw new Error(`Error al parsear JSON en: ${metadataPath}`);
  }

  if (!metadata.modelId) {
    throw new Error(`metadata.json no contiene campo "modelId": ${metadataPath}`);
  }

  return metadata.modelId;
}

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
  const configJson = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

  // Método de autenticación del proveedor: "api_key" (X-Api-Key), "bearer" (Authorization: Bearer) u "oauth"
  const authMethod: 'api_key' | 'bearer' | 'oauth' =
    configJson.AUTH_METHOD === 'api_key'
      ? 'api_key'
      : configJson.AUTH_METHOD === 'oauth'
        ? 'oauth'
        : 'bearer';

  const subscriptionQuota = readSubscriptionQuotaFromProviderDir(providerDir);

  // Resolver rutas relativas de modelos
  const config: Record<string, string | SubscriptionQuotaConfig | undefined> = {};
  for (const [key, value] of Object.entries(configJson)) {
    if (key === 'SUBSCRIPTION_QUOTA') continue;
    if (
      (key.startsWith('ANTHROPIC_DEFAULT_') || key === 'CLAUDE_CODE_SUBAGENT_MODEL') &&
      typeof value === 'string' &&
      value.startsWith('models/')
    ) {
      config[key] = resolveModelId(value, providerDir);
    } else if (typeof value === 'string') {
      config[key] = value;
    }
  }
  if (subscriptionQuota) {
    config.SUBSCRIPTION_QUOTA = subscriptionQuota;
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

  // Aplicar lógica de autenticación según el método del proveedor
  if (authMethod === 'api_key') {
    // Acceso directo a la API (ej. Anthropic): usar ANTHROPIC_API_KEY (header X-Api-Key)
    const apiKey = config.ANTHROPIC_API_KEY;
    if (typeof apiKey !== 'string' || !apiKey || /^<.*>$/.test(apiKey)) {
      config.ANTHROPIC_API_KEY = `<${providerName.toUpperCase()}_API_KEY>`;
    }
    config.ANTHROPIC_AUTH_TOKEN = '';
  } else if (authMethod === 'bearer') {
    // Gateway/proxy (ej. OpenRouter, Ollama, Xiaomi): usar ANTHROPIC_AUTH_TOKEN (header Authorization: Bearer)
    const authToken = config.ANTHROPIC_AUTH_TOKEN;
    if (typeof authToken !== 'string' || !authToken || /^<.*>$/.test(authToken)) {
      config.ANTHROPIC_AUTH_TOKEN = `<${providerName.toUpperCase()}_API_KEY>`;
    }
    config.ANTHROPIC_API_KEY = '';
  } else if (authMethod === 'oauth') {
    // Suscripción PRO/Max o configuración nativa a través de proxy
    config.ANTHROPIC_API_KEY = '';
    config.ANTHROPIC_AUTH_TOKEN = '';
  }

  return config as ProviderConfig;
}

/** Lee y valida SUBSCRIPTION_QUOTA desde config.json del proveedor (sin merge de secrets). */
export function readSubscriptionQuotaFromProviderDir(
  providerDir: string,
): SubscriptionQuotaConfig | undefined {
  const configPath = join(providerDir, 'config.json');
  if (!existsSync(configPath)) return undefined;
  try {
    const configJson = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const raw = configJson.SUBSCRIPTION_QUOTA;
    if (!raw || typeof raw !== 'object') return undefined;
    const obj = raw as Record<string, unknown>;
    if (obj.enabled !== true) return undefined;
    if (typeof obj.adapter !== 'string' || typeof obj.endpoint !== 'string') return undefined;
    if (typeof obj.auth_credential !== 'string') return undefined;
    return {
      enabled: true,
      adapter: obj.adapter,
      endpoint: obj.endpoint,
      auth_credential: obj.auth_credential,
      model_filter: typeof obj.model_filter === 'string' ? obj.model_filter : undefined,
      refresh_interval_seconds:
        typeof obj.refresh_interval_seconds === 'number' ? obj.refresh_interval_seconds : undefined,
    };
  } catch {
    return undefined;
  }
}
