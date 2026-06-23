/**
 * Construcción del entorno aislado por provider para el harness headless TTS.
 * Resuelve la configuración en memoria (sin mutar ~/.claude/settings.json ni
 * configs/.env) y la reparte entre el subproceso del proxy de test y claude -p.
 * Las variables de entorno de un subproceso tienen prioridad sobre settings.json
 * (en Claude Code) y sobre --env-file (en Node), lo que garantiza el aislamiento.
 */
import {
  MANAGED_ENV_VARS,
  loadProviderConfig,
  PROVIDERS_BASE_PATH,
} from '../../shared/provider-config.js';

export const DEFAULT_UPSTREAM = 'https://api.anthropic.com';

export interface IsolatedProviderEnv {
  /** Upstream real del provider (destino del proxy de test). */
  upstreamOrigin: string;
  /** Env para claude -p: BASE_URL al proxy de test + credenciales/modelos del provider. */
  claudeEnv: Record<string, string>;
  /** Env para el proxy de test: upstream + variables que lee generateSpeechText. */
  proxyEnv: Record<string, string>;
}

/**
 * Resuelve el entorno aislado de un provider. Para 'default' (OAuth PRO/Max)
 * se limpian todas las variables gestionadas: claude usará sus credenciales OAuth
 * y el proxy capturará el Bearer token del tráfico.
 * Los valores '' sobreescriben (anulan) variables heredadas del proceso padre.
 */
export function buildIsolatedProviderEnv(
  provider: string,
  port: number,
  basePath = PROVIDERS_BASE_PATH,
): IsolatedProviderEnv {
  const proxyUrl = `http://127.0.0.1:${port}`;

  // Limpiar todas las variables gestionadas heredadas del padre (p. ej. la sesión
  // principal de Claude Code exporta ANTHROPIC_BASE_URL del proxy principal).
  const claudeEnv: Record<string, string> = {};
  for (const key of MANAGED_ENV_VARS) {
    claudeEnv[key] = '';
  }
  claudeEnv.ANTHROPIC_BASE_URL = proxyUrl;

  if (provider === 'default') {
    return {
      upstreamOrigin: DEFAULT_UPSTREAM,
      claudeEnv,
      proxyEnv: {
        UPSTREAM_ORIGIN: DEFAULT_UPSTREAM,
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
      },
    };
  }

  const config = loadProviderConfig(provider, basePath);
  const upstreamOrigin = config.ANTHROPIC_BASE_URL;

  for (const key of MANAGED_ENV_VARS) {
    if (config[key] !== undefined) claudeEnv[key] = config[key];
  }
  // El destino de claude siempre es el proxy de test, no el upstream directo
  claudeEnv.ANTHROPIC_BASE_URL = proxyUrl;

  return {
    upstreamOrigin,
    claudeEnv,
    proxyEnv: {
      UPSTREAM_ORIGIN: upstreamOrigin,
      ANTHROPIC_AUTH_TOKEN: config.ANTHROPIC_AUTH_TOKEN ?? '',
      ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY ?? '',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: config.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? '',
    },
  };
}
