import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { IEnvManager } from './types.js';
import { MANAGED_ENV_VARS } from './types.js';

// ── Windows ──────────────────────────────────────────────────

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
    try {
      execSync(`Remove-ItemProperty -Path 'HKCU:\\Environment' -Name '${name}' -ErrorAction Stop`, {
        shell: 'powershell.exe',
        stdio: 'pipe',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/was not found|does not exist|No se encontr/.test(msg)) {
        throw err;
      }
    }
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

// ── Unix ─────────────────────────────────────────────────────

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

// ── Factory ──────────────────────────────────────────────────

export function createEnvManager(): IEnvManager {
  if (process.platform === 'win32') return new WindowsEnvManager();
  return new UnixEnvManager();
}
