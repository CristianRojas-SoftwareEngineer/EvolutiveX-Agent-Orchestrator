import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  EVENT_IMAGE_OVERLAY_BY_KEY,
  renderEventNotificationImage,
  renderNotificationImageBase,
  getAiAssistantPngPath,
} from '../../../src/2-services/notifications/event-notification-image.js';
import { NOTIFICATION_EVENT_KEYS } from '../../../src/2-services/notifications/event-notification-profile.js';
import { TOAST_BODY_IMAGE_BACKGROUND } from '../../../src/2-services/notifications/toast-body-image-spec.js';

describe('event-notification-image', () => {
  it('define overlay para los 11 eventos', () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      expect(EVENT_IMAGE_OVERLAY_BY_KEY[key]).toBeDefined();
    }
  });

  it('la base tiene esquinas con fondo del toast (#fefefe)', async () => {
    const base = await renderNotificationImageBase(getAiAssistantPngPath());
    const corner = await sharp(base).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const bg = TOAST_BODY_IMAGE_BACKGROUND;
    expect(corner[0]).toBe(bg.r);
    expect(corner[1]).toBe(bg.g);
    expect(corner[2]).toBe(bg.b);
  });

  it('genera PNG distintos por evento (no todos idénticos)', async () => {
    const path = getAiAssistantPngPath();
    const stop = await renderEventNotificationImage('Stop', path);
    const sessionEnd = await renderEventNotificationImage('SessionEnd', path);
    expect(stop.equals(sessionEnd)).toBe(false);
  });
});
