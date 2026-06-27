import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ITtsSidecarAssets } from '../../1-domain/ports/ITtsSidecarAssets.js';
import { SidecarNotInstalledError } from '../../1-domain/ports/ITtsSidecarService.js';

/**
 * Mapea `process.platform` + `process.arch` al nombre del directorio que
 * `postinstall-tts.ts` espera. Si la plataforma no está soportada, devuelve
 * `null` para que el llamador reporte el error con un mensaje accionable.
 */
export function sidecarTargetId(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32' && arch === 'x64') return 'windows-amd64';
  if (platform === 'linux' && arch === 'x64') return 'linux-amd64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-aarch64';
  if (platform === 'darwin' && arch === 'x64') return 'macos-amd64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-aarch64';
  return null;
}

export function sidecarBinaryName(): string {
  return process.platform === 'win32' ? 'tts-sidecar.exe' : 'tts-sidecar';
}

/**
 * Resuelve paths absolutos al binario del sidecar y al modelo de voz.
 * No realiza llamadas de red. Si el binario o el modelo faltan en disco,
 * lanza `SidecarNotInstalledError` con un mensaje accionable.
 *
 * Variables de entorno:
 * - `TTS_SIDECAR_VENDOR_DIR`: override del directorio vendor (default `vendor/tts-sidecar`).
 * - `TTS_SIDECAR_VOICE`: voz a usar (default `es_MX-claude-high`).
 */
export function resolveSidecarAssets(): ITtsSidecarAssets {
  const vendorDir = process.env['TTS_SIDECAR_VENDOR_DIR'] ?? path.join(process.cwd(), 'vendor', 'tts-sidecar');
  const targetId = sidecarTargetId();
  if (!targetId) {
    throw new SidecarNotInstalledError(
      `Plataforma no soportada para tts-sidecar: ${process.platform}/${process.arch}. ` +
        `Ejecuta \`npm run tts:setup\` en una plataforma soportada (windows-amd64, linux-amd64, ` +
        `linux-aarch64, macos-amd64, macos-aarch64).`,
    );
  }

  const binaryPath = path.join(vendorDir, targetId, sidecarBinaryName());
  const voice = process.env['TTS_SIDECAR_VOICE'] ?? 'es_MX-claude-high';
  const voicesDir = path.join(vendorDir, targetId, 'vendor', 'tts-sidecar', 'voices');
  const voiceModelPath = path.join(voicesDir, voice, `${voice}.onnx`);
  const voiceConfigPath = path.join(voicesDir, voice, `${voice}.onnx.json`);
  const espeakDataDir = path.join(vendorDir, targetId, 'espeak-ng-data');

  if (!fs.existsSync(binaryPath)) {
    throw new SidecarNotInstalledError(
      `Binario tts-sidecar no instalado en ${binaryPath}. ` +
        `Ejecuta \`npm run tts:setup\` con conexión a Internet para descargarlo.`,
    );
  }
  if (!fs.existsSync(voiceModelPath) || !fs.existsSync(voiceConfigPath)) {
    throw new SidecarNotInstalledError(
      `Modelo de voz no instalado (esperado: ${voiceModelPath} y ${voiceConfigPath}). ` +
        `Ejecuta \`npm run tts:setup\` con conexión a Internet para descargarlo.`,
    );
  }

  return { binaryPath, voiceModelPath, voiceConfigPath, espeakDataDir };
}
