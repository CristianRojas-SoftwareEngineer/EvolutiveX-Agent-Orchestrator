import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { PiperSidecarService } from '../../../src/2-services/tts/piper-sidecar.service.js';

type SpawnFn = typeof import('node:child_process').spawn;

/**
 * Crea un stub mínimo de ChildProcess controlable.
 * Cuando stdin termina ('finish'), emite stdoutResponse en stdout y luego close(0).
 * Para simular timeout: pasar stdoutResponse = '' y no cerrar stdin manualmente.
 */
function makeChildStub(stdoutResponse: string): { spawnFn: SpawnFn } {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const child = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    killed: false,
    kill: vi.fn(() => { (child as unknown as { killed: boolean }).killed = true; }),
    pid: 99999,
  }) as unknown as ChildProcess;
  stdin.on('finish', () => {
    if (stdoutResponse) {
      stdout.push(stdoutResponse);
    }
    stdout.push(null);
    emitter.emit('close', 0);
  });
  const spawnFn = vi.fn().mockReturnValue(child) as unknown as SpawnFn;
  return { spawnFn };
}

/** Crea un stub que no responde nada (para simular timeout). kill() emite close de forma asíncrona. */
function makeHangingChildStub(): { spawnFn: SpawnFn } {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const child = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    killed: false,
    kill: vi.fn(() => {
      (child as unknown as { killed: boolean }).killed = true;
      setImmediate(() => emitter.emit('close', null));
    }),
    pid: 99999,
  }) as unknown as ChildProcess;
  const spawnFn = vi.fn().mockReturnValue(child) as unknown as SpawnFn;
  return { spawnFn };
}

const VOICE = 'es_MX-test-voice';

/**
 * Crea un vendor mock con un binario script-per-plataforma que lee stdin y
 * escribe stdout según el comportamiento deseado. Devuelve el root del vendor.
 */
function setupMockVendor(scriptBody: string): { vendorRoot: string; voiceDir: string } {
  const vendorRoot = mkdtempSync(join(tmpdir(), 'tts-sidecar-mock-'));
  const platform = process.platform;
  const arch = process.arch;
  const targetId =
    platform === 'win32' && arch === 'x64'
      ? 'windows-amd64'
      : platform === 'linux' && arch === 'x64'
        ? 'linux-amd64'
        : platform === 'linux' && arch === 'arm64'
          ? 'linux-aarch64'
          : platform === 'darwin' && arch === 'x64'
            ? 'macos-amd64'
            : platform === 'darwin' && arch === 'arm64'
              ? 'macos-aarch64'
              : null;
  if (!targetId) {
    return { vendorRoot, voiceDir: '' };
  }

  const binDir = join(vendorRoot, targetId);
  mkdirSync(binDir, { recursive: true });
  const binName = platform === 'win32' ? 'tts-sidecar.exe' : 'tts-sidecar';

  if (platform === 'win32') {
    // Para Windows, generar un .cmd que ejecute node con un script .js auxiliar.
    const scriptPath = join(binDir, 'tts-sidecar-script.js');
    writeFileSync(scriptPath, scriptBody);
    writeFileSync(join(binDir, binName), `@echo off\r\nnode "${scriptPath}" %*\r\n`);
  } else {
    const scriptPath = join(binDir, 'tts-sidecar-script.js');
    writeFileSync(scriptPath, scriptBody);
    writeFileSync(join(binDir, binName), `#!/bin/sh\nnode "${scriptPath}" "$@"\n`);
    chmodSync(join(binDir, binName), 0o755);
  }

  const voiceDir = join(vendorRoot, 'voices', VOICE);
  mkdirSync(voiceDir, { recursive: true });
  writeFileSync(join(voiceDir, `${VOICE}.onnx`), 'fake-onnx');
  writeFileSync(join(voiceDir, `${VOICE}.onnx.json`), '{}');

  return { vendorRoot, voiceDir };
}

