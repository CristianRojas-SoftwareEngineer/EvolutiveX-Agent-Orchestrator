import { execSync, spawn } from 'node:child_process';

export interface ClaudeRunResult {
  exitCode: number;
  isError: boolean;
  resultText: string;
}

/**
 * Resuelve el ejecutable de Claude en PATH.
 * En Windows evita shell:true; usa la ruta completa de `where claude`.
 */
export function resolveClaudeExecutable(): string {
  if (process.platform === 'win32') {
    try {
      const lines = execSync('where claude', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines[0]) return lines[0];
    } catch {
      // Fallback al nombre en PATH sin shell
    }
  }
  return 'claude';
}

/**
 * Argumentos headless alineados con headless-cli-testing (haiku, 1 turno, JSON).
 * `env` se inyecta vía --settings (JSON inline): el bloque `env` de settings.json
 * del usuario sobreescribe el entorno heredado del subproceso, así que la única
 * forma fiable de aislar el provider es un settings adicional con mayor precedencia.
 */
export function buildClaudeHeadlessArgs(
  prompt: string,
  env: Record<string, string> = {},
): string[] {
  const args = ['-p', prompt, '--model', 'haiku', '--max-turns', '1', '--output-format', 'json'];
  if (Object.keys(env).length > 0) {
    args.push('--settings', JSON.stringify({ env }));
  }
  return args;
}

/**
 * Ejecuta claude -p sin shell para que comas y espacios en el prompt no se trunquen (Windows cmd).
 * `env` sobreescribe variables heredadas; tiene prioridad sobre ~/.claude/settings.json
 * dentro del subproceso, lo que permite aislar el provider de test sin mutar configuración global.
 */
export async function runClaudeHeadless(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  env: Record<string, string> = {},
): Promise<ClaudeRunResult> {
  const executable = resolveClaudeExecutable();
  const args = buildClaudeHeadlessArgs(prompt, env);

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        exitCode: 1,
        isError: true,
        resultText: `Timeout tras ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = stdout + '\n' + stderr;
      const jsonLine = combined
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('{') && l.includes('"type"'));

      let isError = code !== 0;
      let resultText = '';

      if (jsonLine) {
        try {
          const parsed = JSON.parse(jsonLine) as {
            is_error?: boolean;
            result?: string;
          };
          isError = parsed.is_error === true || code !== 0;
          resultText = parsed.result ?? '';
        } catch {
          isError = true;
        }
      }

      resolve({
        exitCode: code ?? 1,
        isError,
        resultText,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ exitCode: 1, isError: true, resultText: `Error al ejecutar claude: ${msg}` });
    });
  });
}
