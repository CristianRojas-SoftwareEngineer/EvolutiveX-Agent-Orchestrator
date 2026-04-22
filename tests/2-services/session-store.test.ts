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

  it('setActiveTurn registra en ambos índices (sessionId y dir)', async () => {
    const turn = makeTurn();
    await store.setActiveTurn('s1', turn);

    expect(await store.getActiveTurn('s1')).toBe(turn);
    expect(await store.getTurnByDir(turn.interactionDir)).toBe(turn);
  });

  it('registerTurn registra solo en turnRegistry sin afectar activeTurns', async () => {
    const turn = makeTurn({ interactionDir: '/tmp/side-req' });
    store.registerTurn('/tmp/side-req', turn);

    expect(await store.getActiveTurn('s1')).toBeNull();
    expect(await store.getTurnByDir('/tmp/side-req')).toBe(turn);
  });

  it('closeTurn elimina del registry y del activeTurns si coincide', async () => {
    const turn = makeTurn();
    await store.setActiveTurn('s1', turn);

    await store.closeTurn(turn.interactionDir, 's1');

    expect(await store.getActiveTurn('s1')).toBeNull();
    expect(await store.getTurnByDir(turn.interactionDir)).toBeNull();
  });

  it('closeTurn no elimina activeTurn si el dir no coincide', async () => {
    const turnA = makeTurn({ interactionDir: '/tmp/dir-a' });
    const turnB = makeTurn({ interactionDir: '/tmp/dir-b' });

    await store.setActiveTurn('s1', turnA);
    store.registerTurn('/tmp/dir-b', turnB);

    // Cerrar solo turnB; turnA sigue como activeTurn de s1
    await store.closeTurn('/tmp/dir-b', 's1');

    expect(await store.getActiveTurn('s1')).toBe(turnA);
    expect(await store.getTurnByDir('/tmp/dir-b')).toBeNull();
    expect(await store.getTurnByDir('/tmp/dir-a')).toBe(turnA);
  });

  it('pushStepMetaByDir acumula en el turno correcto', async () => {
    const turnA = makeTurn({ interactionDir: '/tmp/a' });
    const turnB = makeTurn({ interactionDir: '/tmp/b' });
    store.registerTurn('/tmp/a', turnA);
    store.registerTurn('/tmp/b', turnB);

    await store.pushStepMetaByDir('/tmp/a', { stepIndex: 1, sse: true, statusCode: 200 });
    await store.pushStepMetaByDir('/tmp/b', { stepIndex: 1, sse: false, statusCode: 200 });

    expect(turnA.stepsMeta).toHaveLength(1);
    expect(turnA.stepsMeta[0].sse).toBe(true);
    expect(turnB.stepsMeta).toHaveLength(1);
    expect(turnB.stepsMeta[0].sse).toBe(false);
  });

  it('incrementStepCountByDir incrementa y retorna stepCount del turno por dir', async () => {
    const turn = makeTurn({ interactionDir: '/tmp/inc', stepCount: 1 });
    store.registerTurn('/tmp/inc', turn);

    expect(store.incrementStepCountByDir('/tmp/inc')).toBe(2);
    expect(store.incrementStepCountByDir('/tmp/inc')).toBe(3);
    expect(turn.stepCount).toBe(3);
  });

  it('incrementStepCountByDir retorna 1 si el dir no existe', () => {
    expect(store.incrementStepCountByDir('/tmp/nonexistent')).toBe(1);
  });

  it('concurrent side-request no desplaza al turno activo principal', async () => {
    const mainTurn = makeTurn({ interactionDir: '/tmp/main' });
    const sideTurn = makeTurn({ interactionDir: '/tmp/side' });

    await store.setActiveTurn('s1', mainTurn);
    store.registerTurn('/tmp/side', sideTurn);

    // Ambos accesibles por dir
    expect(store.getTurnByDirSync('/tmp/main')).toBe(mainTurn);
    expect(store.getTurnByDirSync('/tmp/side')).toBe(sideTurn);

    // Cerrar side-request no afecta al turno principal
    await store.closeTurn('/tmp/side', 's1');
    expect(await store.getActiveTurn('s1')).toBe(mainTurn);
    expect(await store.getTurnByDir('/tmp/main')).toBe(mainTurn);
    expect(await store.getTurnByDir('/tmp/side')).toBeNull();
  });
});
