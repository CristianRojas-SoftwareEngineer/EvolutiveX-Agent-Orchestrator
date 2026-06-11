import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SubscriptionQuotaService } from '../../src/2-services/subscription-quota.service.js';
import {
  ProviderRoutingResolverService,
  type ResolvedProviderRouting,
} from '../../src/2-services/provider-routing-resolver.service.js';

function mockResolved(overrides?: Partial<ResolvedProviderRouting>): ResolvedProviderRouting {
  return {
    providerName: 'minimax',
    config: {},
    secrets: { ANTHROPIC_AUTH_TOKEN: 'token-123' },
    subscriptionQuota: {
      enabled: true,
      adapter: 'minimax_token_plan_remains',
      endpoint: 'https://api.minimax.io/v1/token_plan/remains',
      auth_credential: 'ANTHROPIC_AUTH_TOKEN',
      model_filter: 'general',
      refresh_interval_seconds: 60,
    },
    ...overrides,
  };
}

describe('SubscriptionQuotaService', () => {
  let tmpDir: string;
  let resolver: ProviderRoutingResolverService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sub-quota-'));
    resolver = {
      resolve: vi.fn(() => mockResolved()),
    } as unknown as ProviderRoutingResolverService;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('escribe subscription-quota.json tras fetch exitoso', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model_remains: [
          {
            model_name: 'general',
            current_interval_remaining_percent: 86,
            remains_time: 1_000_000,
            current_weekly_remaining_percent: 20,
            weekly_remains_time: 2_000_000,
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const service = new SubscriptionQuotaService(resolver, fetchFn);
    await service.refreshIfNeeded(tmpDir);

    const raw = await fs.readFile(path.join(tmpDir, 'subscription-quota.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.provider).toBe('minimax');
    expect(data.five_hour.used_percentage).toBe(14);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('omite fetch si TTL no expiró', async () => {
    const fetchedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(tmpDir, 'subscription-quota.json'),
      JSON.stringify({
        fetched_at: fetchedAt,
        provider: 'minimax',
        adapter: 'minimax_token_plan_remains',
        five_hour: { used_percentage: 10, resets_at: 1 },
      }),
      'utf8',
    );

    const fetchFn = vi.fn() as unknown as typeof fetch;
    const service = new SubscriptionQuotaService(resolver, fetchFn);
    await service.refreshIfNeeded(tmpDir);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('preserva archivo previo si fetch falla', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'subscription-quota.json'),
      JSON.stringify({
        fetched_at: new Date(Date.now() - 120_000).toISOString(),
        provider: 'minimax',
        adapter: 'minimax_token_plan_remains',
        five_hour: { used_percentage: 5, resets_at: 99 },
      }),
      'utf8',
    );

    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const service = new SubscriptionQuotaService(resolver, fetchFn);
    await service.refreshIfNeeded(tmpDir);

    const raw = await fs.readFile(path.join(tmpDir, 'subscription-quota.json'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.five_hour.used_percentage).toBe(5);
  });

  it('omite fetch si credencial ausente', async () => {
    vi.mocked(resolver.resolve).mockReturnValue(
      mockResolved({ secrets: {}, subscriptionQuota: mockResolved().subscriptionQuota }),
    );
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const service = new SubscriptionQuotaService(resolver, fetchFn);
    await service.refreshIfNeeded(tmpDir);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
