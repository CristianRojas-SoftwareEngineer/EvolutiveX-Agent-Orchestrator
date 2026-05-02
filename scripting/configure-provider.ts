import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Tipos y constantes ──────────────────────────────────────────

type ModelMetadata = { modelId: string };

interface ProviderConfig {
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL: string;
  CLAUDE_CODE_SUBAGENT_MODEL: string;
  UPSTREAM_ORIGIN: string;
  [key: string]: string;
}

const MANAGED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'UPSTREAM_ORIGIN',
] as const;

interface IEnvManager {
  setEnvVar(name: string, value: string): Promise<void>;
  removeEnvVar(name: string): Promise<void>;
  getEnvVar(name: string): string | undefined;
  getAllManagedVars(): Record<string, string | undefined>;
}

const PROVIDERS_BASE_PATH = join(process.cwd(), 'routing', 'providers');

// ── Resolución de modelos ───────────────────────────────────────

/**
 * Resuelve el modelId real desde una ruta relativa como "models/claude-sonnet-4-6".
 * Lee el metadata.json correspondiente y extrae el campo modelId.
 */
function resolveModelId(modelPath: string, providerDir: string): string {
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

// ── Carga de configuración ──────────────────────────────────────

/**
 * Escanea subdirectorios de routing/providers/ que contengan config.json.
 */
function getAvailableProviders(basePath = PROVIDERS_BASE_PATH): string[] {
  if (!existsSync(basePath)) return [];

  return readdirSync(basePath, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(basePath, d.name, 'config.json')))
    .map((d) => d.name);
}

/**
 * Carga la configuración completa de un provider: config.json + secrets.json (merge),
 * resuelve rutas relativas de modelos a modelId reales.
 */
function loadProviderConfig(
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

  // Método de autenticación del proveedor: "api_key" (X-Api-Key) o "bearer" (Authorization: Bearer)
  const authMethod: 'api_key' | 'bearer' = configJson.AUTH_METHOD === 'api_key' ? 'api_key' : 'bearer';

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

  // Aplicar lógica de autenticación según el método del proveedor y ruteo via Proxy
  const localProxyUrl = 'http://localhost:8787';

  if (authMethod === 'api_key') {
    // Acceso directo a la API (ej. Anthropic): usar ANTHROPIC_API_KEY (header X-Api-Key)
    config.UPSTREAM_ORIGIN = config.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    config.ANTHROPIC_BASE_URL = localProxyUrl;

    if (!config.ANTHROPIC_API_KEY || /^<.*>$/.test(config.ANTHROPIC_API_KEY)) {
      config.ANTHROPIC_API_KEY = `<${providerName.toUpperCase()}_API_KEY>`;
    }
    config.ANTHROPIC_AUTH_TOKEN = '';
  } else {
    // Gateway/proxy (ej. OpenRouter, Ollama, Xiaomi): usar ANTHROPIC_AUTH_TOKEN (header Authorization: Bearer)
    config.UPSTREAM_ORIGIN = config.ANTHROPIC_BASE_URL;
    config.ANTHROPIC_BASE_URL = localProxyUrl;

    if (!config.ANTHROPIC_AUTH_TOKEN || /^<.*>$/.test(config.ANTHROPIC_AUTH_TOKEN)) {
      config.ANTHROPIC_AUTH_TOKEN = `<${providerName.toUpperCase()}_API_KEY>`;
    }
    // Claude Code solo reconoce ANTHROPIC_API_KEY; el proxy traducirá esto a Bearer
    config.ANTHROPIC_API_KEY = config.ANTHROPIC_AUTH_TOKEN;
  }

  return config as ProviderConfig;
}

// ── Gestión de variables de entorno ─────────────────────────────

