/**
 * Representa un mensaje extraído del transcript de una sesión de Claude Code.
 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

/**
 * Puerto de dominio para la extracción de contexto desde el transcript de sesión.
 * Permite a las capas externas leer el historial de mensajes sin acoplarse al formato JSONL.
 */
export interface IContextExtractor {
  /**
   * Lee los últimos `n` mensajes del transcript JSONL de Claude Code.
   * Devuelve un arreglo vacío si el archivo no existe o si ocurre un error de lectura.
   *
   * @param transcriptPath Ruta absoluta al archivo JSONL del transcript de la sesión.
   * @param n Número máximo de mensajes a retornar (más recientes primero).
   */
  extractLastNMessages(transcriptPath: string, n: number): Promise<SessionMessage[]>;
}
