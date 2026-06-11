import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { SubscriptionQuotaFile } from '../1-domain/types/subscription-quota.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import {
  ProviderRoutingResolverService,
  type ResolvedProviderRouting,
} from './provider-routing-resolver.service.js';
import {
  mapMinimaxTokenPlanRemains,
  type MinimaxTokenPlanRemainsResponse,
} from './subscription-quota/minimax-token-plan-remains.adapter.js';
import type { JsonValue } from '../1-domain/types/json.types.js';
import { writeJsonAtomic } from './utils/file-write.utils.js';

const SUBSCRIPTION_QUOTA_FILE = 'subscription-quota.json';
const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class SubscriptionQuotaService {
  constructor(
    private resolver: ProviderRoutingResolverService,
    private fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
    private logger?: Logger,
  ) {}

  async refreshIfNeeded(sessionDir: string): Promise<void> {
    try {
      const resolved = this.resolver.resolve();
      if (!resolved?.subscriptionQuota?.enabled) return;

      const quotaConfig = resolved.subscriptionQuota;
      const refreshIntervalSeconds =
        quotaConfig.refresh_interval_seconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;

      const filePath = path.join(sessionDir, SUBSCRIPTION_QUOTA_FILE);
      if (await this.isWithinTtl(filePath, refreshIntervalSeconds)) return;

      const credential = resolved.secrets[quotaConfig.auth_credential]?.trim();
      if (!credential) {
        this.logger?.warn(
          { provider: resolved.providerName, credential: quotaConfig.auth_credential },
          '[subscription-quota] Credencial ausente; se omite fetch',
        );
        return;
      }

      const windows = await this.fetchAndMap(resolved, credential);
      if (!windows.five_hour && !windows.seven_day) return;

      const payload: SubscriptionQuotaFile = {
        fetched_at: new Date().toISOString(),
        provider: resolved.providerName,
        adapter: quotaConfig.adapter,
        ...windows,
      };

      await writeJsonAtomic(filePath, payload as unknown as JsonValue);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn({ err: msg }, '[subscription-quota] Error al refrescar cuota');
    }
  }

  private async isWithinTtl(filePath: string, refreshIntervalSeconds: number): Promise<boolean> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const existing = JSON.parse(raw) as SubscriptionQuotaFile;
      if (!existing.fetched_at) return false;
      const fetchedAt = Date.parse(existing.fetched_at);
      if (!Number.isFinite(fetchedAt)) return false;
      return Date.now() - fetchedAt < refreshIntervalSeconds * 1000;
    } catch {
      return false;
    }
  }

  private async fetchAndMap(
    resolved: ResolvedProviderRouting,
    credential: string,
  ): Promise<Pick<SubscriptionQuotaFile, 'five_hour' | 'seven_day'>> {
    const quotaConfig = resolved.subscriptionQuota!;
    const response = await this.fetchFn(quotaConfig.endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${credential}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al consultar cuota de suscripción`);
    }

    const body = (await response.json()) as MinimaxTokenPlanRemainsResponse;

    if (quotaConfig.adapter === 'minimax_token_plan_remains') {
      return mapMinimaxTokenPlanRemains(body, quotaConfig.model_filter ?? 'general');
    }

    throw new Error(`Adapter de cuota desconocido: ${quotaConfig.adapter}`);
  }
}
