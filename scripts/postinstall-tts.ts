/**
 * Postinstall script: descarga el binario `tts-sidecar` y el modelo de voz
 * para la plataforma actual. Se ejecuta en `npm install` y manualmente con
 * `npm run tts:setup`.
 *
 * - Si la plataforma no está soportada, sale con código 1 (no fatal para postinstall).
 * - Si la descarga falla, sale con código 1 (degraded: el gateway arranca sin voz).
 * - Si la verificación SHA256 falla, sale con código 1 y elimina el archivo descargado.
 * - Si todo está ya instalado y verificado, sale con código 0 sin volver a descargar.
 *
 * Variables de entorno:
 * - `TTS_SIDECAR_BASE_URL`: URL base de los artefactos (default `https://tts-sidecar.example.com/v1/`).
 * - `TTS_SIDECAR_VOICE`: voz a descargar (default `es_MX-claude-voice-medium`).
 * - `TTS_SIDECAR_SKIP_DOWNLOAD=1`: atajo para CI/entornos sin red; sale con código 0 sin descargar.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const BASE_URL = process.env['TTS_SIDECAR_BASE_URL'] ?? 'https://tts-sidecar.example.com/v1/';
const VOICE = process.env['TTS_SIDECAR_VOICE'] ?? 'es_MX-claude-voice-medium';
const REPO_ROOT = resolve(__dirname, '..');
const VENDOR_DIR = join(REPO_ROOT, 'vendor', 'tts-sidecar');
const MANIFEST_PATH = join(REPO_ROOT, 'tts-sidecar.sha256');

interface Target {
  id: string;
  binary: string;
}

function detectTarget(): Target | null {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32' && arch === 'x64') return { id: 'windows-amd64', binary: 'tts-sidecar.exe' };
  if (platform === 'linux' && arch === 'x64') return { id: 'linux-amd64', binary: 'tts-sidecar' };
  if (platform === 'linux' && arch === 'arm64') return { id: 'linux-aarch64', binary: 'tts-sidecar' };
  if (platform === 'darwin' && arch === 'x64') return { id: 'macos-amd64', binary: 'tts-sidecar' };
  if (platform === 'darwin' && arch === 'arm64') return { id: 'macos-aarch64', binary: 'tts-sidecar' };
  return null;
}

interface Manifest {
  version: string;
  voices: Record<string, { model: string; config: string; sha256: { model: string; config: string } }>;
  binaries: Record<string, { file: string; sha256: string }>;
}

async function loadManifest(): Promise<Manifest> {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifiesto SHA256 no encontrado en ${MANIFEST_PATH}`);
  }
  const raw = await readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

function urlFor(path: string): string {
  return new URL(path, BASE_URL).toString();
}

async function downloadTo(url: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${String(res.status)} al descargar ${url}`);
  }
  // Node 18+ global fetch devuelve Web ReadableStream; convertir a Node Readable.
  const body = Readable.fromWeb(res.body as never);
  await pipeline(body, createWriteStream(dest));
}

async function sha256OfFile(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

async function main(): Promise<number> {
  if (process.env['TTS_SIDECAR_SKIP_DOWNLOAD'] === '1') {
    console.log('[tts:setup] TTS_SIDECAR_SKIP_DOWNLOAD=1; saltando descarga del sidecar.');
    return 0;
  }

  const target = detectTarget();
  if (!target) {
    console.error(
      `[tts:setup] Plataforma no soportada: ${process.platform}/${process.arch}. ` +
        'Edita scripts/postinstall-tts.ts para añadir tu target si aplica.',
    );
    return 1;
  }

  let manifest: Manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(`[tts:setup] ${(err as Error).message}`);
    console.error('[tts:setup] El gateway arrancará sin voz hasta que se proporcione el manifiesto.');
    return 1;
  }

  const binEntry = manifest.binaries[target.id];
  if (!binEntry) {
    console.error(`[tts:setup] Manifiesto no incluye binario para ${target.id}.`);
    return 1;
  }
  const voiceEntry = manifest.voices[VOICE];
  if (!voiceEntry) {
    console.error(`[tts:setup] Manifiesto no incluye la voz ${VOICE}.`);
    return 1;
  }

  const binDest = join(VENDOR_DIR, target.id, binEntry.file);
  const modelDest = join(VENDOR_DIR, 'voices', VOICE, voiceEntry.model);
  const configDest = join(VENDOR_DIR, 'voices', VOICE, voiceEntry.config);

  // Idempotencia: si todo está ya instalado y verificado, no descargar.
  const alreadyOk =
    existsSync(binDest) &&
    existsSync(modelDest) &&
    existsSync(configDest) &&
    (await sha256OfFile(binDest)) === binEntry.sha256 &&
    (await sha256OfFile(modelDest)) === voiceEntry.sha256.model &&
    (await sha256OfFile(configDest)) === voiceEntry.sha256.config;
  if (alreadyOk) {
    console.log(`[tts:setup] Sidecar y voz ${VOICE} ya instalados en ${VENDOR_DIR}.`);
    return 0;
  }

  console.log(`[tts:setup] Descargando tts-sidecar (${target.id}) y voz ${VOICE}...`);
  try {
    await downloadTo(urlFor(binEntry.file), binDest);
    const dlBinHash = await sha256OfFile(binDest);
    if (dlBinHash !== binEntry.sha256) {
      await writeFile(binDest, '').catch(() => undefined);
      console.error(
        `[tts:setup] SHA256 inválido para el binario. Esperado ${binEntry.sha256}, recibido ${dlBinHash}.`,
      );
      return 1;
    }
    if (process.platform !== 'win32') {
      await chmod(binDest, 0o755);
    }

    await downloadTo(urlFor(`voices/${VOICE}/${voiceEntry.model}`), modelDest);
    const dlModelHash = await sha256OfFile(modelDest);
    if (dlModelHash !== voiceEntry.sha256.model) {
      await writeFile(modelDest, '').catch(() => undefined);
      console.error(
        `[tts:setup] SHA256 inválido para el modelo. Esperado ${voiceEntry.sha256.model}, recibido ${dlModelHash}.`,
      );
      return 1;
    }

    await downloadTo(urlFor(`voices/${VOICE}/${voiceEntry.config}`), configDest);
    const dlConfigHash = await sha256OfFile(configDest);
    if (dlConfigHash !== voiceEntry.sha256.config) {
      await writeFile(configDest, '').catch(() => undefined);
      console.error(
        `[tts:setup] SHA256 inválido para la config. Esperado ${voiceEntry.sha256.config}, recibido ${dlConfigHash}.`,
      );
      return 1;
    }

    console.log(`[tts:setup] Instalación completa en ${VENDOR_DIR}.`);
    return 0;
  } catch (err) {
    console.error(`[tts:setup] Error durante la descarga: ${(err as Error).message}`);
    console.error('[tts:setup] El gateway arrancará sin voz. Vuelve a ejecutar `npm run tts:setup` con red.');
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`[tts:setup] Error inesperado: ${(err as Error).message}`);
    process.exit(1);
  });
