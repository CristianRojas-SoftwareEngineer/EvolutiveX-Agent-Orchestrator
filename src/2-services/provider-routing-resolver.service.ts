import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SubscriptionQuotaProviderConfig } from '../1-domain/types/subscription-quota.types.js';

export interface ResolvedProviderRouting {
  providerName: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  subscriptionQuota?: SubscriptionQuotaProviderConfig;
}

function readDotEnv(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(envPath)) return result;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return result;
}

function parseSubscriptionQuota(raw: unknown): SubscriptionQuotaProviderConfig | undefined {
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
}

/**
 * Resuelve el proveedor activo cruzando configs/.env → UPSTREAM_ORIGIN con
 * routing/providers/{name}/config.json → ANTHROPIC_BASE_URL (misma semántica que
 * resolveActiveProvider en scripting/router-status.ts).
 */
export class ProviderRoutingResolverService {
  constructor(
    private projectRoot: string = process.cwd(),
    private providersBasePath?: string,
  ) {}

  resolve(): ResolvedProviderRouting | null {
    const envPath = join(this.projectRoot, 'configs', '.env');
    const upstreamOrigin = readDotEnv(envPath)['UPSTREAM_ORIGIN'] ?? '';
    if (!upstreamOrigin) return null;

    const basePath = this.providersBasePath ?? join(this.projectRoot, 'routing', 'providers');
    if (!existsSync(basePath)) return null;

    const providers = readdirSync(basePath, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && existsSync(join(basePath, d.name, 'config.json')),
    );

    for (const provider of providers) {
      const configPath = join(basePath, provider.name, 'config.json');
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        if (config.ANTHROPIC_BASE_URL !== upstreamOrigin) continue;

        const secretsPath = join(basePath, provider.name, 'secrets.json');
        let secrets: Record<string, string> = {};
        if (existsSync(secretsPath)) {
          try {
            secrets = JSON.parse(readFileSync(secretsPath, 'utf-8')) as Record<string, string>;
          } catch {
            // secrets ilegibles: continuar sin credenciales
          }
        }

        return {
          providerName: provider.name,
          config,
          secrets,
          subscriptionQuota: parseSubscriptionQuota(config.SUBSCRIPTION_QUOTA),
        };
      } catch {
        // config corrupta: ignorar
      }
    }

    return null;
  }
}
