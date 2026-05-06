import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionStoreService } from '../../src/2-services/session-store.service.js';
import { ActiveInteraction } from '../../src/1-domain/types/audit.types.js';

function makeInteraction(overrides: Partial<ActiveInteraction> = {}): ActiveInteraction {
  return {
    interactionDir: '/tmp/sessions/s1/interactions/000001_req-1',
    interactionType: 'agentic',
    stepCount: 1,
    requestSequence: 1,
    startedAt: Date.now(),
    requestBodyOmitted: false,
    requestBodyBytes: 100,
    stepsMeta: [],
    sessionId: 's1',
    pendingAgentToolUses: [],
    pendingWebSearchToolUses: [],
    pendingWebFetchToolUses: [],
    resolvedInternalTools: [],
    ...overrides,
  };
}

describe('SessionStoreService — interactionRegistry', () => {
  let tmpDir: string;
  let store: SessionStoreService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sstore-'));
    store = new SessionStoreService(tmpDir);
  });

  it('registerInteraction registra el interacción en el registry por interactionDir', async () => {
    const interaction = makeInteraction();
    store.registerInteraction(interaction);

    expect(await store.getInteractionByDir(interaction.interactionDir)).toBe(interaction);
  });

  it('dos llamadas registerInteraction coexisten sin interferirse', async () => {
    const interactionA = makeInteraction({ interactionDir: '/tmp/a' });
    const interactionB = makeInteraction({ interactionDir: '/tmp/b' });
    store.registerInteraction(interactionA);
    store.registerInteraction(interactionB);

    expect(store.getInteractionByDirSync('/tmp/a')).toBe(interactionA);
    expect(store.getInteractionByDirSync('/tmp/b')).toBe(interactionB);
  });

  it('closeInteraction elimina del interactionRegistry', async () => {
    const interaction = makeInteraction();
    store.registerInteraction(interaction);

    store.closeInteraction(interaction.interactionDir);

    expect(await store.getInteractionByDir(interaction.interactionDir)).toBeNull();
  });

  it('closeInteraction no afecta a otros interacciones registrados', async () => {
    const interactionA = makeInteraction({ interactionDir: '/tmp/dir-a' });
    const interactionB = makeInteraction({ interactionDir: '/tmp/dir-b' });
    store.registerInteraction(interactionA);
    store.registerInteraction(interactionB);

    store.closeInteraction('/tmp/dir-b');

    expect(store.getInteractionByDirSync('/tmp/dir-a')).toBe(interactionA);
    expect(store.getInteractionByDirSync('/tmp/dir-b')).toBeNull();
  });

  it('pushStepMetaByDir acumula en el interacción correcto', async () => {
    const interactionA = makeInteraction({ interactionDir: '/tmp/a' });
    const interactionB = makeInteraction({ interactionDir: '/tmp/b' });
    store.registerInteraction(interactionA);
    store.registerInteraction(interactionB);

    await store.pushStepMetaByDir('/tmp/a', { stepIndex: 1, sse: true, statusCode: 200 });
    await store.pushStepMetaByDir('/tmp/b', { stepIndex: 1, sse: false, statusCode: 200 });

    expect(interactionA.stepsMeta).toHaveLength(1);
    expect(interactionA.stepsMeta[0].sse).toBe(true);
    expect(interactionB.stepsMeta).toHaveLength(1);
    expect(interactionB.stepsMeta[0].sse).toBe(false);
  });

  it('incrementStepCountByDir incrementa y retorna stepCount del interacción por dir', async () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/inc', stepCount: 1 });
    store.registerInteraction(interaction);

    expect(store.incrementStepCountByDir('/tmp/inc')).toBe(2);
    expect(store.incrementStepCountByDir('/tmp/inc')).toBe(3);
    expect(interaction.stepCount).toBe(3);
  });

  it('incrementStepCountByDir retorna 1 si el dir no existe', () => {
    expect(store.incrementStepCountByDir('/tmp/nonexistent')).toBe(1);
  });

  it('registerToolUseId + getInteractionByToolUseId correlaciona correctamente', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/t1' });
    store.registerInteraction(interaction);
    store.registerToolUseId('tool-abc', '/tmp/t1');

    expect(store.getInteractionByToolUseId('tool-abc')).toBe(interaction);
  });

  it('getInteractionByToolUseId retorna null para ID no registrado', () => {
    expect(store.getInteractionByToolUseId('nonexistent')).toBeNull();
  });

  it('múltiples tool_use_id apuntando al mismo interacción', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/t1' });
    store.registerInteraction(interaction);
    store.registerToolUseId('id-1', '/tmp/t1');
    store.registerToolUseId('id-2', '/tmp/t1');
    store.registerToolUseId('id-3', '/tmp/t1');

    expect(store.getInteractionByToolUseId('id-1')).toBe(interaction);
    expect(store.getInteractionByToolUseId('id-2')).toBe(interaction);
    expect(store.getInteractionByToolUseId('id-3')).toBe(interaction);
  });

  it('closeInteraction limpia los tool_use_id del interacción cerrado', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/t1' });
    store.registerInteraction(interaction);
    store.registerToolUseId('id-1', '/tmp/t1');
    store.registerToolUseId('id-2', '/tmp/t1');

    store.closeInteraction('/tmp/t1');

    expect(store.getInteractionByToolUseId('id-1')).toBeNull();
    expect(store.getInteractionByToolUseId('id-2')).toBeNull();
  });

  it('closeInteraction no limpia tool_use_id de otros interacciones', () => {
    const interactionA = makeInteraction({ interactionDir: '/tmp/a' });
    const interactionB = makeInteraction({ interactionDir: '/tmp/b' });
    store.registerInteraction(interactionA);
    store.registerInteraction(interactionB);
    store.registerToolUseId('id-a', '/tmp/a');
    store.registerToolUseId('id-b', '/tmp/b');

    store.closeInteraction('/tmp/a');

    expect(store.getInteractionByToolUseId('id-a')).toBeNull();
    expect(store.getInteractionByToolUseId('id-b')).toBe(interactionB);
  });

  it('concurrent side-request no interfiere con interacción agentic registrado', () => {
    const mainInteraction = makeInteraction({ interactionDir: '/tmp/main' });
    const sideInteraction = makeInteraction({ interactionDir: '/tmp/side', interactionType: 'side-request' });

    store.registerInteraction(mainInteraction);
    store.registerInteraction(sideInteraction);

    // Ambos accesibles por dir
    expect(store.getInteractionByDirSync('/tmp/main')).toBe(mainInteraction);
    expect(store.getInteractionByDirSync('/tmp/side')).toBe(sideInteraction);

    // Cerrar side-request no afecta al interacción principal
    store.closeInteraction('/tmp/side');
    expect(store.getInteractionByDir('/tmp/main')).resolves.toBe(mainInteraction);
    expect(store.getInteractionByDir('/tmp/side')).resolves.toBeNull();
  });
});

