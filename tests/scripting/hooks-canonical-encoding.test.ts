import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NOTIFICATION_EVENT_KEYS } from '../../src/2-services/notifications/event-notification-profile.js';
import { readCanonicalHooks } from '../../scripting/features/hooks.js';

const ACCENT_SAMPLE = 'Prueba tildes: sesión, configuración, acción, niño';

describe('hooks canónicos y encoding', () => {
  it('PreToolUse usa relay único pre-tool-use-hook-ux (POST + toast AskUserQuestion)', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    const blocks = hooks['PreToolUse'];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].matcher).toBe('*');
    expect(blocks[0].hooks).toHaveLength(1);
    const cmd = blocks[0].hooks[0].command;
    expect(cmd).toContain('pre-tool-use-hook-ux.ts');
    expect(cmd).not.toContain('notifications/cli.ts');
  });

  it('UserPromptSubmit usa relay único gateway-hook-notify (sin hooks paralelos)', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    const blocks = hooks['UserPromptSubmit'];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].hooks).toHaveLength(1);
    const cmd = blocks[0].hooks[0].command;
    expect(cmd).toContain('gateway-hook-notify.ts');
    expect(cmd).toContain('UserPromptSubmit');
    expect(cmd).not.toContain('post-hook-event.ts');
  });

  it('configs/hooks.json está en UTF-8 y el catálogo conserva tildes', () => {
    const hooksPath = resolve(import.meta.dirname, '../../configs/hooks.json');
    const raw = readFileSync(hooksPath);
    const text = raw.toString('utf-8');
    expect(text).toContain('Sesión iniciada');
    expect(JSON.parse(text)).toBeTruthy();
  });

  it('todas las claves de notificación están en hooks.json', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    for (const key of NOTIFICATION_EVENT_KEYS) {
      expect(hooks[key], `falta hook para ${key}`).toBeDefined();
    }
  });

  it('muestra de acentos del catálogo no contiene mojibake', () => {
    expect(ACCENT_SAMPLE).toContain('sesión');
    expect(ACCENT_SAMPLE).not.toMatch(/Ã/);
  });
});
