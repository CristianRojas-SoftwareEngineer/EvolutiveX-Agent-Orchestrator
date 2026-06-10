import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readClaudeSettings, writeClaudeSettings } from './shared/claude-settings.js';
import {
  MANAGED_ENV_VARS,
  PROVIDERS_BASE_PATH,
  getAvailableProviders,
  loadProviderConfig,
  type ProviderConfig,
} from './shared/provider-config.js';

// ── Tipos y constantes ──────────────────────────────────────────

interface IEnvManager {
  setEnvVar(name: string, value: string): Promise<void>;
  removeEnvVar(name: string): Promise<void>;
  getEnvVar(name: string): string | undefined;
  getAllManagedVars(): Record<string, string | undefined>;
}

// ── Utilidades para .env del Proxy ──────────────────────────────

const ENV_PATH = join(process.cwd(), 'configs', '.env');

function getProxyPort(): number {
  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, 'utf-8');
    const match = /^PORT\s*=\s*(.*)$/m.exec(content);
    if (match && match[1]) {
      const port = parseInt(match[1].trim(), 10);
      if (!isNaN(port)) return port;
    }
  }
  return 8787; // default
}

function updateDotEnv(key: string, value: string): void {
  let content = '';
  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, 'utf-8');
  }

  const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
  const newLine = `${key}=${value}`;

  if (regex.test(content)) {
    content = content.replace(regex, newLine);
  } else {
    // Si no termina en salto de línea y no está vacío, agregamos uno
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
    content += newLine + '\n';
  }

  writeFileSync(ENV_PATH, content, 'utf-8');
}

// ── Gestión de variables de entorno ─────────────────────────────

class ClaudeSettingsEnvManager implements IEnvManager {
  async setEnvVar(name: string, value: string): Promise<void> {
    const settings = readClaudeSettings();
    if (!settings.env) settings.env = {};
    settings.env[name] = value;
    writeClaudeSettings(settings);
  }

  async removeEnvVar(name: string): Promise<void> {
    const settings = readClaudeSettings();
    if (settings.env) {
      delete settings.env[name];
      if (Object.keys(settings.env).length === 0) {
        delete settings.env;
      }
    }
    writeClaudeSettings(settings);
  }

  getEnvVar(name: string): string | undefined {
    const settings = readClaudeSettings();
    return settings.env?.[name];
  }

  getAllManagedVars(): Record<string, string | undefined> {
    const settings = readClaudeSettings();
    const result: Record<string, string | undefined> = {};
    for (const name of MANAGED_ENV_VARS) {
      result[name] = settings.env?.[name];
    }
    return result;
  }
}

function createEnvManager(): IEnvManager {
  return new ClaudeSettingsEnvManager();
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
    const remaining = MANAGED_ENV_VARS.filter((n) => n !== 'ANTHROPIC_BASE_URL' && vars[n]);
    if (remaining.length === 0) {
      console.log(
        chalk.green(
          '  OK: variables de autenticación eliminadas. Claude Code usará suscripción OAuth (PRO/Max) auditada por el Proxy.',
        ),
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
    'Configura el proveedor de Claude Code para usar Anthropic, MiniMax, Ollama, OpenCode, OpenRouter o Xiaomi.',
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

    const validProviders = [
      'default',
      'anthropic',
      'minimax',
      'ollama',
      'openrouter',
      'xiaomi',
      'opencode',
    ];
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
        chalk.cyan(
          '\nRestaurando configuración nativa de Anthropic (suscripción PRO/Max) vía Proxy...',
        ),
      );

      const proxyPort = getProxyPort();
      const proxyUrl = `http://127.0.0.1:${proxyPort}`;
      const defaultUpstream = 'https://api.anthropic.com';

      if (!opts.dryRun) {
        await removeManagedVars(env);
        // Establecer ANTHROPIC_BASE_URL para enrutar el tráfico OAuth al proxy
        await env.setEnvVar('ANTHROPIC_BASE_URL', proxyUrl);
        updateDotEnv('UPSTREAM_ORIGIN', defaultUpstream);
        console.log(chalk.green(`  [SET] ANTHROPIC_BASE_URL = ${proxyUrl}`));
        console.log(
          chalk.green(`  [PROXY] UPSTREAM_ORIGIN configurado a ${defaultUpstream} en configs/.env`),
        );
      } else {
        for (const name of MANAGED_ENV_VARS) {
          console.log(chalk.yellow(`  [REMOVE] ${name}`));
        }
        console.log(chalk.yellow(`  [SET] ANTHROPIC_BASE_URL = ${proxyUrl}`));
        console.log(
          chalk.yellow(
            `  [PROXY] UPSTREAM_ORIGIN configurado a ${defaultUpstream} en configs/.env`,
          ),
        );
      }

      if (!opts.dryRun) {
        await verifyApplied(provider, null, env);
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

      const proxyPort = getProxyPort();
      const proxyUrl = `http://127.0.0.1:${proxyPort}`;
      const originalBaseUrl = config.ANTHROPIC_BASE_URL;

      // Sobrescribir el destino para enrutar a través del Proxy local
      config.ANTHROPIC_BASE_URL = proxyUrl;

      if (!opts.dryRun) {
        await applyConfig(config, env);
        updateDotEnv('UPSTREAM_ORIGIN', originalBaseUrl);
        console.log(
          chalk.green(`  [PROXY] UPSTREAM_ORIGIN configurado a ${originalBaseUrl} en configs/.env`),
        );
      } else {
        for (const name of MANAGED_ENV_VARS) {
          const value = config[name];
          if (value !== undefined) {
            console.log(chalk.yellow(`  [SET] ${name} = ${value}`));
          }
        }
        console.log(
          chalk.yellow(
            `  [PROXY] UPSTREAM_ORIGIN configurado a ${originalBaseUrl} en configs/.env`,
          ),
        );
      }

      if (!opts.dryRun) {
        await verifyApplied(provider, config, env);
      }
    }

    console.log(
      chalk.cyan('\nConfiguración completada. Reinicie Claude Code para aplicar los cambios.'),
    );
    console.log(
      chalk.cyan(
        'Si Smart Code Proxy ya estaba corriendo, debe reiniciarse para aplicar el nuevo UPSTREAM_ORIGIN.',
      ),
    );
  });

program.parse();
