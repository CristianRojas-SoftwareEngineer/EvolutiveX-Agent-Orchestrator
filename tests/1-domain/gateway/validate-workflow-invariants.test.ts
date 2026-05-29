import { describe, it, expect } from 'vitest';
import {
  isValidSubWorkflow,
  assertValidSubWorkflow,
} from '../../../src/1-domain/services/gateway/validate-workflow-invariants.js';

describe('isValidSubWorkflow', () => {
  it('workflow raíz sin parentWorkflowId es válido', () => {
    expect(isValidSubWorkflow({ kind: 'main', parentWorkflowId: undefined, parentToolUseId: undefined })).toBe(true);
  });

  it('sub-workflow con parentWorkflowId y parentToolUseId es válido', () => {
    expect(isValidSubWorkflow({ kind: 'subagent', parentWorkflowId: 'pw1', parentToolUseId: 'tu1' })).toBe(true);
  });

  it('sub-workflow sin parentWorkflowId es inválido', () => {
    expect(isValidSubWorkflow({ kind: 'subagent', parentWorkflowId: undefined, parentToolUseId: 'tu1' })).toBe(false);
  });

  it('sub-workflow sin parentToolUseId es inválido', () => {
    expect(isValidSubWorkflow({ kind: 'subagent', parentWorkflowId: 'pw1', parentToolUseId: undefined })).toBe(false);
  });

  it('sub-workflow con parentWorkflowId vacío es inválido', () => {
    expect(isValidSubWorkflow({ kind: 'subagent', parentWorkflowId: '', parentToolUseId: 'tu1' })).toBe(false);
  });
});

describe('assertValidSubWorkflow', () => {
  it('no lanza para workflow raíz válido', () => {
    expect(() =>
      assertValidSubWorkflow({ kind: 'main', parentWorkflowId: undefined, parentToolUseId: undefined }),
    ).not.toThrow();
  });

  it('no lanza para sub-workflow válido', () => {
    expect(() =>
      assertValidSubWorkflow({ kind: 'subagent', parentWorkflowId: 'pw1', parentToolUseId: 'tu1' }),
    ).not.toThrow();
  });

  it('lanza Error para sub-workflow sin parentWorkflowId', () => {
    expect(() =>
      assertValidSubWorkflow({ kind: 'subagent', parentWorkflowId: undefined, parentToolUseId: 'tu1' }),
    ).toThrow('Invariante G5');
  });
});