class WindowsEnvManager implements IEnvManager {
  async setEnvVar(name: string, value: string): Promise<void> {
    const psValue = value.replace(/'/g, "''");
    execSync(`[Environment]::SetEnvironmentVariable('${name}', '${psValue}', 'User')`, {
      shell: 'powershell.exe',
      stdio: 'pipe',
    });
    process.env[name] = value;
  }

  async removeEnvVar(name: string): Promise<void> {
    // Comprobar la existencia de la variable de entorno antes de eliminarla
    const exists = this.getEnvVar(name) !== undefined;
    if (!exists) {
      delete process.env[name];
      return;
    }

    execSync(`Remove-ItemProperty -Path 'HKCU:\\Environment' -Name '${name}' -ErrorAction Stop`, {
      shell: 'powershell.exe',
      stdio: 'pipe',
    });

    delete process.env[name];
  }

  getEnvVar(name: string): string | undefined {
    try {
      const result = execSync(`[Environment]::GetEnvironmentVariable('${name}', 'User')`, {
        shell: 'powershell.exe',
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
      return result || undefined;
    } catch {
      return undefined;
    }
  }

  getAllManagedVars(): Record<string, string | undefined> {
    const result: Record<string, string | undefined> = {};
    for (const name of MANAGED_ENV_VARS) {
      result[name] = this.getEnvVar(name);
    }
    return result;
  }
}

function getRcPath(): string {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return join(homedir(), '.zshrc');
  if (shell.includes('bash')) return join(homedir(), '.bashrc');
  return join(homedir(), '.profile');
}

function updateRcFile(rcPath: string, name: string, value: string): void {
  let content = existsSync(rcPath) ? readFileSync(rcPath, 'utf-8') : '';
  const exportRegex = new RegExp(`^export\\s+${name}=.*$`, 'm');
  const exportLine = `export ${name}="${value}"`;

  if (exportRegex.test(content)) {
    content = content.replace(exportRegex, exportLine);
  } else {
    content = content.trimEnd() + '\n' + exportLine + '\n';
  }

  writeFileSync(rcPath, content, 'utf-8');
}

function removeRcEntry(rcPath: string, name: string): void {
  if (!existsSync(rcPath)) return;

  const content = readFileSync(rcPath, 'utf-8');
  const exportRegex = new RegExp(`^export\\s+${name}=.*$\\n?`, 'm');
  const updated = content.replace(exportRegex, '');
  writeFileSync(rcPath, updated, 'utf-8');
}

class UnixEnvManager implements IEnvManager {
  async setEnvVar(name: string, value: string): Promise<void> {
    const rcPath = getRcPath();
    updateRcFile(rcPath, name, value);
    process.env[name] = value;
  }

  async removeEnvVar(name: string): Promise<void> {
    const rcPath = getRcPath();
    removeRcEntry(rcPath, name);
    delete process.env[name];
  }

  getEnvVar(name: string): string | undefined {
    return process.env[name] || undefined;
  }

  getAllManagedVars(): Record<string, string | undefined> {
    const result: Record<string, string | undefined> = {};
    for (const name of MANAGED_ENV_VARS) {
      result[name] = this.getEnvVar(name);
    }
    return result;
  }
}

function createEnvManager(): IEnvManager {
  if (process.platform === 'win32') return new WindowsEnvManager();
  return new UnixEnvManager();
}

// ── Funciones del CLI ───────────────────────────────────────────

function showCurrentState(env = createEnvManager()): void {
  const vars = env.getAllManagedVars();

  console.log(chalk.cyan('\n=== Estado actual de variables Claude Code ==='));
  for (const name of MANAGED_ENV_VARS) {
    const value = vars[name];
    if (value) {
      console.log(`  ${name.padEnd(42)} = ${value}`);
    } else {
      console.log(chalk.gray(`  ${name.padEnd(42)} (no configurada)`));
    }
  }

  // Método de autenticación activo
  console.log(chalk.cyan('\n--- Método de autenticación activo ---'));
  const authToken = vars.ANTHROPIC_AUTH_TOKEN;
  const apiKey = vars.ANTHROPIC_API_KEY;
  const baseUrl = vars.ANTHROPIC_BASE_URL;

  if (authToken) {
    console.log(chalk.green(`  AUTH_TOKEN activo (Bearer token via ${baseUrl || 'default'})`));
  } else if (apiKey) {
    console.log(chalk.green('  API_KEY activo (X-Api-Key header)'));
  } else {
    console.log(
      chalk.green('  OAuth de suscripción (PRO/Max) - ninguna variable de API configurada'),
    );
  }

  // Providers disponibles
  console.log(chalk.cyan('\n--- Archivos de configuración ---'));
  console.log(`  Base de providers: ${PROVIDERS_BASE_PATH}`);
  const available = getAvailableProviders(PROVIDERS_BASE_PATH);

  if (available.length > 0) {
    console.log(`  Providers disponibles: ${available.join(', ')}`);
    for (const p of available) {
      const pDir = join(PROVIDERS_BASE_PATH, p);
      const hasConfig = existsSync(join(pDir, 'config.json'));
      const hasSecrets = existsSync(join(pDir, 'secrets.json'));
      console.log(chalk.cyan(`    ${p}/`));
      console.log(
        `      config.json:   ${hasConfig ? chalk.green('existe') : chalk.yellow('no encontrado')}`,
      );
      console.log(
        `      secrets.json:  ${hasSecrets ? chalk.green('existe') : chalk.yellow('no encontrado (se usarán placeholders)')}`,
      );
    }
  } else {
    console.log(chalk.yellow('  (no se encontraron providers en subdirectorios)'));
  }
  console.log('');
}

async function removeManagedVars(env = createEnvManager()): Promise<void> {
  for (const name of MANAGED_ENV_VARS) {
    await env.removeEnvVar(name);
    console.log(chalk.green(`  [REMOVE] ${name}`));
  }
}

async function applyConfig(config: ProviderConfig, env = createEnvManager()): Promise<void> {
  for (const name of MANAGED_ENV_VARS) {
    const value = config[name];
    if (value === undefined) continue;
    await env.setEnvVar(name, value);
    console.log(chalk.green(`  [SET] ${name} = ${value}`));
  }
}

async function verifyApplied(
  provider: string,
  config: ProviderConfig | null,
  env = createEnvManager(),
): Promise<void> {
  console.log(chalk.cyan('\n--- Verificación post-configuración ---'));
  const vars = env.getAllManagedVars();

  if (provider === 'default') {
    const remaining = MANAGED_ENV_VARS.filter((n) => vars[n]);
    if (remaining.length === 0) {
      console.log(
        chalk.green('  OK: variables eliminadas. Claude Code usará suscripción OAuth (PRO/Max).'),
      );
    } else {
      console.log(
        chalk.yellow(
          '  AVISO: las siguientes variables persisten y podrían interferir con la suscripción:',
        ),
      );
      for (const name of remaining) {
        console.log(chalk.yellow(`    - ${name} = ${vars[name]}`));
      }
    }
  } else if (config) {
    const errors = MANAGED_ENV_VARS.filter((n) => config[n] !== undefined && vars[n] !== config[n]);
    if (errors.length === 0) {
      console.log(chalk.green(`  OK: provider '${provider}' configurado correctamente.`));
    } else {
      console.log(
        chalk.yellow(`  AVISO: las siguientes variables no se aplicaron: ${errors.join(', ')}`),
      );
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('configure-provider')
  .description(
    'Configura el proveedor de Claude Code para usar Anthropic, Ollama, OpenRouter o Xiaomi.',
  )
  .argument('[provider]', 'Proveedor a configurar', 'default')
  .option('--show-current', 'Muestra las variables de entorno actuales y sale')
  .option('--dry-run', 'Simula la ejecución sin modificar el entorno')
  .action(async (provider: string, opts: { showCurrent?: boolean; dryRun?: boolean }) => {
    const env = createEnvManager();

    if (opts.showCurrent) {
      showCurrentState(env);
      return;
    }

    const validProviders = ['default', 'ollama', 'openrouter', 'xiaomi'];
    if (!validProviders.includes(provider)) {
      console.error(
        chalk.red(`Proveedor inválido: "${provider}". Opciones: ${validProviders.join(', ')}`),
      );
      process.exit(1);
    }

    console.log(chalk.cyan('\n=== Configurar Provider para Claude Code ==='));
    console.log(`Provider seleccionado: ${provider}`);

    if (provider === 'default') {
      console.log(
        chalk.cyan('\nRestaurando configuración nativa de Anthropic (suscripción PRO/Max)...'),
      );
      if (!opts.dryRun) {
        await removeManagedVars(env);
      } else {
        for (const name of MANAGED_ENV_VARS) {
          console.log(chalk.yellow(`  [REMOVE] ${name}`));
        }
      }
    } else {
      let config: ProviderConfig;
      try {
        config = loadProviderConfig(provider, PROVIDERS_BASE_PATH);
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      console.log(chalk.cyan('\nLimpiando variables anteriores...'));
      if (!opts.dryRun) {
        await removeManagedVars(env);
      } else {
        for (const name of MANAGED_ENV_VARS) {
          console.log(chalk.yellow(`  [REMOVE] ${name}`));
        }
      }

      console.log(chalk.cyan(`\nAplicando configuración de ${provider}...`));
      if (!opts.dryRun) {
        await applyConfig(config, env);
      } else {
        for (const name of MANAGED_ENV_VARS) {
          const value = config[name];
          if (value !== undefined) {
            console.log(chalk.yellow(`  [SET] ${name} = ${value}`));
          }
        }
      }

      if (!opts.dryRun) {
        await verifyApplied(provider, config, env);
      }
    }

    console.log(
      chalk.cyan('\nConfiguración completada. Reinicie Claude Code para aplicar los cambios.'),
    );
  });

program.parse();
