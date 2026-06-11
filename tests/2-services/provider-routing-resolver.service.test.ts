import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProviderRoutingResolverService } from '../../src/2-services/provider-routing-resolver.service.js';

describe('ProviderRoutingResolverService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'provider-routing-'));
    mkdirSync(join(root, 'configs'), { recursive: true });
    mkdirSync(join(root, 'routing', 'providers', 'minimax'), { recursive: true });
    writeFileSync(
      join(root, 'configs', '.env'),
      'UPSTREAM_ORIGIN=https://api.minimax.io/anthropic\n',
      'utf-8',
    );
    writeFileSync(
      join(root, 'routing', 'providers', 'minimax', 'config.json'),
      JSON.stringify({
        ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
        SUBSCRIPTION_QUOTA: {
          enabled: true,
          adapter: 'minimax_token_plan_remains',
          endpoint: 'https://api.minimax.io/v1/token_plan/remains',
          auth_credential: 'ANTHROPIC_AUTH_TOKEN',
        },
      }),
      'utf-8',
    );
    writeFileSync(
      join(root, 'routing', 'providers', 'minimax', 'secrets.json'),
      JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'test-key' }),
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resuelve proveedor por UPSTREAM_ORIGIN', () => {
    const resolver = new ProviderRoutingResolverService(root);
    const result = resolver.resolve();
    expect(result?.providerName).toBe('minimax');
    expect(result?.subscriptionQuota?.enabled).toBe(true);
    expect(result?.secrets.ANTHROPIC_AUTH_TOKEN).toBe('test-key');
  });

  it('retorna null si UPSTREAM_ORIGIN no coincide', () => {
    writeFileSync(
      join(root, 'configs', '.env'),
      'UPSTREAM_ORIGIN=https://other.example.com\n',
      'utf-8',
    );
    const resolver = new ProviderRoutingResolverService(root);
    expect(resolver.resolve()).toBeNull();
  });
});
