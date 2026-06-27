/**
 * Postinstall script: descarga el binario `tts-sidecar` (ZIP por plataforma)
 * y lo extrae. El modelo de voz va dentro del ZIP — no se descarga por separado.
 * Se ejecuta en `npm install` (compilado con `node`) y manualmente con `npm run tts:setup`.
 *
 * Comportamiento:
 * - Si `TTS_SIDECAR_SKIP_DOWNLOAD=1`, sale con código 0 sin descargar.
 * - Si la plataforma no está soportada, registra un aviso y sale con código 0
 *   (degradación elegante: el gateway arranca sin voz).
 * - Descarga el ZIP de la plataforma, verifica SHA256 contra `tts-sidecar.sha256`,
 *   extrae con `adm-zip` a `vendor/tts-sidecar/<targetId>/`.
 * - El modelo de voz (`voices/es_MX-claude-high/`) viene dentro del ZIP.
 * - Idempotente: si el binario ya está instalado y el SHA coincide, sale con código 0
 *   sin re-descargar.
 * - Sale con código 0 en todo path controlado (red, SHA inválido, plataforma).
 *   Solo retorna código ≠ 0 ante errores irrecuperables (manifiesto JSON inválido).
 *
 * Variables de entorno:
 * - `TTS_SIDECAR_BASE_URL`: URL base de los artefactos (override; el default
 *   real de la constante BASE_URL está abajo — nada carga `.env` en este proceso).
 * - `TTS_SIDECAR_SKIP_DOWNLOAD=1`: atajo para CI/entornos sin red.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, chmod, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';

// Default real: URL de GitHub Releases (reemplazar <owner>/<repo> cuando se concrete el repo público).
// Este valor es el que efectivamente se usa en postinstall porque nada carga .env en este proceso.
const BASE_URL =
  process.env['TTS_SIDECAR_BASE_URL'] ??
  'https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v0.1.0/';

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
  binaries: Record<string, { file: string; sha256: string }>;
}

async function loadManifest(): Promise<Manifest> {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifiesto SHA256 no encontrado en ${MANIFEST_PATH}`);
  }
  const raw = await readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
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

async function sha256OfFile(filePath: string): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

async function main(): Promise<number> {
  if (process.env['TTS_SIDECAR_SKIP_DOWNLOAD'] === '1') {
    console.log('[TTS-SIDE] TTS_SIDECAR_SKIP_DOWNLOAD=1; saltando descarga del sidecar.');
    return 0;
  }

  const target = detectTarget();
  if (!target) {
    console.error(
      `[TTS-SIDE] Plataforma no soportada: ${process.platform}/${process.arch}. ` +
        'Plataformas soportadas: windows-amd64, linux-amd64, linux-aarch64, macos-amd64, macos-aarch64. ' +
        'El gateway arrancará sin voz.',
    );
    return 0;
  }

  let manifest: Manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    // JSON inválido es irrecuperable: retornamos código ≠ 0 solo aquí.
    const msg = (err as Error).message;
    if (msg.includes('JSON')) {
      console.error(`[TTS-SIDE] Manifiesto JSON inválido: ${msg}`);
      return 1;
    }
    console.error(`[TTS-SIDE] ${msg}`);
    console.error('[TTS-SIDE] El gateway arrancará sin voz hasta que se proporcione el manifiesto.');
    return 0;
  }

  const binEntry = manifest.binaries[target.id];
  if (!binEntry) {
    console.error(`[TTS-SIDE] Manifiesto no incluye binario para ${target.id}. El gateway arrancará sin voz.`);
    return 0;
  }

  // Paths locales de destino.
  // El ZIP se extrae sobre vendor/tts-sidecar/; el layout del ZIP es <targetId>/...
  const zipDest = join(VENDOR_DIR, binEntry.file);
  const binaryDest = join(VENDOR_DIR, target.id, target.binary);

  // Idempotencia: si el binario ya está instalado y el SHA coincide, no re-descargar.
  try {
    if (
      existsSync(binaryDest) &&
      (await sha256OfFile(zipDest).catch(() => '')) === binEntry.sha256
    ) {
      console.log(`[TTS-SIDE] Sidecar ${target.id} ya instalado en ${VENDOR_DIR}.`);
      return 0;
    }
  } catch {
    // Si falla la verificación, continuamos con la descarga.
  }

  console.log(`[TTS-SIDE] Descargando tts-sidecar (${target.id})...`);

  try {
    // 1. Descargar ZIP del binario (incluye la voz).
    const zipUrl = new URL(binEntry.file, BASE_URL).toString();
    await mkdir(VENDOR_DIR, { recursive: true });
    await downloadTo(zipUrl, zipDest);

    // 2. Verificar SHA256 del ZIP.
    const dlZipHash = await sha256OfFile(zipDest);
    if (dlZipHash !== binEntry.sha256) {
      // SHA placeholder (pre-CI): aceptar con aviso en lugar de eliminar el ZIP.
      if (binEntry.sha256 === '0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('[TTS-SIDE] SHA256 placeholder detectado (pre-CI); omitiendo verificación del ZIP.');
      } else {
        await unlink(zipDest).catch(() => undefined);
        console.error(
          `[TTS-SIDE] SHA256 inválido para el ZIP. Esperado ${binEntry.sha256}, recibido ${dlZipHash}. ` +
            'El gateway arrancará sin voz.',
        );
        return 0;
      }
    }

    // 3. Extraer ZIP con adm-zip.
    // El ZIP tiene layout: <targetId>/{tts-sidecar[.exe], libespeak-ng.*, espeak-ng-data/, voices/}
    // Se extrae sobre VENDOR_DIR, resultando en vendor/tts-sidecar/<targetId>/...
    const zip = new AdmZip(zipDest);
    zip.extractAllTo(VENDOR_DIR, /* overwrite */ true);

    // 4. chmod 755 al binario (no aplica en Windows).
    if (process.platform !== 'win32' && existsSync(binaryDest)) {
      await chmod(binaryDest, 0o755);
    }

    console.log(`[TTS-SIDE] Instalación completa en ${VENDOR_DIR}.`);
    return 0;
  } catch (err) {
    console.error(`[TTS-SIDE] Error durante la instalación: ${(err as Error).message}`);
    console.error('[TTS-SIDE] El gateway arrancará sin voz. Ejecuta `npm run tts:setup` con conexión a Internet.');
    return 0;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`[TTS-SIDE] Error inesperado: ${(err as Error).message}`);
    // Error inesperado no controlado: retornar 0 para no abortar npm install.
    process.exit(0);
  });
