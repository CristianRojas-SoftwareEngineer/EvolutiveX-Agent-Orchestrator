// Especificación de assets para la imagen de cuerpo en toasts Windows (SnoreToast `-p`).
//
// SnoreToast usa ToastTemplateType_ToastImageAndText02: imagen a la izquierda del
// bloque de texto. El hueco suele ser más alto que ancho; un PNG cuadrado pequeño
// (p. ej. 88×88) provoca letterboxing negro arriba/abajo en el shell.
//
// @see node-notifier → SnoreToast; KDE/snoretoast displayToast() + ToastImageAndText02

import sharp from 'sharp';

/** Ancho del asset a 100 % DPI (ajuste empírico Win11). */
export const TOAST_BODY_IMAGE_WIDTH_PX = 128;

/** Alto del asset; algo mayor que el ancho para acercarse al hueco vertical del toast. */
export const TOAST_BODY_IMAGE_HEIGHT_PX = 128;

/** Alias histórico (cuadrado). */
export const TOAST_BODY_IMAGE_SIZE_PX = TOAST_BODY_IMAGE_WIDTH_PX;

/** Radio del disco visible (alineado a `ai-assistant.png`). */
export const NOTIFICATION_IMAGE_CIRCLE_RADIUS_RATIO = 0.4375;

/** Gris de referencia del toast en tema claro (Action Center). */
export const TOAST_SHELL_REFERENCE_RGB = 243;

/** Opacidad equivalente del blanco sobre ese gris (sin alpha en el PNG exportado). */
export const TOAST_BODY_WHITE_BLEND_OPACITY = 0.9;

/** Tolerancia al remapear fondos grises de exportaciones anteriores. */
const LEGACY_FLATTEN_TOLERANCE = 12;

/** Mezcla opaca: `opacity`×blanco + (1−`opacity`)×gris del shell. */
export function blendOpaqueWhiteOverToastShell(
  shellGray = TOAST_SHELL_REFERENCE_RGB,
  opacity = TOAST_BODY_WHITE_BLEND_OPACITY,
): number {
  return Math.round((1 - opacity) * shellGray + opacity * 255);
}

const blendChannel = blendOpaqueWhiteOverToastShell();

/**
 * Fondo opaco al exportar PNG (el shell no mezcla bien la transparencia).
 * Equivalente a blanco al 90 % sobre `#f3f3f3` → `#fefefe`.
 */
export const TOAST_BODY_IMAGE_BACKGROUND = {
  r: blendChannel,
  g: blendChannel,
  b: blendChannel,
} as const;

function remapLegacyFlattenBackground(
  data: Buffer,
  channels: number,
  fromGray: number,
  to: typeof TOAST_BODY_IMAGE_BACKGROUND,
): void {
  const step = channels;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (
      Math.abs(r - fromGray) <= LEGACY_FLATTEN_TOLERANCE &&
      Math.abs(g - fromGray) <= LEGACY_FLATTEN_TOLERANCE &&
      Math.abs(b - fromGray) <= LEGACY_FLATTEN_TOLERANCE
    ) {
      data[i] = to.r;
      data[i + 1] = to.g;
      data[i + 2] = to.b;
      if (step === 4) {
        data[i + 3] = 255;
      }
    }
  }
}

/**
 * Convierte un PNG fuente en asset de cuerpo para SnoreToast: recorta bordes,
 * rellena el rectángulo destino con `cover`, remapea gris legado y aplana alpha.
 */
export async function renderToastBodyImageFromSource(sourcePath: string): Promise<Buffer> {
  const width = TOAST_BODY_IMAGE_WIDTH_PX;
  const height = TOAST_BODY_IMAGE_HEIGHT_PX;
  const bg = TOAST_BODY_IMAGE_BACKGROUND;
  const { data, info } = await sharp(sourcePath)
    .trim({ threshold: 18 })
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  remapLegacyFlattenBackground(data, info.channels, TOAST_SHELL_REFERENCE_RGB, bg);

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .flatten({ background: bg })
    .png()
    .toBuffer();
}

/**
 * Conserva el arte del PNG (badges, expresión, etc.) y solo homogeneiza el exterior:
 * escala a 128×128 sin recortar el contenido (`contain`) y aplica disco circular con
 * fondo `#fefefe` fuera del círculo (corrige esquinas negras/blancas y marcos no redondos).
 */
export async function applyCircularToastFrame(sourcePath: string): Promise<Buffer> {
  const size = TOAST_BODY_IMAGE_WIDTH_PX;
  const bg = TOAST_BODY_IMAGE_BACKGROUND;
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.round(size * NOTIFICATION_IMAGE_CIRCLE_RADIUS_RATIO);
  const r2 = radius * radius;

  const { data, info } = await sharp(sourcePath)
    .resize(size, size, { fit: 'contain', background: bg })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * info.channels;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) {
        data[i] = bg.r;
        data[i + 1] = bg.g;
        data[i + 2] = bg.b;
        if (info.channels === 4) {
          data[i + 3] = 255;
        }
      }
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels: info.channels } })
    .flatten({ background: bg })
    .png()
    .toBuffer();
}
