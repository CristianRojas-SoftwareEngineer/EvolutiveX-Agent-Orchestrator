/**
 * Rutas absolutas en disco del sidecar de TTS y de su modelo de voz.
 * Lo retorna `resolveSidecarAssets()` sin hacer ninguna llamada de red.
 */
export interface ITtsSidecarAssets {
  /** Path al binario `tts-sidecar` (o `tts-sidecar.exe` en Windows). */
  binaryPath: string;
  /** Path al modelo ONNX de la voz (p.ej. `es_MX-claude-high.onnx`). */
  voiceModelPath: string;
  /** Path al directorio `espeak-ng-data/` con lang/, dicts/, voices/. */
  espeakDataDir: string;
}
