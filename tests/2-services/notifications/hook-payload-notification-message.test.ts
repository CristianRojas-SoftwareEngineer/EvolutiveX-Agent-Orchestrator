import { describe, it, expect } from 'vitest';
import {
  formatPermissionRequestMessage,
  formatPreToolUseAskMessage,
  formatStopFailureMessage,
  formatStopMessage,
  formatUserPromptSubmitMessage,
  resolveHookNotificationMessage,
} from '../../../src/2-services/notifications/hook-payload-notification-message.js';

describe('hook-payload-notification-message', () => {
  it('StopFailure con rate_limit y last_assistant_message', () => {
    const msg = formatStopFailureMessage({
      error: 'rate_limit',
      last_assistant_message: 'Voy a ejecutar los tests',
    });
    expect(msg).toContain('Límite de tasa (API)');
    expect(msg).toContain('Voy a ejecutar los tests');
  });

  it('StopFailure con error desconocido', () => {
    const msg = formatStopFailureMessage({ error: 'custom_code' });
    expect(msg).toContain('custom_code');
  });

  it('PermissionRequest con tool_name y command', () => {
    const msg = formatPermissionRequestMessage({
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    expect(msg).toContain('Permiso para: Bash');
    expect(msg).toContain('npm test');
  });

  it('PermissionRequest sin tool_input', () => {
    expect(formatPermissionRequestMessage({ tool_name: 'Read' })).toBe('Permiso para: Read');
  });

  it('PreToolUse con dos preguntas', () => {
    const msg = formatPreToolUseAskMessage({
      tool_input: {
        questions: [{ question: '¿Usamos Redis?' }, { header: 'Otro' }],
      },
    });
    expect(msg).toContain('2 preguntas pendientes');
    expect(msg).toContain('¿Usamos Redis?');
  });

  it('PreToolUse conserva tildes en el preview de la pregunta', () => {
    const question = 'Prueba: sesión, configuración, acción';
    const msg = formatPreToolUseAskMessage({
      tool_input: { questions: [{ question }] },
    });
    expect(msg).toContain(question);
  });

  it('PreToolUse sin questions devuelve null', () => {
    expect(formatPreToolUseAskMessage({ tool_input: {} })).toBeNull();
  });

  it('UserPromptSubmit con prompt', () => {
    const msg = formatUserPromptSubmitMessage({ prompt: 'Refactoriza el módulo' });
    expect(msg).toContain('Refactoriza');
    expect(msg).toContain('módulo');
  });

  it('UserPromptSubmit conserva tildes y eñes en el preview', () => {
    const prompt = 'Prueba: sesión, configuración, acción, niño';
    const msg = formatUserPromptSubmitMessage({ prompt });
    expect(msg).toBe(prompt);
  });

  it('UserPromptSubmit sin prompt devuelve null', () => {
    expect(formatUserPromptSubmitMessage({})).toBeNull();
  });

  it('Stop con last_assistant_message', () => {
    expect(formatStopMessage({ last_assistant_message: 'Listo el refactor' })).toContain('Listo');
  });

  it('Stop sin last_assistant_message devuelve null', () => {
    expect(formatStopMessage({})).toBeNull();
  });

  it('resolveHookNotificationMessage devuelve null para SessionStart', () => {
    expect(resolveHookNotificationMessage('SessionStart', {})).toBeNull();
  });
});
