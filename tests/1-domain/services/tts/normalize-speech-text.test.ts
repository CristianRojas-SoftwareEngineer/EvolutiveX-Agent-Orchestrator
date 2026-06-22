import { describe, it, expect } from 'vitest';
import { normalizeSpeechText } from '../../../../src/1-domain/services/tts/normalize-speech-text.js';

describe('normalizeSpeechText', () => {
  it('elimina marcadores de énfasis conservando el texto', () => {
    expect(normalizeSpeechText('**texto**')).toBe('texto');
    expect(normalizeSpeechText('*texto*')).toBe('texto');
    expect(normalizeSpeechText('_texto_')).toBe('texto');
  });

  it('convierte enlaces en su texto y descarta la URL', () => {
    expect(normalizeSpeechText('[Claude](https://claude.ai)')).toBe('Claude');
  });

  it('conserva el contenido de código inline y de bloques', () => {
    expect(normalizeSpeechText('usa `npm test` ahora')).toBe('usa npm test ahora');
    expect(normalizeSpeechText('```\nconst a = 1\n```')).toBe('const a 1');
  });

  it('elimina símbolos sueltos verbalizables', () => {
    expect(normalizeSpeechText('hola \\ "mundo" # | - fin')).toBe('hola mundo fin');
  });

  it('preserva acentos y ñ', () => {
    expect(normalizeSpeechText('configuración del niño')).toBe('configuración del niño');
  });

  it('conserva la puntuación de prosodia sin espacio previo', () => {
    expect(normalizeSpeechText('Hola , mundo ! ¿qué tal ?')).toBe('Hola, mundo! ¿qué tal?');
  });

  it('colapsa espacios múltiples y saltos de línea', () => {
    expect(normalizeSpeechText('uno   dos\n\ntres')).toBe('uno dos tres');
  });

  it('devuelve cadena vacía cuando solo hay símbolos', () => {
    expect(normalizeSpeechText('** \\ # | ~~')).toBe('');
    expect(normalizeSpeechText('')).toBe('');
  });
});
