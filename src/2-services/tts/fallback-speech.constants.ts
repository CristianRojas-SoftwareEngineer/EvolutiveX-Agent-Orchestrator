/** Mensajes de fallback TTS por evento de hook (deben coincidir con toast y audio). */
export const FALLBACK_SPEECH: Record<string, string> = {
  UserPromptSubmit: 'Solicitud recibida. Procesando con Claude.',
  Stop: 'El asistente terminó su turno.',
  SubagentStop: 'El subagente completó su trabajo.',
  StopFailure: 'Ocurrió un error durante la ejecución.',
};

/** Texto genérico del evento Stop — indica fallback silencioso si se reproduce o aparece en toast. */
export const STOP_FALLBACK_TEXT = FALLBACK_SPEECH.Stop ?? 'El asistente terminó su turno.';

export const ALL_FALLBACK_TEXTS = new Set(Object.values(FALLBACK_SPEECH));
