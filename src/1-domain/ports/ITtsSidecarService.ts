/**
 * Puerto de dominio para el sidecar local de TTS (`tts-sidecar`).
 *
 * Complementa al puerto canónico `ITTSService` con un método parametrizable por
 * voz y errores tipificados para el dominio del sidecar. La capa 3-operations no
 * debería importar este puerto directamente: usa `ITTSService` para mantener el
 * contrato estable y delega en `PiperSidecarService` desde el composition root.
 */
export type SidecarFailureReason =
  | 'sidecar-missing'
  | 'spawn-failed'
  | 'timeout'
  | 'invalid-json'
  | 'non-zero-exit'
  | 'exception';

/**
 * Lanza cuando el binario o el modelo de voz no están presentes en disco.
 * El handler lo traduce a `[TTS-SIDE]` con `reason: "sidecar-missing"`.
 */
export class SidecarNotInstalledError extends Error {
  public readonly reason = 'sidecar-missing' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SidecarNotInstalledError';
  }
}

/**
 * Lanza cuando el sidecar está presente pero el proceso falla. El `reason` es
 * el identificador estable que el handler usa para el log `[TTS-SIDE]`.
 */
export class SidecarExecutionError extends Error {
  constructor(
    message: string,
    public readonly reason: SidecarFailureReason,
  ) {
    super(message);
    this.name = 'SidecarExecutionError';
  }
}

export interface ITtsSidecarService {
  /**
   * Sintetiza el texto con la voz indicada y lo reproduce localmente.
   * @param text Texto a sintetizar (puede ser vacío; en ese caso retorna sin invocar el sidecar).
   * @param voice Identificador de la voz (p.ej. `es_MX-claude-voice-medium`).
   */
  speak(text: string, voice: string): Promise<void>;
}
