import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildIsolatedProviderEnv,
  DEFAULT_UPSTREAM,
} from '../../scripting/headless/session-lib/provider-env.js';
import { MANAGED_ENV_VARS } from '../../scripting/shared/provider-config.js';

const TEST_PORT = 8788;
const PROXY_URL = `http://127.0.0.1:${TEST_PORT}`;

let basePath: string;

beforeAll(() => {
  basePath = mkdtempSync(join(tmpdir(), 'provider-env-test-'));

  // Provider anthropic con Fable en catálogo
  const anthropicDir = join(basePath, 'anthropic');
  mkdirSync(join(anthropicDir, 'models', 'claude-fable-5'), { recursive: true });
  writeFileSync(
    join(anthropicDir, 'config.json'),
    JSON.stringify({
      AUTH_METHOD: 'oauth',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'models/claude-fable-5',
    }),
  );
  writeFileSync(
    join(anthropicDir, 'models', 'claude-fable-5', 'metadata.json'),
    JSON.stringify({ modelId: 'claude-fable-5', displayName: 'Fable 5' }),
  );

  // Provider bearer con modelo relativo y secrets
  const bearerDir = join(basePath, 'bearer-prov');
  mkdirSync(join(bearerDir, 'models', 'mini'), { recursive: true });
  writeFileSync(
    join(bearerDir, 'config.json'),
    JSON.stringify({
      AUTH_METHOD: 'bearer',
      ANTHROPIC_BASE_URL: 'https://upstream.example/api',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'models/mini',
    }),
  );
  writeFileSync(
    join(bearerDir, 'models', 'mini', 'metadata.json'),
    JSON.stringify({ modelId: 'vendor/mini:free' }),
  );
  writeFileSync(
    join(bearerDir, 'secrets.json'),
    JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'sk-test-123' }),
  );
});

afterAll(() => {
  rmSync(basePath, { recursive: true, force: true });
});

describe('buildIsolatedProviderEnv', () => {
  it('default: limpia variables gestionadas y apunta claude al proxy de test', () => {
    const env = buildIsolatedProviderEnv('default', TEST_PORT, basePath);
    expect(env.upstreamOrigin).toBe(DEFAULT_UPSTREAM);
    expect(env.claudeEnv.ANTHROPIC_BASE_URL).toBe(PROXY_URL);
    // Todas las demás gestionadas se anulan ('' sobreescribe herencia del padre)
    for (const key of MANAGED_ENV_VARS) {
      if (key === 'ANTHROPIC_BASE_URL') continue;
      expect(env.claudeEnv[key]).toBe('');
    }
    expect(env.proxyEnv.UPSTREAM_ORIGIN).toBe(DEFAULT_UPSTREAM);
    expect(env.proxyEnv.ANTHROPIC_AUTH_TOKEN).toBe('');
  });

  it('anthropic: propaga ANTHROPIC_DEFAULT_FABLE_MODEL vía MANAGED_ENV_VARS en claudeEnv', () => {
    const env = buildIsolatedProviderEnv('anthropic', TEST_PORT, basePath);
    expect(env.claudeEnv.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5');
  });

  it('bearer: resuelve modelId, token de secrets y upstream del provider', () => {
    const env = buildIsolatedProviderEnv('bearer-prov', TEST_PORT, basePath);
    expect(env.upstreamOrigin).toBe('https://upstream.example/api');
    // claude habla con el proxy de test, nunca con el upstream directo
    expect(env.claudeEnv.ANTHROPIC_BASE_URL).toBe(PROXY_URL);
    expect(env.claudeEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('vendor/mini:free');
    expect(env.claudeEnv.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-123');
    expect(env.proxyEnv.UPSTREAM_ORIGIN).toBe('https://upstream.example/api');
    expect(env.proxyEnv.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-123');
    expect(env.proxyEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('vendor/mini:free');
  });

  it('provider inexistente lanza error', () => {
    expect(() => buildIsolatedProviderEnv('no-existe', TEST_PORT, basePath)).toThrow(/no existe/);
  });
});