describe('SessionStoreService — pending Agent tool_uses', () => {
  let tmpDir: string;
  let store: SessionStoreService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sstore-pending-'));
    store = new SessionStoreService(tmpDir);
  });

  it('registerPendingAgentToolUse + findInteractionWithPendingAgents (caso unívoco)', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-aaa', { subagentType: 'general-purpose' });

    const found = store.findInteractionWithPendingAgents('sA');
    expect(found).not.toBeNull();
    expect(found!.interaction).toBe(interaction);
    expect(found!.pendings).toHaveLength(1);
    expect(found!.pendings[0]).toEqual({
      stepIndex: 1,
      toolUseId: 'tool-aaa',
      subagentType: 'general-purpose',
    });
  });

  it('findInteractionWithPendingAgents devuelve null cuando no hay pendings', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    expect(store.findInteractionWithPendingAgents('sA')).toBeNull();
  });

  it('findInteractionWithPendingAgents excluye interacciones con interactionType !== agentic', () => {
    const sideInteraction = makeInteraction({
      interactionDir: '/tmp/side',
      sessionId: 'sA',
      interactionType: 'side-request',
    });
    const preflightInteraction = makeInteraction({
      interactionDir: '/tmp/pre',
      sessionId: 'sA',
      interactionType: 'client-preflight',
    });
    store.registerInteraction(sideInteraction);
    store.registerInteraction(preflightInteraction);
    store.registerPendingAgentToolUse('/tmp/side', 1, 'tool-x');
    store.registerPendingAgentToolUse('/tmp/pre', 1, 'tool-y');

    expect(store.findInteractionWithPendingAgents('sA')).toBeNull();
  });

  it('findInteractionWithPendingAgents excluye interacciones con parentContext (refuerza profundidad ≤ 2)', () => {
    const subagentInteraction = makeInteraction({
      interactionDir: '/tmp/sub',
      sessionId: 'sA',
      parentContext: {
        parentInteractionDir: '/tmp/parent',
        parentStepIndex: 1,
        triggeringToolUseId: 'tool-a',
      },
    });
    store.registerInteraction(subagentInteraction);
    store.registerPendingAgentToolUse('/tmp/sub', 1, 'nested-agent');

    // Aunque el subagente tenga un Agent pendiente, no puede ser padre de nadie.
    expect(store.findInteractionWithPendingAgents('sA')).toBeNull();
  });

  it('findInteractionWithPendingAgents devuelve copia del array (mutación local no afecta al interaction)', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-1');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-2');

    const found = store.findInteractionWithPendingAgents('sA');
    expect(found!.pendings).toHaveLength(2);
    found!.pendings.pop();
    expect(interaction.pendingAgentToolUses).toHaveLength(2);
  });

  it('registerPendingAgentToolUse es idempotente y enriquece subagentType si llega después', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-aaa');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-aaa', { subagentType: 'Explore' });

    expect(interaction.pendingAgentToolUses).toHaveLength(1);
    expect(interaction.pendingAgentToolUses[0].subagentType).toBe('Explore');
  });

  it('consumePendingAgentToolUse elimina la entrada y deja las demás intactas', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-1');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-2');

    store.consumePendingAgentToolUse('/tmp/p1', 'tool-1');
    expect(interaction.pendingAgentToolUses).toHaveLength(1);
    expect(interaction.pendingAgentToolUses[0].toolUseId).toBe('tool-2');
  });

  it('consumePendingAgentToolUse es idempotente sobre entrada inexistente', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.consumePendingAgentToolUse('/tmp/p1', 'no-existe');
    expect(interaction.pendingAgentToolUses).toHaveLength(0);
  });

  it('closeInteraction limpia sessionToActiveInteractions y borra la clave si queda vacío', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    expect(store.findInteractionWithPendingAgents('sA')).toBeNull(); // no pendings, pero el set existe

    // Tras cerrar, la sesión queda sin interacciones activas y find devuelve null
    store.closeInteraction('/tmp/p1');
    store.registerPendingAgentToolUse('/tmp/p1', 1, 'tool-x'); // no-op (interacción ya cerrada)
    expect(store.findInteractionWithPendingAgents('sA')).toBeNull();
  });

  it('sesiones distintas no interfieren', () => {
    const interactionA = makeInteraction({ interactionDir: '/tmp/a', sessionId: 'sA' });
    const interactionB = makeInteraction({ interactionDir: '/tmp/b', sessionId: 'sB' });
    store.registerInteraction(interactionA);
    store.registerInteraction(interactionB);
    store.registerPendingAgentToolUse('/tmp/a', 1, 'tool-a');

    expect(store.findInteractionWithPendingAgents('sA')).not.toBeNull();
    expect(store.findInteractionWithPendingAgents('sB')).toBeNull();
    expect(store.findInteractionWithPendingAgents('sX')).toBeNull();
  });

  it('findStaleInteractionsAwaitingContinuation retorna interacciones stale con awaitingContinuation', async () => {
    const staleInteraction = makeInteraction({
      interactionDir: '/tmp/stale',
      awaitingContinuation: true,
      awaitingSince: Date.now() - 120_000, // 2 min ago
    });
    const freshInteraction = makeInteraction({
      interactionDir: '/tmp/fresh',
      awaitingContinuation: true,
      awaitingSince: Date.now() - 5_000, // 5 sec ago
    });
    const normalInteraction = makeInteraction({ interactionDir: '/tmp/normal' });

    store.registerInteraction(staleInteraction);
    store.registerInteraction(freshInteraction);
    store.registerInteraction(normalInteraction);

    const stale = store.findStaleInteractionsAwaitingContinuation('s1', 60_000);
    expect(stale).toHaveLength(1);
    expect(stale[0].interactionDir).toBe('/tmp/stale');
  });

  it('findStaleInteractionsAwaitingContinuation retorna vacío si no hay stale', async () => {
    const interaction = makeInteraction({ awaitingContinuation: false });
    store.registerInteraction(interaction);
    expect(store.findStaleInteractionsAwaitingContinuation('s1', 60_000)).toHaveLength(0);
  });

  it('getAllOpenInteractions retorna todos los interacciones en el registry', async () => {
    const t1 = makeInteraction({ interactionDir: '/tmp/t1' });
    const t2 = makeInteraction({ interactionDir: '/tmp/t2', sessionId: 's2' });
    store.registerInteraction(t1);
    store.registerInteraction(t2);
    const all = store.getAllOpenInteractions();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.interactionDir).sort()).toEqual(['/tmp/t1', '/tmp/t2']);
  });

  it('getAllOpenInteractions retorna vacío si no hay interacciones', async () => {
    expect(store.getAllOpenInteractions()).toHaveLength(0);
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
});

