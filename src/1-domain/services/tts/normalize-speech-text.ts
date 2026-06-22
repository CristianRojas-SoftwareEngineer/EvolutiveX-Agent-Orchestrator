/**
 * Normaliza texto para síntesis de voz (TTS).
 *
 * El texto que genera el LLM puede traer markdown y caracteres especiales
 * (`*`, `_`, backticks, `\`, comillas, enlaces) que los motores TTS leen
 * literalmente ("asterisco asterisco …"), ensuciando el audio. Esta función
 * desmarca las estructuras markdown conservando las palabras y luego aplica una
 * whitelist que deja solo caracteres pronunciables, garantizando que ningún
 * símbolo verbalizable sobreviva.
 *
 * Es pura y determinista: es la garantía de saneamiento, independiente del prompt.
 */
export function normalizeSpeechText(input: string): string {
  let t = input;

  // 1. Desmarcar estructuras markdown conservando el contenido legible.
  t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ' ')); // bloques de código
  t = t.replace(/`([^`]*)`/g, '$1'); // código inline
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // imágenes -> alt
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // enlaces -> texto
  t = t.replace(/\\([\\`*_{}[\]()#+\-.!~>])/g, '$1'); // escapes de markdown

  // 2. Saltos de línea -> espacio.
  t = t.replace(/[\r\n]+/g, ' ');

  // 3. Whitelist: letras (con acentos/ñ/ü vía \p{L}), dígitos, espacios y
  //    puntuación de prosodia. Todo lo demás se elimina.
  t = t.replace(/[^\p{L}\p{N}\s.,;:¿?¡!]/gu, ' ');

  // 4. Normalizar espacios y el espacio previo a signos de puntuación.
  t = t.replace(/\s+([.,;:?!])/g, '$1');
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}
