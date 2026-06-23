/**
 * Re-exports de los mensajes de fallback textual para el headless TTS analyzer.
 * Tras la migración a sidecar local (c00076), las constantes ya no viven en
 * `src/2-services/tts/`; este módulo preserva el shape `FALLBACK_SPEECH` /
 * `STOP_FALLBACK_TEXT` que el analizador de logs consume, derivándolas del
 * mismo texto que ahora compone `AuditHookEventHandler.composeFallbackText`.
 *
 * Si los textos cambian en el handler, este módulo debe actualizarse en la
 * misma revisión para mantener la paridad de detección de logs.
 */
export const FALLBACK_SPEECH: Readonly<Record<string, string>> = {
  UserPromptSubmit: 'Solicitud recibida. Procesando con Claude.',
  Stop: 'El asistente terminó su turno.',
  SubagentStop: 'El subagente completó su trabajo.',
  StopFailure: 'Ocurrió un error durante la ejecución.',
};

export const STOP_FALLBACK_TEXT = FALLBACK_SPEECH['Stop'] ?? 'El asistente terminó su turno.';

export const ALL_FALLBACK_TEXTS = new Set(Object.values(FALLBACK_SPEECH));
