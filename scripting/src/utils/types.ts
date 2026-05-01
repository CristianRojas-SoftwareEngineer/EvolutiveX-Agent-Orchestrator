export interface ModelCosts {
  input?: {
    base?: number;
    cacheWrite5m?: number;
    cacheWrite1h?: number;
    cacheRead?: number;
  };
  output?: number;
}

export interface ModelMetadata {
  modelId: string;
  costs?: ModelCosts;
}

export interface ProviderConfig {
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL: string;
  CLAUDE_CODE_SUBAGENT_MODEL: string;
  [key: string]: string;
}

export const MANAGED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
] as const;

export type ManagedEnvVarName = (typeof MANAGED_ENV_VARS)[number];

export interface IEnvManager {
  setEnvVar(name: string, value: string): Promise<void>;
  removeEnvVar(name: string): Promise<void>;
  getEnvVar(name: string): string | undefined;
  getAllManagedVars(): Record<string, string | undefined>;
}
