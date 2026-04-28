import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionStoreService } from '../../src/2-services/session-store.service.js';
import { ActiveTurn } from '../../src/1-domain/types/audit.types.js';

function makeTurn(overrides: Partial<ActiveTurn> = {}): ActiveTurn {
  return {
    interactionDir: '/tmp/sessions/s1/interactions/000001_req-1',
    interactionType: 'agentic-turn',
    stepCount: 1,
    requestSequence: 1,
    startedAt: Date.now(),
    requestBodyOmitted: false,
    requestBodyBytes: 100,
    stepsMeta: [],
    sessionId: 's1',
    pendingAgentToolUses: [],
    pendingBuiltinToolUses: [],
    ...overrides,
  };
}

describe('SessionStoreService — turnRegistry', () => {
  let tmpDir: string;
  let store: SessionStoreService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sstore-'));
    store = new SessionStoreService(tmpDir);
  });

  it('registerTurn registra el turno en el registry por interactionDir', async () => {
    const turn = makeTurn();
    store.registerTurn(turn);

    expect(await store.getTurnByDir(turn.interactionDir)).toBe(turn);
  });

  it('dos llamadas registerTurn coexisten sin interferirse', async () => {
    const turnA = makeTurn({ interactionDir: '/tmp/a' });
    const turnB = makeTurn({ interactionDir: '/tmp/b' });
    store.registerTurn(turnA);
    store.registerTurn(turnB);

    expect(store.getTurnByDirSync('/tmp/a')).toBe(turnA);
    expect(store.getTurnByDirSync('/tmp/b')).toBe(turnB);
  });

  it('closeTurn elimina del turnRegistry', async () => {
    const turn = makeTurn();
    store.registerTurn(turn);

    store.closeTurn(turn.interactionDir);

    expect(await store.getTurnByDir(turn.interactionDir)).toBeNull();
  });

  it('closeTurn no afecta a otros turnos registrados', async () => {
    const turnA = makeTurn({ interactionDir: '/tmp/dir-a' });
    const turnB = makeTurn({ interactionDir: '/tmp/dir-b' });
    store.registerTurn(turnA);
    store.registerTurn(turnB);

    store.closeTurn('/tmp/dir-b');

    expect(store.getTurnByDirSync('/tmp/dir-a')).toBe(turnA);
    expect(store.getTurnByDirSync('/tmp/dir-b')).toBeNull();
  });

  it('pushStepMetaByDir acumula en el turno correcto', async () => {
    const turnA = makeTurn({ interactionDir: '/tmp/a' });
    const turnB = makeTurn({ interactionDir: '/tmp/b' });
    store.registerTurn(turnA);
    store.registerTurn(turnB);

    await store.pushStepMetaByDir('/tmp/a', { stepIndex: 1, sse: true, statusCode: 200 });
    await store.pushStepMetaByDir('/tmp/b', { stepIndex: 1, sse: false, statusCode: 200 });

    expect(turnA.stepsMeta).toHaveLength(1);
    expect(turnA.stepsMeta[0].sse).toBe(true);
    expect(turnB.stepsMeta).toHaveLength(1);
    expect(turnB.stepsMeta[0].sse).toBe(false);
  });

  it('incrementStepCountByDir incrementa y retorna stepCount del turno por dir', async () => {
    const turn = makeTurn({ interactionDir: '/tmp/inc', stepCount: 1 });
    store.registerTurn(turn);

    expect(store.incrementStepCountByDir('/tmp/inc')).toBe(2);
    expect(store.incrementStepCountByDir('/tmp/inc')).toBe(3);
    expect(turn.stepCount).toBe(3);
  });

  it('incrementStepCountByDir retorna 1 si el dir no existe', () => {
    expect(store.incrementStepCountByDir('/tmp/nonexistent')).toBe(1);
  });

  it('registerToolUseId + getTurnByToolUseId correlaciona correctamente', () => {
    const turn = makeTurn({ interactionDir: '/tmp/t1' });
    store.registerTurn(turn);
    store.registerToolUseId('tool-abc', '/tmp/t1');

    expect(store.getTurnByToolUseId('tool-abc')).toBe(turn);
  });

  it('getTurnByToolUseId retorna null para ID no registrado', () => {
    expect(store.getTurnByToolUseId('nonexistent')).toBeNull();
  });

  it('múltiples tool_use_id apuntando al mismo turno', () => {
    const turn = makeTurn({ interactionDir: '/tmp/t1' });
    store.registerTurn(turn);
    store.registerToolUseId('id-1', '/tmp/t1');
    store.registerToolUseId('id-2', '/tmp/t1');
    store.registerToolUseId('id-3', '/tmp/t1');

    expect(store.getTurnByToolUseId('id-1')).toBe(turn);
    expect(store.getTurnByToolUseId('id-2')).toBe(turn);
    expect(store.getTurnByToolUseId('id-3')).toBe(turn);
  });

  it('closeTurn limpia los tool_use_id del turno cerrado', () => {
    const turn = makeTurn({ interactionDir: '/tmp/t1' });
    store.registerTurn(turn);
    store.registerToolUseId('id-1', '/tmp/t1');
    store.registerToolUseId('id-2', '/tmp/t1');

    store.closeTurn('/tmp/t1');

    expect(store.getTurnByToolUseId('id-1')).toBeNull();
    expect(store.getTurnByToolUseId('id-2')).toBeNull();
  });

  it('closeTurn no limpia tool_use_id de otros turnos', () => {
    const turnA = makeTurn({ interactionDir: '/tmp/a' });
    const turnB = makeTurn({ interactionDir: '/tmp/b' });
    store.registerTurn(turnA);
    store.registerTurn(turnB);
    store.registerToolUseId('id-a', '/tmp/a');
    store.registerToolUseId('id-b', '/tmp/b');

    store.closeTurn('/tmp/a');

    expect(store.getTurnByToolUseId('id-a')).toBeNull();
    expect(store.getTurnByToolUseId('id-b')).toBe(turnB);
  });

  it('concurrent side-request no interfiere con turno agentic registrado', () => {
    const mainTurn = makeTurn({ interactionDir: '/tmp/main' });
    const sideTurn = makeTurn({ interactionDir: '/tmp/side', interactionType: 'side-request' });

    store.registerTurn(mainTurn);
    store.registerTurn(sideTurn);

    // Ambos accesibles por dir
    expect(store.getTurnByDirSync('/tmp/main')).toBe(mainTurn);
    expect(store.getTurnByDirSync('/tmp/side')).toBe(sideTurn);

    // Cerrar side-request no afecta al turno principal
    store.closeTurn('/tmp/side');
    expect(store.getTurnByDir('/tmp/main')).resolves.toBe(mainTurn);
    expect(store.getTurnByDir('/tmp/side')).resolves.toBeNull();
  });
});

