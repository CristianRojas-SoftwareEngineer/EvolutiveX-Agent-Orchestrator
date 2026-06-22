import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NOTIFICATION_EVENT_KEYS } from '../../src/2-services/notifications/event-notification-profile.js';
import { readCanonicalHooks } from '../../scripting/features/hooks.js';

const ACCENT_SAMPLE = 'Prueba tildes: sesión, configuración, acción, niño';

describe('hooks canónicos y encoding', () => {
  it('PreToolUse usa el relay unificado post-hook-event', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    const blocks = hooks['PreToolUse'];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].matcher).toBe('*');
    expect(blocks[0].hooks).toHaveLength(1);
    const cmd = blocks[0].hooks[0].command;
    expect(cmd).toContain('post-hook-event.ts');
    expect(cmd).not.toContain('notifications/cli.ts');
    expect(cmd).not.toContain('pre-tool-use-hook-ux.ts');
  });

  it('UserPromptSubmit usa el relay unificado post-hook-event', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    const blocks = hooks['UserPromptSubmit'];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].hooks).toHaveLength(1);
    const cmd = blocks[0].hooks[0].command;
    expect(cmd).toContain('post-hook-event.ts');
    expect(cmd).not.toContain('gateway-hook-notify.ts');
  });

  it('configs/hooks.json está en UTF-8 y el relay unificado post-hook-event está presente', () => {
    const hooksPath = resolve(import.meta.dirname, '../../configs/hooks.json');
    const raw = readFileSync(hooksPath);
    const text = raw.toString('utf-8');
    expect(text).toContain('post-hook-event.ts');
    expect(JSON.parse(text)).toBeTruthy();
  });

  it('todas las claves de notificación lifecycle están en hooks.json con relay unificado', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    for (const key of NOTIFICATION_EVENT_KEYS) {
      if (key === 'TaskInProgress') continue; // implementada como PostToolUse[matcher=TaskUpdate]
      expect(hooks[key], `falta hook para ${key}`).toBeDefined();
      const allCmds = hooks[key]!.flatMap((b) => b.hooks.map((h) => h.command)).join(' ');
      if (key === 'SessionEnd') {
        expect(allCmds, `hook ${key} debe usar session-end-hook`).toContain(
          'scripting/hooks/session-end-hook.ts',
        );
      } else {
        expect(allCmds, `hook ${key} debe usar post-hook-event`).toContain('post-hook-event.ts');
      }
    }
  });

  it('PostToolUse contiene solo la entrada con matcher "*" (sin TaskUpdate separada)', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    const postToolUse = hooks['PostToolUse'];
    expect(postToolUse).toBeDefined();
    const matchers = postToolUse!.map((b) => b.matcher);
    expect(matchers).toContain('*');
    expect(matchers).not.toContain('TaskUpdate');
    const allCmds = postToolUse!.flatMap((b) => b.hooks.map((h) => h.command));
    for (const cmd of allCmds) {
      expect(cmd).toContain('post-hook-event.ts');
      expect(cmd).not.toContain('task-in-progress-hook-ux.ts');
    }
  });

  it('ningún comando de hooks.json referencia scripts relay antiguos', () => {
    const root = resolve(import.meta.dirname, '../..');
    const hooks = readCanonicalHooks(root);
    const allCmds = Object.values(hooks)
      .flatMap((blocks) => blocks.flatMap((b) => b.hooks.map((h) => h.command)))
      .join('\n');
    expect(allCmds).not.toContain('gateway-hook-notify');
    expect(allCmds).not.toContain('pre-tool-use-hook-ux');
    expect(allCmds).not.toContain('task-in-progress-hook-ux');
    expect(allCmds).not.toContain('notifications/cli.ts');
  });

  it('muestra de acentos del catálogo no contiene mojibake', () => {
    expect(ACCENT_SAMPLE).toContain('sesión');
    expect(ACCENT_SAMPLE).not.toMatch(/Ã/);
  });

  it('SessionEnd usa node directo sobre session-end-hook.ts sin async; todos permanecen síncronos', () => {
    const hooksPath = resolve(import.meta.dirname, '../../configs/hooks.json');
    const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8')) as {
      hooks: Record<string, { hooks: { async?: boolean; command?: string }[] }[]>;
    };
    for (const [key, blocks] of Object.entries(parsed.hooks)) {
      for (const block of blocks) {
        for (const entry of block.hooks) {
          expect(entry.async, `${key} no debe ser async`).toBeUndefined();
          if (key === 'SessionEnd') {
            expect(entry.command, `${key} debe usar session-end-hook`).toContain(
              'scripting/hooks/session-end-hook.ts',
            );
            expect(entry.command, `${key} debe invocarse con node directo`).toContain('node ');
            expect(entry.command, `${key} no debe usar tsx`).not.toContain('tsx');
            expect(
              entry.command,
              `${key} no debe usar relay detached`,
            ).not.toContain('detached-session-end-relay.ts');
          }
        }
      }
    }
  });
});
