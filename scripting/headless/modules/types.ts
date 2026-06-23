/** Tipo de mensaje TTS inferido a partir del status HTTP. */
export type TtsMessageType = 'dynamic' | 'fallback' | 'unknown';

/** Resultado de la prueba headless para un proveedor. */
export interface ProviderTestResult {
  provider: string;
  upstreamOrigin: string;
  mainSessionStatus: number | null;
  ttsStatus: number | null;
  ttsStatuses: number[];
  ttsCallCount: number;
  anyTtsFallback: boolean;
  stopUsedFallback: boolean;
  ttsFallbacks: TtsFallbackEvent[];
  ttsWorked: boolean;
  messageType: TtsMessageType;
  claudeExitCode: number;
  claudeError: boolean;
  has402: boolean;
  ttsDrainMs: number;
  /** false si el transcript no refleja el prompt completo (p. ej. truncado en Windows). */
  promptVerified: boolean;
  errors: string[];
}

/** Evento de fallback TTS registrado en logs del gateway. */
export interface TtsFallbackEvent {
  eventName: string;
  reason: string;
  fallbackText: string;
}

/** Evento [TTS-SPEECH] registrado en logs del gateway (mensaje dinámico generado). */
export interface TtsSpeechEvent {
  eventName: string;
  textPreview: string;
}

/** Resultado del análisis incremental de logs JSONL. */
export interface LogAnalysisResult {
  mainSessionStatus: number | null;
  /** Status de la última llamada TTS vía proxy (null si el provider TTS es dedicado/directo). */
  ttsStatus: number | null;
  /** Todas las llamadas TTS completadas vía proxy. Vacío si el provider TTS es dedicado. */
  ttsStatuses: number[];
  has402: boolean;
  /** Fallbacks silenciosos detectados (audio/toast genérico). */
  ttsFallbacks: TtsFallbackEvent[];
  /** Mensajes dinámicos generados (via [TTS-SPEECH]). */
  ttsSpeeches: TtsSpeechEvent[];
  /** true si el Stop usó el mensaje genérico. */
  stopUsedFallback: boolean;
}

/** Orden documentado de la suite por defecto (ver providers.ts para exclusión dinámica). */
export const DEFAULT_PROVIDER_ORDER = [
  'ollama',
  'minimax',
  'openrouter',
  'anthropic',
  'default',
] as const;
