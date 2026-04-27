import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { ActiveTurn, PendingAgentToolUse, StepMeta } from '../1-domain/types/audit.types.js';
import type { ISessionStore } from './ports/session-store.port.js';

const INTERACTION_SEQUENCE_FILE = 'interaction-sequence.json';

/**
 * Servicio adaptador para operaciones de filesystem de sesiones.
 * Gestiona secuencias en disco, mutex, directorio raíz de auditoría, y estado de turnos activos.
 */
export class SessionStoreService implements ISessionStore {
  private sessionRequestChains = new Map<string, Promise<void>>();
  private auditBaseDir: string;
  private turnRegistry = new Map<string, ActiveTurn>();
  private toolUseIdToTurnDir = new Map<string, string>();
  /** Índice por sesión: sessionId → set de interactionDir de turns activos. */
  private sessionToActiveTurns = new Map<string, Set<string>>();

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

  public registerTurn(turn: ActiveTurn): void {
    this.turnRegistry.set(turn.interactionDir, turn);
    let set = this.sessionToActiveTurns.get(turn.sessionId);
    if (!set) {
      set = new Set<string>();
      this.sessionToActiveTurns.set(turn.sessionId, set);
    }
    set.add(turn.interactionDir);
  }

  public registerPendingAgentToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
    subagentType?: string,
  ): void {
    const turn = this.turnRegistry.get(interactionDir);
    if (!turn) return;
    const existing = turn.pendingAgentToolUses.find((p) => p.toolUseId === toolUseId);
    if (existing) {
      // Idempotente: si ya existe, sólo enriquecer subagentType si llega ahora.
      if (subagentType && !existing.subagentType) {
        existing.subagentType = subagentType;
      }
      return;
    }
    const entry: PendingAgentToolUse = { stepIndex, toolUseId };
    if (subagentType) entry.subagentType = subagentType;
    turn.pendingAgentToolUses.push(entry);
  }

  public findTurnWithPendingAgents(
    sessionId: string,
  ): { turn: ActiveTurn; pendings: PendingAgentToolUse[] } | null {
    const dirs = this.sessionToActiveTurns.get(sessionId);
    if (!dirs) return null;
    for (const dir of dirs) {
      const turn = this.turnRegistry.get(dir);
      if (!turn) continue;
      // Filtros: sólo agentic-turn de nivel 1 con pendings activos.
      // - interactionType !== 'agentic-turn' excluye client-preflight y side-request.
      // - parentContext definido excluye subagentes (refuerza profundidad ≤ 2).
      // - pendingAgentToolUses vacío descarta el resto.
      if (turn.interactionType !== 'agentic-turn') continue;
      if (turn.parentContext) continue;
      if (turn.pendingAgentToolUses.length === 0) continue;
      return { turn, pendings: [...turn.pendingAgentToolUses] };
    }
    return null;
  }

  public consumePendingAgentToolUse(interactionDir: string, toolUseId: string): void {
    const turn = this.turnRegistry.get(interactionDir);
    if (!turn) return;
    const idx = turn.pendingAgentToolUses.findIndex((p) => p.toolUseId === toolUseId);
    if (idx >= 0) {
      turn.pendingAgentToolUses.splice(idx, 1);
    }
  }

  public registerToolUseId(toolUseId: string, interactionDir: string): void {
    this.toolUseIdToTurnDir.set(toolUseId, interactionDir);
  }

  public getTurnByToolUseId(toolUseId: string): ActiveTurn | null {
    const dir = this.toolUseIdToTurnDir.get(toolUseId);
    if (!dir) return null;
    return this.turnRegistry.get(dir) ?? null;
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

  public closeTurn(dir: string): void {
    const turn = this.turnRegistry.get(dir);
    this.turnRegistry.delete(dir);
    if (turn) {
      const set = this.sessionToActiveTurns.get(turn.sessionId);
      if (set) {
        set.delete(dir);
        if (set.size === 0) {
          this.sessionToActiveTurns.delete(turn.sessionId);
        }
      }
    }
    for (const [id, d] of this.toolUseIdToTurnDir) {
      if (d === dir) this.toolUseIdToTurnDir.delete(id);
    }
  }

  public withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
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
