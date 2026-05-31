import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    // E2E: createProxyDependencies + dynamic import pueden superar 10s en Windows/CI.
    hookTimeout: 30_000,
  },
});
