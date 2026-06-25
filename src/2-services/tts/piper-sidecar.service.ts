import { spawn } from 'node:child_process';
import type { Logger } from '../../1-domain/types/logger.types.js';
import type { ITtsSidecarService } from '../../1-domain/ports/ITtsSidecarService.js';
import { SidecarExecutionError, SidecarNotInstalledError } from '../../1-domain/ports/ITtsSidecarService.js';
import { resolveSidecarAssets } from './sidecar-resolver.js';

type SpawnFn = typeof spawn;

interface SpeakResponse {
  status?: 'ok' | 'error';
  message?: string;
}

/**
 * Implementación del sidecar local de TTS. Spawn-ea el binario `tts-sidecar`,
 * le envía un comando JSON por stdin y espera la respuesta por stdout.
 *
 * No lanza excepciones hacia arriba en condiciones operativas normales: el
 * método público `speak` registra el error con el logger (si está inyectado)
 * y retorna. Los errores tipificados (`SidecarNotInstalledError`,
 * `SidecarExecutionError`) se exponen para tests y para composición con el
 * handler, que puede mapearlos a `[TTS-SIDE]` con el `reason` apropiado.
 */
export class PiperSidecarService implements ITtsSidecarService {
  private readonly timeoutMs: number;
  private readonly logger?: Logger;
  private readonly spawnFn: SpawnFn;

  constructor(opts: { timeoutMs?: number; logger?: Logger; spawnFn?: SpawnFn } = {}) {
    this.timeoutMs = opts.timeoutMs ?? this.parseTimeoutFromEnv();
    this.logger = opts.logger;
    this.spawnFn = opts.spawnFn ?? spawn;
  }

  /**
   * Cumple el contrato `ITTSService`. El sidecar no requiere inicialización
   * asíncrona: la primera invocación a `speak()` resuelve los assets y hace
   * spawn del binario.
   */
  async initialize(): Promise<void> {
    // No-op intencional: el sidecar se inicializa perezosamente en speak().
  }

  private parseTimeoutFromEnv(): number {
    const raw = process.env['TTS_SIDECAR_TIMEOUT_MS'];
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  }

  /**
   * Punto de entrada "amable" para el handler: NO lanza, registra el error y
   * retorna. Es la implementación que se inyecta como `ITTSService`.
   */
  async speak(text: string): Promise<void>;
  /**
   * Implementación tipificada del puerto: lanza errores tipificados. Útil
   * para composición con `ITtsSidecarService` y para tests.
   */
  async speak(text: string, voice: string): Promise<void>;
  async speak(text: string, voice?: string): Promise<void> {
    if (!text.trim()) return;
    const voiceName = voice ?? process.env['TTS_SIDECAR_VOICE'] ?? 'es_MX-claude-high';
    try {
      await this.invokeSidecar(text, voiceName);
    } catch (err) {
      if (err instanceof SidecarNotInstalledError || err instanceof SidecarExecutionError) {
        this.logger?.warn(
          { err: err.message, reason: err instanceof SidecarExecutionError ? err.reason : 'sidecar-missing' },
          '[TTS-SIDE] Síntesis omitida',
        );
        return;
      }
      this.logger?.warn(
        { err: err instanceof Error ? err.message : String(err), reason: 'exception' },
        '[TTS-SIDE] Síntesis omitida',
      );
    }
  }

  private async invokeSidecar(text: string, voice: string): Promise<void> {
    let assets;
    try {
      assets = resolveSidecarAssets();
    } catch (err) {
      if (err instanceof SidecarNotInstalledError) {
        throw err;
      }
      throw new SidecarExecutionError(
        err instanceof Error ? err.message : String(err),
        'spawn-failed',
      );
    }

    return new Promise<void>((resolve, reject) => {
      const child = this.spawnFn(assets.binaryPath, ['--model', assets.voiceModelPath, '--config', assets.voiceConfigPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      child.stdin?.on('error', () => {
        // EPIPE silencioso: el sidecar cerró el pipe antes de que terminemos de escribir.
      });

      let stdoutBuf = '';
      let stderrBuf = '';
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
        settle(() => reject(new SidecarExecutionError('sidecar excedió el timeout', 'timeout')));
      }, this.timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
        let nl: number;
        while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          if (!line) continue;
          try {
            const parsed = JSON.parse(line) as SpeakResponse;
            if (parsed.status === 'ok') {
              clearTimeout(timer);
              settle(() => resolve());
              break;
            } else if (parsed.status === 'error') {
              clearTimeout(timer);
              if (!child.killed) child.kill('SIGKILL');
              settle(() =>
                reject(
                  new SidecarExecutionError(
                    `sidecar reportó error: ${parsed.message ?? '(sin mensaje)'}`,
                    'non-zero-exit',
                  ),
                ),
              );
              break;
            }
          } catch {
            clearTimeout(timer);
            if (!child.killed) child.kill('SIGKILL');
            settle(() => reject(new SidecarExecutionError('JSON inválido desde sidecar', 'invalid-json')));
            break;
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        settle(() => reject(new SidecarExecutionError(`spawn falló: ${err.message}`, 'spawn-failed')));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        if (code === 0) {
          settle(() => resolve());
        } else {
          settle(() =>
            reject(
              new SidecarExecutionError(
                `sidecar terminó con código ${String(code)} (stderr: ${stderrBuf.trim().slice(0, 200) || 'vacío'})`,
                'non-zero-exit',
              ),
            ),
          );
        }
      });

      const payload = JSON.stringify({ cmd: 'speak', text, voice }) + '\n';
      child.stdin?.write(payload);
      child.stdin?.end();
    });
  }
}
