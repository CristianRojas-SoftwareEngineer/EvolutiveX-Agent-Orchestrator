import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { ActiveTurn, StepMeta } from '../1-domain/types/audit.types.js';
import type { ISessionStore } from './ports/session-store.port.js';

const INTERACTION_SEQUENCE_FILE = 'interaction-sequence.json';

/**
 * Servicio adaptador para operaciones de filesystem de sesiones.
 * Gestiona secuencias en disco, mutex, directorio raíz de auditoría, y estado de turnos activos.
 */
export class SessionStoreService implements ISessionStore {
  private sessionRequestChains = new Map<string, Promise<void>>();
  private auditBaseDir: string;
  private activeTurns = new Map<string, ActiveTurn>();
  private turnRegistry = new Map<string, ActiveTurn>();

  constructor(auditBaseDir: string) {
    this.auditBaseDir = path.isAbsolute(auditBaseDir)
      ? auditBaseDir
      : path.join(process.cwd(), auditBaseDir);
  }

  public getBaseDir(): string {
    return this.auditBaseDir;
  }

  public async ensureAuditSessionsRoot(): Promise<void> {
    await fs.mkdir(this.auditBaseDir, { recursive: true });
    const gitkeep = path.join(this.auditBaseDir, '.gitkeep');
    try {
      await fs.access(gitkeep);
    } catch {
      await fs.writeFile(gitkeep, '', 'utf8');
    }
  }

  public nextAuditInteractionSequence(sessionId: string): Promise<number> {
    return this.withSessionLock(sessionId, () => this.allocateNextAuditInteractionSequence(sessionId));
  }

  public getActiveTurn(sessionId: string): Promise<ActiveTurn | null> {
    return this.withSessionLock(sessionId, () => {
      return Promise.resolve(this.activeTurns.get(sessionId) || null);
    });
  }

  public setActiveTurn(sessionId: string, turn: ActiveTurn): Promise<void> {
    return this.withSessionLock(sessionId, () => {
      this.activeTurns.set(sessionId, turn);
      this.turnRegistry.set(turn.interactionDir, turn);
      return Promise.resolve();
    });
  }

  public registerTurn(dir: string, turn: ActiveTurn): void {
    this.turnRegistry.set(dir, turn);
  }

  public getTurnByDir(dir: string): Promise<ActiveTurn | null> {
    return Promise.resolve(this.turnRegistry.get(dir) || null);
  }

  public getTurnByDirSync(dir: string): ActiveTurn | null {
    return this.turnRegistry.get(dir) || null;
  }

  public incrementStepCountByDir(dir: string): number {
    const turn = this.turnRegistry.get(dir);
    if (!turn) return 1;
    turn.stepCount += 1;
    return turn.stepCount;
  }

  public async pushStepMetaByDir(dir: string, meta: StepMeta): Promise<void> {
    const turn = this.turnRegistry.get(dir);
    if (turn) turn.stepsMeta.push(meta);
  }

  public async closeTurn(dir: string, sessionId: string): Promise<void> {
    this.turnRegistry.delete(dir);
    await this.withSessionLock(sessionId, async () => {
      const active = this.activeTurns.get(sessionId);
      if (active?.interactionDir === dir) {
        this.activeTurns.delete(sessionId);
      }
    });
  }

  private withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = String(sessionId);
    const prev = this.sessionRequestChains.get(key) || Promise.resolve();
    const result = prev.then(() => fn());
    this.sessionRequestChains.set(key, result.catch(() => {}) as unknown as Promise<void>);
    return result;
  }

  private async allocateNextAuditInteractionSequence(sessionId: string): Promise<number> {
    const fromFile = await this.readLastSequenceFromFile(sessionId);
    const fromDirs = await this.maxSequenceFromExistingInteractionDirs(sessionId);
    const lastSeen = Math.max(fromFile ?? 0, fromDirs);
    const next = lastSeen + 1;
    await this.writeLastSequenceAtomic(sessionId, next);
    return next;
  }

  private async readLastSequenceFromFile(sessionId: string): Promise<number | null> {
    const filePath = path.join(this.auditBaseDir, sessionId, INTERACTION_SEQUENCE_FILE);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const j = JSON.parse(raw);
      if (typeof j.last === 'number' && Number.isFinite(j.last) && j.last >= 0) {
        return Math.floor(j.last);
      }
    } catch {
      /* archivo faltante o inválido */
    }
    return null;
  }

  private async maxSequenceFromExistingInteractionDirs(sessionId: string): Promise<number> {
    const reqDir = path.join(this.auditBaseDir, sessionId, 'interactions');
    let max = 0;
    try {
      const entries = await fs.readdir(reqDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = /^(\d{6})_/.exec(e.name);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n)) max = Math.max(max, n);
        }
      }
    } catch {
      /* no existe el directorio de peticiones */
    }
    return max;
  }

  private async writeLastSequenceAtomic(sessionId: string, last: number): Promise<void> {
    const sessionDir = path.join(this.auditBaseDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, INTERACTION_SEQUENCE_FILE);
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify({ last }, null, 2)}\n`;
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, filePath);
  }
}
