import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sidecarTargetId,
  sidecarBinaryName,
  resolveSidecarAssets,
} from '../../../src/2-services/tts/sidecar-resolver.js';
import { SidecarNotInstalledError } from '../../../src/1-domain/ports/ITtsSidecarService.js';

describe('sidecar-resolver', () => {
  describe('sidecarTargetId', () => {
    it('mapea windows/x64 → windows-amd64', () => {
      // El test no altera process.platform; se cubre la rama esperada
      // para la plataforma actual como smoke-test de no-NaN.
      const id = sidecarTargetId();
      // En el CI de Windows es 'windows-amd64'; en otros hosts puede ser otro valor soportado.
      if (process.platform === 'win32' && process.arch === 'x64') {
        expect(id).toBe('windows-amd64');
      } else if (process.platform === 'linux' && process.arch === 'x64') {
        expect(id).toBe('linux-amd64');
      } else if (process.platform === 'darwin' && process.arch === 'arm64') {
        expect(id).toBe('macos-aarch64');
      } else {
        expect(id === null || typeof id === 'string').toBe(true);
      }
    });
  });

  describe('sidecarBinaryName', () => {
    it('devuelve tts-sidecar.exe en Windows y tts-sidecar en otros', () => {
      if (process.platform === 'win32') {
        expect(sidecarBinaryName()).toBe('tts-sidecar.exe');
      } else {
        expect(sidecarBinaryName()).toBe('tts-sidecar');
      }
    });
  });

  describe('resolveSidecarAssets', () => {
    let tmpRoot: string;
    let prevVendor: string | undefined;
    let prevVoice: string | undefined;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'tts-sidecar-test-'));
      prevVendor = process.env['TTS_SIDECAR_VENDOR_DIR'];
      prevVoice = process.env['TTS_SIDECAR_VOICE'];
      process.env['TTS_SIDECAR_VENDOR_DIR'] = tmpRoot;
      process.env['TTS_SIDECAR_VOICE'] = 'es_MX-test-voice';
    });

    afterEach(() => {
      if (prevVendor === undefined) delete process.env['TTS_SIDECAR_VENDOR_DIR'];
      else process.env['TTS_SIDECAR_VENDOR_DIR'] = prevVendor;
      if (prevVoice === undefined) delete process.env['TTS_SIDECAR_VOICE'];
      else process.env['TTS_SIDECAR_VOICE'] = prevVoice;
      if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('lanza SidecarNotInstalledError si el binario no existe', () => {
      expect(() => resolveSidecarAssets()).toThrow(SidecarNotInstalledError);
    });

    it('lanza SidecarNotInstalledError si el binario existe pero el modelo falta', () => {
      const targetId = sidecarTargetId();
      if (!targetId) return; // plataforma no soportada: skip
      const binDir = join(tmpRoot, targetId);
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, sidecarBinaryName()), '#!/bin/sh\necho ok\n');
      // El modelo NO se crea
      expect(() => resolveSidecarAssets()).toThrow(SidecarNotInstalledError);
    });

    it('devuelve paths absolutos cuando el binario y el modelo existen', () => {
      const targetId = sidecarTargetId();
      if (!targetId) return; // plataforma no soportada: skip
      const binDir = join(tmpRoot, targetId);
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, sidecarBinaryName()), '#!/bin/sh\n');

      const voiceDir = join(tmpRoot, 'voices', 'es_MX-test-voice');
      mkdirSync(voiceDir, { recursive: true });
      writeFileSync(join(voiceDir, 'es_MX-test-voice.onnx'), 'fake-onnx');
      writeFileSync(join(voiceDir, 'es_MX-test-voice.onnx.json'), '{}');

      const assets = resolveSidecarAssets();
      expect(assets.binaryPath).toBe(join(binDir, sidecarBinaryName()));
      expect(assets.voiceModelPath).toBe(join(voiceDir, 'es_MX-test-voice.onnx'));
      expect(assets.voiceConfigPath).toBe(join(voiceDir, 'es_MX-test-voice.onnx.json'));
    });
  });
});
