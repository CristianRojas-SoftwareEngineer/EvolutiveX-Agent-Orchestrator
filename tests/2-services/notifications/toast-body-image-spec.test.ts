import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { resolve } from 'path';
import {
  TOAST_BODY_IMAGE_BACKGROUND,
  applyCircularToastFrame,
  blendOpaqueWhiteOverToastShell,
} from '../../../src/2-services/notifications/toast-body-image-spec.js';

const EVENTS_DIR = resolve(
  import.meta.dirname,
  '../../../assets/notifications/events',
);

describe('toast-body-image-spec', () => {
  it('mezcla opaca blanco 90 % sobre gris del toast → #fefefe', () => {
    expect(blendOpaqueWhiteOverToastShell(243, 0.9)).toBe(254);
    expect(TOAST_BODY_IMAGE_BACKGROUND).toEqual({ r: 254, g: 254, b: 254 });
  });

  it('applyCircularToastFrame pone #fefefe fuera del disco y conserva arte interior', async () => {
    const source = resolve(EVENTS_DIR, 'session-end.png');
    const buf = await applyCircularToastFrame(source);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);
    const corner = await sharp(buf).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect([corner[0], corner[1], corner[2]]).toEqual([254, 254, 254]);
    const center = await sharp(buf)
      .extract({ left: 64, top: 64, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const isFlatBg =
      center[0] === TOAST_BODY_IMAGE_BACKGROUND.r &&
      center[1] === TOAST_BODY_IMAGE_BACKGROUND.g &&
      center[2] === TOAST_BODY_IMAGE_BACKGROUND.b;
    expect(isFlatBg).toBe(false);
  });
});
