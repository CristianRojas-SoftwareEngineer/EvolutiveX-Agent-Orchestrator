/**
 * Puerto de dominio para el servicio de síntesis de voz (TTS).
 * Las capas externas implementan este puerto; la capa 3-operations solo depende de él.
 */
export interface ITTSService {
  /**
   * Carga el modelo TTS en memoria. Se invoca una sola vez en el arranque del proxy.
   * Si falla, el servicio debe quedar en modo no-op silencioso (TTS deshabilitado).
   */
  initialize(): Promise<void>;

  /**
   * Sintetiza el texto indicado y lo reproduce de forma asíncrona no bloqueante.
   * No lanza excepciones; los errores se registran internamente.
   */
  speak(text: string): Promise<void>;
}