describe('SessionStoreService — pending WebFetch tool_uses', () => {
  let tmpDir: string;
  let store: SessionStoreService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sstore-webfetch-'));
    store = new SessionStoreService(tmpDir);
  });

  it('registerPendingWebFetchToolUse + findInteractionWithPendingWebFetch', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingWebFetchToolUse('/tmp/p1', 1, 'tool-fetch-1');

    const found = store.findInteractionWithPendingWebFetch('sA');
    expect(found).not.toBeNull();
    expect(found!.interaction).toBe(interaction);
    expect(found!.pendings).toHaveLength(1);
    expect(found!.pendings[0]).toEqual({ stepIndex: 1, toolUseId: 'tool-fetch-1' });
  });

  it('findInteractionWithPendingWebFetch devuelve null cuando no hay pendings', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    expect(store.findInteractionWithPendingWebFetch('sA')).toBeNull();
  });

  it('findInteractionWithPendingWebFetch NO excluye interacciones con parentContext (subagente puede usar WebFetch)', () => {
    const subagentInteraction = makeInteraction({
      interactionDir: '/tmp/sub',
      sessionId: 'sA',
      parentContext: {
        parentInteractionDir: '/tmp/parent',
        parentStepIndex: 1,
        triggeringToolUseId: 'tool-a',
      },
    });
    store.registerInteraction(subagentInteraction);
    store.registerPendingWebFetchToolUse('/tmp/sub', 1, 'fetch-sub');

    const found = store.findInteractionWithPendingWebFetch('sA');
    expect(found).not.toBeNull();
    expect(found!.pendings[0].toolUseId).toBe('fetch-sub');
  });

  it('consumeWebFetchPending elimina la primera entrada y la devuelve', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingWebFetchToolUse('/tmp/p1', 1, 'fetch-1');
    store.registerPendingWebFetchToolUse('/tmp/p1', 2, 'fetch-2');

    const consumed = store.consumeWebFetchPending('/tmp/p1');
    expect(consumed).toEqual({ stepIndex: 1, toolUseId: 'fetch-1' });
    expect(interaction.pendingWebFetchToolUses).toHaveLength(1);
    expect(interaction.pendingWebFetchToolUses[0].toolUseId).toBe('fetch-2');
  });

  it('consumeWebFetchPending retorna null si no hay pendings', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    expect(store.consumeWebFetchPending('/tmp/p1')).toBeNull();
  });

  it('registerPendingWebFetchToolUse es idempotente (no duplica toolUseId)', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingWebFetchToolUse('/tmp/p1', 1, 'fetch-1');
    store.registerPendingWebFetchToolUse('/tmp/p1', 1, 'fetch-1');

    expect(interaction.pendingWebFetchToolUses).toHaveLength(1);
  });

  it('closeInteraction limpia pendings de WebFetch', () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1', sessionId: 'sA' });
    store.registerInteraction(interaction);
    store.registerPendingWebFetchToolUse('/tmp/p1', 1, 'fetch-1');

    store.closeInteraction('/tmp/p1');
    store.registerPendingWebFetchToolUse('/tmp/p1', 2, 'fetch-2'); // no-op (interacción cerrada)
    expect(store.findInteractionWithPendingWebFetch('sA')).toBeNull();
  });

  it('sesiones distintas no interfieren', () => {
    const interactionA = makeInteraction({ interactionDir: '/tmp/a', sessionId: 'sA' });
    const interactionB = makeInteraction({ interactionDir: '/tmp/b', sessionId: 'sB' });
    store.registerInteraction(interactionA);
    store.registerInteraction(interactionB);
    store.registerPendingWebFetchToolUse('/tmp/a', 1, 'fetch-a');

    expect(store.findInteractionWithPendingWebFetch('sA')).not.toBeNull();
    expect(store.findInteractionWithPendingWebFetch('sB')).toBeNull();
  });
});

