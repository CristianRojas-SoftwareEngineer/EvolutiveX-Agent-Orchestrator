import { describe, it, expect } from 'vitest';
import { matches } from '../../src/1-domain/services/event-pattern-match.service.js';

describe('event-pattern-match', () => {
  it('wildcard simple coincide con cualquier tipo', () => {
    expect(matches('*', 'workflow_start')).toBe(true);
  });

  it('prefix wildcard coincide con tipos que empiezan por el prefijo', () => {
    expect(matches('workflow_*', 'workflow_start')).toBe(true);
  });

  it('prefix wildcard no coincide con tipos que no empiezan por el prefijo', () => {
    expect(matches('workflow_*', 'step_request')).toBe(false);
  });

  it('suffix wildcard coincide con tipos que terminan por el sufijo', () => {
    expect(matches('*_result', 'tool_result')).toBe(true);
  });

  it('coincidencia exacta sin wildcard', () => {
    expect(matches('workflow_start', 'workflow_start')).toBe(true);
  });

  it('coincidencia exacta falla si no son iguales', () => {
    expect(matches('workflow_start', 'workflow_complete')).toBe(false);
  });
});
