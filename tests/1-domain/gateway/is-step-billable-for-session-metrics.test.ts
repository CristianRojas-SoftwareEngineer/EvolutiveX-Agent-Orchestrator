import { describe, it, expect } from 'vitest';
import { isStepBillableForSessionMetrics } from '../../../src/1-domain/services/gateway/is-step-billable-for-session-metrics.js';

describe('isStepBillableForSessionMetrics', () => {
  it('tool_use no es contable', () => {
    expect(isStepBillableForSessionMetrics('tool_use')).toBe(false);
  });

  it('end_turn es contable', () => {
    expect(isStepBillableForSessionMetrics('end_turn')).toBe(true);
  });

  it('max_tokens es contable', () => {
    expect(isStepBillableForSessionMetrics('max_tokens')).toBe(true);
  });

  it('stopReason ausente o vacío es contable', () => {
    expect(isStepBillableForSessionMetrics(undefined)).toBe(true);
    expect(isStepBillableForSessionMetrics('')).toBe(true);
  });

  it('otros stop reasons no son contables', () => {
    expect(isStepBillableForSessionMetrics('pause_turn')).toBe(false);
  });
});