describe('SessionStoreService — unicidad de stepsMeta', () => {
  let tmpDir: string;
  let store: SessionStoreService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sstore-stepsmeta-'));
    store = new SessionStoreService(tmpDir);
  });

  it('pushStepMetaByDir rechaza duplicado no-coalesced con el mismo stepIndex', async () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1' });
    store.registerInteraction(interaction);

    await store.pushStepMetaByDir('/tmp/p1', { stepIndex: 1, sse: true, statusCode: 200 });

    await expect(
      store.pushStepMetaByDir('/tmp/p1', { stepIndex: 1, sse: true, statusCode: 200 }),
    ).rejects.toThrow('duplicate stepIndex 1 for interaction /tmp/p1');
  });

  it('pushStepMetaByDir permite enriquecer coalescedAgentContinuation sobre step existente', async () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1' });
    store.registerInteraction(interaction);

    await store.pushStepMetaByDir('/tmp/p1', {
      stepIndex: 1,
      sse: true,
      statusCode: 200,
      inputTokens: 100,
    });

    await store.pushStepMetaByDir('/tmp/p1', {
      stepIndex: 1,
      sse: true,
      statusCode: 200,
      coalescedAgentContinuation: {
        toolUseIds: ['tool-1'],
        sseLineCount: 100,
        statusCode: 200,
      },
      outputTokens: 50,
    });

    expect(interaction.stepsMeta).toHaveLength(1);
    expect(interaction.stepsMeta[0].coalescedAgentContinuation).toEqual({
      toolUseIds: ['tool-1'],
      sseLineCount: 100,
      statusCode: 200,
    });
    expect(interaction.stepsMeta[0].inputTokens).toBe(100);
    expect(interaction.stepsMeta[0].outputTokens).toBe(50);
  });

  it('pushStepMetaByDir permite diferentes stepIndex sin restricción', async () => {
    const interaction = makeInteraction({ interactionDir: '/tmp/p1' });
    store.registerInteraction(interaction);

    await store.pushStepMetaByDir('/tmp/p1', { stepIndex: 1, sse: true, statusCode: 200 });
    await store.pushStepMetaByDir('/tmp/p1', { stepIndex: 2, sse: true, statusCode: 200 });
    await store.pushStepMetaByDir('/tmp/p1', { stepIndex: 3, sse: true, statusCode: 200 });

    expect(interaction.stepsMeta).toHaveLength(3);
  });
});
