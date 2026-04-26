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
