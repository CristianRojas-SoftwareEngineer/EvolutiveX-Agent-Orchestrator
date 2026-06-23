import type { SessionMessage } from './IContextExtractor.js';

/**
 * Puerto de dominio para la generación de texto a sintetizar por voz.
 * Las implementaciones concretas (Gemini, OpenRouter, cadena de fallback)
 * viven en la capa 2-services; la capa 3-operations solo depende de este puerto.
 */
export interface ITtsTextProvider {
  /**
   * Genera el texto a reproducir por voz a partir del contexto del evento.
   * Siempre devuelve un string no vacío: si el provider falla, lanza para que
   * el orquestador de cadena (o el handler) aplique el fallback correspondiente.
   *
   * @param eventName Nombre del evento de hook que originó la locución.
   * @param messages  Mensajes del transcript extraídos para el contexto.
   * @param mode      'prompt' — responde al prompt actual; 'summary' — resume el turno.
   */
  generateText(
    eventName: string,
    messages: SessionMessage[],
    mode: 'prompt' | 'summary',
  ): Promise<string>;
}