describe('PiperSidecarService', () => {
  let prevVendor: string | undefined;
  let prevVoice: string | undefined;

  beforeEach(() => {
    prevVendor = process.env['TTS_SIDECAR_VENDOR_DIR'];
    prevVoice = process.env['TTS_SIDECAR_VOICE'];
    process.env['TTS_SIDECAR_VOICE'] = VOICE;
  });

  afterEach(() => {
    if (prevVendor === undefined) delete process.env['TTS_SIDECAR_VENDOR_DIR'];
    else process.env['TTS_SIDECAR_VENDOR_DIR'] = prevVendor;
    if (prevVoice === undefined) delete process.env['TTS_SIDECAR_VOICE'];
    else process.env['TTS_SIDECAR_VOICE'] = prevVoice;
  });

  it('speak amable retorna undefined si no hay vendor configurado (no bloquea al handler)', async () => {
    process.env['TTS_SIDECAR_VENDOR_DIR'] = join(tmpdir(), 'tts-no-vendor-' + Date.now());
    const svc = new PiperSidecarService();
    await expect(svc.speak('hola', VOICE)).resolves.toBeUndefined();
  });

  it('resuelve el sidecar exitosamente cuando el binario responde ok', async () => {
    const { vendorRoot } = setupMockVendor(`
      // Lee stdin completo, ignora contenido, responde ok
      process.stdin.on('data', () => {});
      process.stdin.on('end', () => {
        process.stdout.write('{"status":"ok"}\\n');
        process.exit(0);
      });
    `);
    process.env['TTS_SIDECAR_VENDOR_DIR'] = vendorRoot;
    const svc = new PiperSidecarService({ timeoutMs: 5000 });
    await expect(svc.speak('hola', VOICE)).resolves.toBeUndefined();
  });

  it('speak amable omite audio sin lanzar cuando el sidecar falla', async () => {
    const { vendorRoot } = setupMockVendor('// stub — el binario real nunca se ejecuta');
    process.env['TTS_SIDECAR_VENDOR_DIR'] = vendorRoot;
    const { spawnFn } = makeChildStub('{"status":"error","message":"voice-not-found"}\n');
    const warn = vi.fn();
    const svc = new PiperSidecarService({ timeoutMs: 5000, logger: { warn } as never, spawnFn });
    await expect(svc.speak('hola', VOICE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'non-zero-exit' }), expect.any(String));
  });

  it('speak amable maneja JSON inválido del sidecar sin lanzar', async () => {
    const { vendorRoot } = setupMockVendor('// stub — el binario real nunca se ejecuta');
    process.env['TTS_SIDECAR_VENDOR_DIR'] = vendorRoot;
    const { spawnFn } = makeChildStub('esto no es json\n');
    const warn = vi.fn();
    const svc = new PiperSidecarService({ timeoutMs: 5000, logger: { warn } as never, spawnFn });
    await expect(svc.speak('hola', VOICE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'invalid-json' }), expect.any(String));
  });

  it('speak amable maneja timeout del sidecar sin lanzar', async () => {
    const { vendorRoot } = setupMockVendor('// stub — el binario real nunca se ejecuta');
    process.env['TTS_SIDECAR_VENDOR_DIR'] = vendorRoot;
    const { spawnFn } = makeHangingChildStub();
    const warn = vi.fn();
    const svc = new PiperSidecarService({ timeoutMs: 50, logger: { warn } as never, spawnFn });
    await expect(svc.speak('hola', VOICE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'timeout' }), expect.any(String));
  });

  it('no invoca el sidecar si el texto está vacío', async () => {
    const { vendorRoot } = setupMockVendor(`
      process.stdin.on('data', () => {});
      process.stdin.on('end', () => {
        process.stdout.write('{"status":"ok"}\\n');
        process.exit(0);
      });
    `);
    process.env['TTS_SIDECAR_VENDOR_DIR'] = vendorRoot;
    const warn = vi.fn();
    const svc = new PiperSidecarService({ timeoutMs: 1000, logger: { warn } as never });
    await svc.speak('   ', VOICE);
    expect(warn).not.toHaveBeenCalled();
  });
});
