/**
 * Representa un mensaje extraído del transcript de una sesión de Claude Code.
 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

/**
 * Contexto curado para el evento `UserPromptSubmit`.
 *
 * Compone tres elementos con la única información que el LLM necesita
 * para confirmar la petición actual por voz: la petición anterior del
 * usuario, la última respuesta del asistente en el turno previo, y el
 * prompt actual que se acaba de enviar. Los dos primeros pueden ser
 * `undefined` en sesiones nuevas donde el transcript aún no contiene
 * turnos previos.
 */
export interface UserPromptContext {
  /** Texto del penúltimo mensaje del usuario en el transcript. `undefined` si no existe. */
  previousUserMessage: string | undefined;
  /** Texto de la última respuesta del asistente en el transcript. `undefined` si no existe. */
  lastAssistantResponse: string | undefined;
  /** Texto del prompt actual entregado en el payload del hook `UserPromptSubmit`. */
  currentPrompt: string;
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

  /**
   * Extrae el contexto curado para el evento `UserPromptSubmit`.
   *
   * Lee el transcript, filtra por rol y devuelve un `UserPromptContext`
   * con la tríada (penúltimo user, último assistant, prompt actual).
   * En sesión nueva los dos primeros campos serán `undefined`.
   *
   * @param transcriptPath Ruta absoluta al archivo JSONL del transcript de la sesión.
   * @param currentPrompt Texto del prompt recibido en el payload del hook.
   */
  extractUserPromptSubmitContext(
    transcriptPath: string,
    currentPrompt: string,
  ): Promise<UserPromptContext>;
}
