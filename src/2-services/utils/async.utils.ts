import type { Logger } from '../../1-domain/types/logger.types.js';

/**
 * Ejecuta `fn` sin esperar su resolución (fire-and-forget).
 * Captura errores síncronos y rechazos async, registrándolos en log sin propagarlos.
 */
export function fireAndForget(fn: () => void | Promise<void>, logger?: Logger): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        logger?.error({ err }, 'fireAndForget: error en callback async');
      });
    }
  } catch (err: unknown) {
    logger?.error({ err }, 'fireAndForget: error en callback síncrono');
  }
}

/**
 * Ejecuta `fn` con un límite de tiempo. Si `fn` no resuelve antes de `ms`,
 * la promesa resultante se rechaza con un error de timeout.
 */
export function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operación excedió el timeout de ${ms}ms`));
    }, ms);
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