describe('SessionStoreService — pending Agent tool_uses', () => {
  let tmpDir: string;
  let store: SessionStoreService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sstore-pending-'));
    store = new SessionStoreService(tmpDir);
  });

  it('registerPendingAgentToolUse + findTurnWithPendingAgents (caso unívoco)', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-aaa', 'general-purpose');

    const found = store.findTurnWithPendingAgents('sA');
    expect(found).not.toBeNull();
    expect(found!.turn).toBe(turn);
    expect(found!.pendings).toHaveLength(1);
    expect(found!.pendings[0]).toEqual({
      stepIndex: 1,
      toolUseId: 'tool-aaa',
      subagentType: 'general-purpose',
    });
  });

  it('findTurnWithPendingAgents devuelve null cuando no hay pendings', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    expect(store.findTurnWithPendingAgents('sA')).toBeNull();
  });

  it('findTurnWithPendingAgents excluye turns con interactionType !== agentic-turn', () => {
    const sideTurn = makeTurn({
      interactionDir: '/tmp/side',
      sessionId: 'sA',
      interactionType: 'side-request',
    });
    const preflightTurn = makeTurn({
      interactionDir: '/tmp/pre',
      sessionId: 'sA',
      interactionType: 'client-preflight',
    });
    store.registerTurn(sideTurn);
    store.registerTurn(preflightTurn);
    store.registerPendingAgentToolUse('/tmp/side', 1, 'tool-x');
    store.registerPendingAgentToolUse('/tmp/pre', 1, 'tool-y');

    expect(store.findTurnWithPendingAgents('sA')).toBeNull();
  });

  it('findTurnWithPendingAgents excluye turns con parentContext (refuerza profundidad ≤ 2)', () => {
    const subagentTurn = makeTurn({
      interactionDir: '/tmp/sub',
      sessionId: 'sA',
      parentContext: {
        parentInteractionDir: '/tmp/parent',
        parentStepIndex: 1,
        triggeringToolUseId: 'tool-a',
      },
    });
    store.registerTurn(subagentTurn);
    store.registerPendingAgentToolUse('/tmp/sub', 1, 'nested-agent');

    // Aunque el subagente tenga un Agent pendiente, no puede ser padre de nadie.
    expect(store.findTurnWithPendingAgents('sA')).toBeNull();
  });

  it('findTurnWithPendingAgents devuelve copia del array (mutación local no afecta al turn)', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-1');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-2');

    const found = store.findTurnWithPendingAgents('sA');
    expect(found!.pendings).toHaveLength(2);
    found!.pendings.pop();
    expect(turn.pendingAgentToolUses).toHaveLength(2);
  });

  it('registerPendingAgentToolUse es idempotente y enriquece subagentType si llega después', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-aaa');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-aaa', 'Explore');

    expect(turn.pendingAgentToolUses).toHaveLength(1);
    expect(turn.pendingAgentToolUses[0].subagentType).toBe('Explore');
  });

  it('consumePendingAgentToolUse elimina la entrada y deja las demás intactas', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-1');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-2');

    store.consumePendingAgentToolUse('/tmp/p1', 'tool-1');
    expect(turn.pendingAgentToolUses).toHaveLength(1);
    expect(turn.pendingAgentToolUses[0].toolUseId).toBe('tool-2');
  });

  it('consumePendingAgentToolUse es idempotente sobre entrada inexistente', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    store.consumePendingAgentToolUse('/tmp/p1', 'no-existe');
    expect(turn.pendingAgentToolUses).toHaveLength(0);
  });

  it('closeTurn limpia sessionToActiveTurns y borra la clave si queda vacío', () => {
    const turn = makeTurn({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerTurn(turn);
    expect(store.findTurnWithPendingAgents('sA')).toBeNull(); // no pendings, pero el set existe

    // Tras cerrar, la sesión queda sin turns activos y find devuelve null
    store.closeTurn('/tmp/p1');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-x'); // no-op (turn ya cerrado)
    expect(store.findTurnWithPendingAgents('sA')).toBeNull();
  });

  it('sesiones distintas no interfieren', () => {
    const turnA = makeTurn({ interactionDir: '/tmp/a', sessionId: 'sA' });
    const turnB = makeTurn({ interactionDir: '/tmp/b', sessionId: 'sB' });
    store.registerTurn(turnA);
    store.registerTurn(turnB);
    store.registerPendingAgentToolUse('/tmp/a', 1, 'tool-a');

    expect(store.findTurnWithPendingAgents('sA')).not.toBeNull();
    expect(store.findTurnWithPendingAgents('sB')).toBeNull();
    expect(store.findTurnWithPendingAgents('sX')).toBeNull();
  });

  it('findStaleTurnsAwaitingContinuation retorna turnos stale con awaitingContinuation', async () => {
    const staleTurn = makeTurn({
      interactionDir: '/tmp/stale',
      awaitingContinuation: true,
      awaitingSince: Date.now() - 120_000, // 2 min ago
    });
    const freshTurn = makeTurn({
      interactionDir: '/tmp/fresh',
      awaitingContinuation: true,
      awaitingSince: Date.now() - 5_000, // 5 sec ago
    });
    const normalTurn = makeTurn({ interactionDir: '/tmp/normal' });

    store.registerTurn(staleTurn);
    store.registerTurn(freshTurn);
    store.registerTurn(normalTurn);

    const stale = store.findStaleTurnsAwaitingContinuation('s1', 60_000);
    expect(stale).toHaveLength(1);
    expect(stale[0].interactionDir).toBe('/tmp/stale');
  });

  it('findStaleTurnsAwaitingContinuation retorna vacío si no hay stale', async () => {
    const turn = makeTurn({ awaitingContinuation: false });
    store.registerTurn(turn);
    expect(store.findStaleTurnsAwaitingContinuation('s1', 60_000)).toHaveLength(0);
  });

  it('getAllOpenTurns retorna todos los turnos en el registry', async () => {
    const t1 = makeTurn({ interactionDir: '/tmp/t1' });
    const t2 = makeTurn({ interactionDir: '/tmp/t2', sessionId: 's2' });
    store.registerTurn(t1);
    store.registerTurn(t2);
    const all = store.getAllOpenTurns();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.interactionDir).sort()).toEqual(['/tmp/t1', '/tmp/t2']);
  });

  it('getAllOpenTurns retorna vacío si no hay turnos', async () => {
    expect(store.getAllOpenTurns()).toHaveLength(0);
  });

  it('withSessionLock serializa ejecuciones concurrentes en la misma sesión', async () => {
    const observed: string[] = [];
    const slow = (label: string, ms: number) => async () => {
      observed.push(`start:${label}`);
      await new Promise((r) => setTimeout(r, ms));
      observed.push(`end:${label}`);
      return label;
    };

    const [a, b] = await Promise.all([
      store.withSessionLock('sX', slow('A', 30)),
      store.withSessionLock('sX', slow('B', 5)),
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');
    // Si está serializado, B sólo arranca tras end:A.
    expect(observed).toEqual(['start:A', 'end:A', 'start:B', 'end:B']);
  });

  it('registerWebFetchToolUseUrl + getWebFetchUrlByToolUseId retorna correlación guardada', () => {
    store.registerWebFetchToolUseUrl('toolu_fetch_1', 's1', 'https://example.com');
    expect(store.getWebFetchUrlByToolUseId('toolu_fetch_1')).toEqual({
      sessionId: 's1',
      url: 'https://example.com',
    });
  });

  it('resolveWebFetchStep retorna null si no existe entrada', () => {
    expect(store.resolveWebFetchStep('s1', 'https://none.example')).toBeNull();
  });

  it('registerWebFetchStepResolution + resolveWebFetchStep funciona por clave sessionId/url', () => {
    store.registerWebFetchStepResolution({
      stepDir: '/tmp/sessions/s1/interactions/000001_req/steps/002',
      sessionId: 's1',
      url: 'https://example.com',
      completedAt: 123,
    });
    const found = store.resolveWebFetchStep('s1', 'https://example.com');
    expect(found).not.toBeNull();
    expect(found!.stepDir).toContain('steps/002');
    expect(found!.completedAt).toBe(123);
  });

  it('onceWebFetchStepResolved resuelve inmediato si ya está cacheado', async () => {
    store.registerWebFetchStepResolution({
      stepDir: '/tmp/sessions/s1/interactions/000001_req/steps/003',
      sessionId: 's1',
      url: 'https://immediate.example',
      completedAt: 456,
    });
    const found = await store.onceWebFetchStepResolved('s1', 'https://immediate.example', 1000);
    expect(found).not.toBeNull();
    expect(found!.completedAt).toBe(456);
  });

  it('onceWebFetchStepResolved resuelve por evento antes del timeout', async () => {
    const wait = store.onceWebFetchStepResolved('s1', 'https://event.example', 1000);
    setTimeout(() => {
      store.registerWebFetchStepResolution({
        stepDir: '/tmp/sessions/s1/interactions/000001_req/steps/004',
        sessionId: 's1',
        url: 'https://event.example',
        completedAt: 789,
      });
    }, 20);

    const found = await wait;
    expect(found).not.toBeNull();
    expect(found!.completedAt).toBe(789);
  });

  it('onceWebFetchStepResolved devuelve null por timeout', async () => {
    const found = await store.onceWebFetchStepResolved('s1', 'https://timeout.example', 25);
    expect(found).toBeNull();
  });

  it('closeTurn limpia entradas webfetch index asociadas al interactionDir cerrado', () => {
    const interactionDir = '/tmp/sessions/s1/interactions/000010_req';
    const turn = makeTurn({ interactionDir, sessionId: 's1' });
    store.registerTurn(turn);

    store.registerWebFetchStepResolution({
      sessionId: 's1',
      url: 'https://example.com/a',
      stepDir: '/tmp/sessions/s1/interactions/000010_req/steps/002',
      completedAt: 111,
    });
    store.registerWebFetchStepResolution({
      sessionId: 's1',
      url: 'https://example.com/b',
      stepDir: '/tmp/sessions/s1/interactions/000011_req/steps/001',
      completedAt: 222,
    });

    store.closeTurn(interactionDir);

    expect(store.resolveWebFetchStep('s1', 'https://example.com/a')).toBeNull();
    expect(store.resolveWebFetchStep('s1', 'https://example.com/b')).not.toBeNull();
  });
});
