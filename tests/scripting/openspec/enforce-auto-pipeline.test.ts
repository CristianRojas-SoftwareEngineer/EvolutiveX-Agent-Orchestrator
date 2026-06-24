import { describe, expect, it } from 'vitest';

import {
    DEFAULT_LOOP_GUARD_THRESHOLD,
    type AutoPipelineSentinel,
    type DecisionInput,
    decideAutoPipeline,
} from '../../../scripting/openspec/enforce-auto-pipeline.mjs';

// Centinela base reutilizable en los tests
function makeSentinel(overrides: Partial<AutoPipelineSentinel> = {}): AutoPipelineSentinel {
    return {
        change: 'c00081-auto-pipeline-backstop',
        mode: 'auto',
        phase: 'implementer',
        stage: 7,
        lastProgressKey: 'implementer#7',
        startedAt: '2026-06-24T00:00:00.000Z',
        stuckCount: 0,
        ...overrides,
    };
}

function makeInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
    return {
        sentinel: makeSentinel(),
        haltPresent: false,
        isArchived: false,
        stopHookActive: false,
        threshold: DEFAULT_LOOP_GUARD_THRESHOLD,
        ...overrides,
    };
}

// ─── Rama (a): sin sentinel ────────────────────────────────────────────────────

describe('rama (a) — sin sentinel', () => {
    it('retorna allow con efecto none cuando no hay sentinel', () => {
        const result = decideAutoPipeline(makeInput({ sentinel: null }));
        expect(result.block).toBe(false);
        expect(result.effect).toBe('none');
    });
});

// ─── Rama (b): halt presente ───────────────────────────────────────────────────

describe('rama (b) — halt presente', () => {
    it('retorna allow con efecto none cuando el halt existe', () => {
        const result = decideAutoPipeline(makeInput({ haltPresent: true }));
        expect(result.block).toBe(false);
        expect(result.effect).toBe('none');
    });

    it('halt presente tiene precedencia sobre un change no archivado', () => {
        const result = decideAutoPipeline(makeInput({ haltPresent: true, isArchived: false }));
        expect(result.block).toBe(false);
        expect(result.effect).toBe('none');
    });
});

// ─── Rama (c): change archivado ────────────────────────────────────────────────

describe('rama (c) — change archivado', () => {
    it('retorna allow + deleteSentinel para change bajo archive sin prefijo de fecha', () => {
        const result = decideAutoPipeline(makeInput({ isArchived: true }));
        expect(result.block).toBe(false);
        expect(result.effect).toBe('deleteSentinel');
    });

    it('retorna allow + deleteSentinel para change con prefijo YYYY-MM-DD--<change>', () => {
        // isArchived ya fue evaluado externamente (la función pura solo recibe el booleano)
        const result = decideAutoPipeline(makeInput({ isArchived: true }));
        expect(result.block).toBe(false);
        expect(result.effect).toBe('deleteSentinel');
    });
});

// ─── Rama (d): loop-guard ──────────────────────────────────────────────────────

describe('rama (d) — loop-guard', () => {
    it('bajo umbral: stopHookActive + misma clave incrementa stuckCount y bloquea', () => {
        const sentinel = makeSentinel({ stuckCount: 0, lastProgressKey: 'implementer#7' });
        const result = decideAutoPipeline(
            makeInput({ sentinel, stopHookActive: true }),
        );
        // nextStuck = 0 + 1 = 1 → no supera threshold(3), bloquea con persistSentinel
        expect(result.block).toBe(true);
        expect(result.effect).toBe('persistSentinel');
        expect(result.nextSentinel?.stuckCount).toBe(1);
        expect(result.nextSentinel?.lastProgressKey).toBe('implementer#7');
    });

    it('sobre umbral: nextStuck > threshold libera el turno con writeHalt', () => {
        // stuckCount ya en threshold para que nextStuck = threshold + 1
        const sentinel = makeSentinel({
            stuckCount: DEFAULT_LOOP_GUARD_THRESHOLD,
            lastProgressKey: 'implementer#7',
        });
        const result = decideAutoPipeline(
            makeInput({ sentinel, stopHookActive: true }),
        );
        expect(result.block).toBe(false);
        expect(result.effect).toBe('writeHalt');
    });

    it('reinicia stuckCount cuando la phase avanza (stage constante)', () => {
        // lastProgressKey era 'planner#6', ahora phase='implementer', stage=6
        const sentinel = makeSentinel({
            phase: 'implementer',
            stage: 6,
            lastProgressKey: 'planner#6',
            stuckCount: 2,
        });
        const result = decideAutoPipeline(
            makeInput({ sentinel, stopHookActive: true }),
        );
        // currentProgressKey = 'implementer#6' ≠ 'planner#6' → stageStalled=false → nextStuck=0
        expect(result.block).toBe(true);
        expect(result.nextSentinel?.stuckCount).toBe(0);
        expect(result.nextSentinel?.lastProgressKey).toBe('implementer#6');
    });

    it('reinicia stuckCount cuando el stage avanza (phase constante)', () => {
        // lastProgressKey era 'implementer#7', ahora stage=8
        const sentinel = makeSentinel({
            phase: 'implementer',
            stage: 8,
            lastProgressKey: 'implementer#7',
            stuckCount: 2,
        });
        const result = decideAutoPipeline(
            makeInput({ sentinel, stopHookActive: true }),
        );
        // currentProgressKey = 'implementer#8' ≠ 'implementer#7' → nextStuck=0
        expect(result.block).toBe(true);
        expect(result.nextSentinel?.stuckCount).toBe(0);
        expect(result.nextSentinel?.lastProgressKey).toBe('implementer#8');
    });

    it('congelamiento simultáneo de phase Y stage: stuckCount se incrementa', () => {
        const sentinel = makeSentinel({
            phase: 'implementer',
            stage: 7,
            lastProgressKey: 'implementer#7',
            stuckCount: 1,
        });
        const result = decideAutoPipeline(
            makeInput({ sentinel, stopHookActive: true }),
        );
        expect(result.block).toBe(true);
        expect(result.nextSentinel?.stuckCount).toBe(2);
    });

    it('sin stopHookActive no acumula stuckCount aunque la clave sea la misma', () => {
        const sentinel = makeSentinel({
            stuckCount: 0,
            lastProgressKey: 'implementer#7',
        });
        // stopHookActive=false → stageStalled=false → nextStuck=0
        const result = decideAutoPipeline(
            makeInput({ sentinel, stopHookActive: false }),
        );
        expect(result.block).toBe(true);
        expect(result.nextSentinel?.stuckCount).toBe(0);
    });
});

// ─── Rama (e): pipeline en vuelo ───────────────────────────────────────────────

describe('rama (e) — pipeline en vuelo', () => {
    it('bloquea con reason que nombra la fase activa', () => {
        const result = decideAutoPipeline(makeInput());
        expect(result.block).toBe(true);
        expect(result.reason).toContain('implementer');
        expect(result.reason).toContain('c00081-auto-pipeline-backstop');
    });

    it('persiste lastProgressKey con clave compuesta phase#stage', () => {
        const sentinel = makeSentinel({ phase: 'closer', stage: 10, lastProgressKey: 'closer#10' });
        const result = decideAutoPipeline(makeInput({ sentinel }));
        expect(result.effect).toBe('persistSentinel');
        expect(result.nextSentinel?.lastProgressKey).toBe('closer#10');
    });
});
