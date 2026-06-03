// Generación homogénea de PNG por evento desde `ai-assistant.png`.
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { readdirSync, writeFileSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import {
  TOAST_BODY_IMAGE_BACKGROUND,
  TOAST_BODY_IMAGE_WIDTH_PX,
  NOTIFICATION_IMAGE_CIRCLE_RADIUS_RATIO,
  applyCircularToastFrame,
} from './toast-body-image-spec.js';
import {
  buildEventOverlaySvg,
  type EventImageOverlayId,
} from './event-image-overlays.js';
import { NOTIFICATION_EVENT_KEYS } from './event-notification-profile.js';
import { getProfileForEvent } from './event-notification-profile.js';
import { getRepoEventsDir } from './event-image-paths.js';

export const EVENT_IMAGE_OVERLAY_BY_KEY: Record<string, EventImageOverlayId> = {
  UserPromptSubmit: 'speech-lines',
  PreToolUse: 'speech-question',
  SubagentStart: 'dual-robot',
  SubagentStop: 'badge-check',
  Stop: 'badge-check',
  StopFailure: 'badge-warning',
  SessionStart: 'badge-play',
  SessionEnd: 'badge-power',
  PermissionRequest: 'badge-shield',
  TaskCreated: 'badge-plus',
  TaskCompleted: 'badge-task-done',
};

export function getAiAssistantPngPath(): string {
  return resolvePath(
    resolvePath(fileURLToPath(import.meta.url), '..'),
    '../../..',
    'assets/notifications/ai-assistant.png',
  );
}

/** Aplica máscara circular y fondo opaco del toast fuera del disco. */
export async function renderNotificationImageBase(
  aiAssistantPath: string,
): Promise<Buffer> {
  const size = TOAST_BODY_IMAGE_WIDTH_PX;
  const bg = TOAST_BODY_IMAGE_BACKGROUND;
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.round(size * NOTIFICATION_IMAGE_CIRCLE_RADIUS_RATIO);
  const r2 = radius * radius;

  const { data, info } = await sharp(aiAssistantPath)
    .resize(size, size, { fit: 'cover', position: 'centre' })
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

async function compositeDualRobot(base: Buffer): Promise<Buffer> {
  const size = TOAST_BODY_IMAGE_WIDTH_PX;
  const bg = TOAST_BODY_IMAGE_BACKGROUND;
  const small = await sharp(base).resize(Math.round(size * 0.52)).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 3, background: bg },
  })
    .composite([
      { input: small, left: 50, top: 38 },
      { input: base, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function applyOverlay(base: Buffer, overlayId: EventImageOverlayId): Promise<Buffer> {
  if (overlayId === 'dual-robot') {
    return compositeDualRobot(base);
  }
  const svg = buildEventOverlaySvg(overlayId);
  if (!svg) {
    return base;
  }
  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function renderEventNotificationImage(
  eventKey: string,
  aiAssistantPath = getAiAssistantPngPath(),
): Promise<Buffer> {
  const overlayId = EVENT_IMAGE_OVERLAY_BY_KEY[eventKey];
  if (!overlayId) {
    throw new Error(`Sin overlay de imagen para evento: ${eventKey}`);
  }
  const base = await renderNotificationImageBase(aiAssistantPath);
  return applyOverlay(base, overlayId);
}

/** Regenera los 11 PNG en `assets/notifications/events/` desde `ai-assistant.png`. */
export async function writeAllEventNotificationImages(
  aiAssistantPath = getAiAssistantPngPath(),
): Promise<string[]> {
  const written: string[] = [];
  const eventsDir = getRepoEventsDir();
  for (const eventKey of NOTIFICATION_EVENT_KEYS) {
    const profile = getProfileForEvent(eventKey);
    if (!profile) {
      continue;
    }
    const buffer = await renderEventNotificationImage(eventKey, aiAssistantPath);
    const dest = resolvePath(eventsDir, profile.image);
    writeFileSync(dest, buffer);
    written.push(dest);
  }
  return written;
}

/** Aplica `applyCircularToastFrame` a cada `*.png` en `assets/notifications/events/`. */
export async function reframeAllEventNotificationImages(): Promise<string[]> {
  const eventsDir = getRepoEventsDir();
  const written: string[] = [];
  for (const name of readdirSync(eventsDir)) {
    if (!name.toLowerCase().endsWith('.png')) {
      continue;
    }
    const path = join(eventsDir, name);
    const buffer = await applyCircularToastFrame(path);
    writeFileSync(path, buffer);
    written.push(path);
  }
  return written;
}
