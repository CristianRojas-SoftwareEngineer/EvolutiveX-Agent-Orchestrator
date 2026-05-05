import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import {
  ActiveInteraction,
  PendingAgentToolUse,
  PendingWebSearchToolUse,
  StepMeta,
} from '../1-domain/types/audit.types.js';
import type { ISessionStore } from './ports/session-store.port.js';
import type { Logger } from '../1-domain/types/logger.types.js';
import {
  DIR_MAIN_AGENT,
  DIR_INTERACTIONS,
  DIR_SIDE_INTERACTIONS,
  FILE_INTERACTION_SEQUENCE,
} from '../1-domain/constants/audit-paths.js';

/**
 * Servicio adaptador para operaciones de filesystem de sesiones.
 * Gestiona secuencias en disco, mutex, directorio raíz de auditoría, y estado de interacciones activas.
 */
export class SessionStoreService implements ISessionStore {
  private sessionRequestChains = new Map<string, Promise<void>>();
  private auditBaseDir: string;
  private interactionRegistry = new Map<string, ActiveInteraction>();
  private toolUseIdToInteractionDir = new Map<string, string>();
  /** Índice por sesión: sessionId → set de interactionDir de interacciones activas. */
  private sessionToActiveInteractions = new Map<string, Set<string>>();

  constructor(
    auditBaseDir: string,
    private logger?: Logger,
  ) {
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

  public nextMainAgentSequence(sessionId: string): Promise<number> {
    return this.withSessionLock(sessionId, () =>
      this.allocateNextSequence(
        path.join(this.auditBaseDir, sessionId, DIR_MAIN_AGENT, FILE_INTERACTION_SEQUENCE),
        path.join(this.auditBaseDir, sessionId, DIR_MAIN_AGENT, DIR_INTERACTIONS),
      ),
    );
  }

  public nextSideInteractionSequence(sessionId: string): Promise<number> {
    return this.withSessionLock(sessionId, () =>
      this.allocateNextSequence(
        path.join(this.auditBaseDir, sessionId, DIR_SIDE_INTERACTIONS, FILE_INTERACTION_SEQUENCE),
        path.join(this.auditBaseDir, sessionId, DIR_SIDE_INTERACTIONS),
      ),
    );
  }

  public registerInteraction(interaction: ActiveInteraction): void {
    this.interactionRegistry.set(interaction.interactionDir, interaction);
    let set = this.sessionToActiveInteractions.get(interaction.sessionId);
    if (!set) {
      set = new Set<string>();
      this.sessionToActiveInteractions.set(interaction.sessionId, set);
    }
    set.add(interaction.interactionDir);
  }

  public registerPendingAgentToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
    subagentType?: string,
  ): void {
    const interaction = this.interactionRegistry.get(interactionDir);
    if (!interaction) return;
    const existing = interaction.pendingAgentToolUses.find((p) => p.toolUseId === toolUseId);
    if (existing) {
      // Idempotente: si ya existe, sólo enriquecer subagentType si llega ahora.
      if (subagentType && !existing.subagentType) {
        existing.subagentType = subagentType;
      }
      return;
    }
    const entry: PendingAgentToolUse = { stepIndex, toolUseId };
    if (subagentType) entry.subagentType = subagentType;
    interaction.pendingAgentToolUses.push(entry);
  }

  public findInteractionWithPendingAgents(
    sessionId: string,
  ): { interaction: ActiveInteraction; pendings: PendingAgentToolUse[] } | null {
    const dirs = this.sessionToActiveInteractions.get(sessionId);
    if (!dirs) return null;
    for (const dir of dirs) {
      const interaction = this.interactionRegistry.get(dir);
      if (!interaction) continue;
      // Filtros: sólo agentic de nivel 1 con pendings activos.
      // - interactionType !== 'agentic' excluye client-preflight y side-request.
      // - parentContext definido excluye subagentes (refuerza profundidad ≤ 2).
      // - pendingAgentToolUses vacío descarta el resto.
      if (interaction.interactionType !== 'agentic') continue;
      if (interaction.parentContext) continue;
      if (interaction.pendingAgentToolUses.length === 0) continue;
      return { interaction, pendings: [...interaction.pendingAgentToolUses] };
    }
    return null;
  }

  public consumePendingAgentToolUse(interactionDir: string, toolUseId: string): void {
    const interaction = this.interactionRegistry.get(interactionDir);
    if (!interaction) return;
    const idx = interaction.pendingAgentToolUses.findIndex((p) => p.toolUseId === toolUseId);
    if (idx >= 0) {
      interaction.pendingAgentToolUses.splice(idx, 1);
    }
  }

  public registerPendingWebSearchToolUse(
    interactionDir: string,
    stepIndex: number,
    toolUseId: string,
  ): void {
    const interaction = this.interactionRegistry.get(interactionDir);
    if (!interaction) return;
    // Idempotente: si ya existe el toolUseId, no duplicar.
    if (interaction.pendingWebSearchToolUses.some((p) => p.toolUseId === toolUseId)) return;
    interaction.pendingWebSearchToolUses.push({ stepIndex, toolUseId });
  }

  public findInteractionWithPendingWebSearch(
    sessionId: string,
  ): { interaction: ActiveInteraction; pendings: PendingWebSearchToolUse[] } | null {
    const dirs = this.sessionToActiveInteractions.get(sessionId);
    if (!dirs) return null;
    for (const dir of dirs) {
      const interaction = this.interactionRegistry.get(dir);
      if (!interaction) continue;
      if (interaction.pendingWebSearchToolUses.length === 0) continue;
      return { interaction, pendings: [...interaction.pendingWebSearchToolUses] };
    }
    return null;
  }

  public consumeWebSearchPending(interactionDir: string): PendingWebSearchToolUse | null {
    const interaction = this.interactionRegistry.get(interactionDir);
    if (!interaction || interaction.pendingWebSearchToolUses.length === 0) return null;
    return interaction.pendingWebSearchToolUses.shift()!;
  }

  public registerToolUseId(toolUseId: string, interactionDir: string): void {
    this.toolUseIdToInteractionDir.set(toolUseId, interactionDir);
  }

  public getInteractionByToolUseId(toolUseId: string): ActiveInteraction | null {
    const dir = this.toolUseIdToInteractionDir.get(toolUseId);
    if (!dir) return null;
    return this.interactionRegistry.get(dir) ?? null;
  }

  public getInteractionByDir(dir: string): Promise<ActiveInteraction | null> {
    return Promise.resolve(this.interactionRegistry.get(dir) || null);
  }

  public getInteractionByDirSync(dir: string): ActiveInteraction | null {
    return this.interactionRegistry.get(dir) || null;
  }

  public incrementStepCountByDir(dir: string): number {
    const interaction = this.interactionRegistry.get(dir);
    if (!interaction) return 1;
    interaction.stepCount += 1;
    return interaction.stepCount;
  }

  public async pushStepMetaByDir(dir: string, meta: StepMeta): Promise<void> {
    const interaction = this.interactionRegistry.get(dir);
    if (interaction) interaction.stepsMeta.push(meta);
  }

  public closeInteraction(dir: string): void {
    const interaction = this.interactionRegistry.get(dir);
    this.interactionRegistry.delete(dir);
    if (interaction) {
      const set = this.sessionToActiveInteractions.get(interaction.sessionId);
      if (set) {
        set.delete(dir);
        if (set.size === 0) {
          this.sessionToActiveInteractions.delete(interaction.sessionId);
        }
      }
    }
    for (const [id, d] of this.toolUseIdToInteractionDir) {
      if (d === dir) this.toolUseIdToInteractionDir.delete(id);
    }
  }

  public findStaleInteractionsAwaitingContinuation(sessionId: string, maxAgeMs: number): ActiveInteraction[] {
    const dirs = this.sessionToActiveInteractions.get(sessionId);
    if (!dirs) return [];
    const now = Date.now();
    const stale: ActiveInteraction[] = [];
    for (const dir of dirs) {
      const interaction = this.interactionRegistry.get(dir);
      if (!interaction) continue;
      if (
        interaction.awaitingContinuation === true &&
        typeof interaction.awaitingSince === 'number' &&
        now - interaction.awaitingSince > maxAgeMs
      ) {
        stale.push(interaction);
      }
    }
    return stale;
  }

  public getAllOpenInteractions(): ActiveInteraction[] {
    return [...this.interactionRegistry.values()];
  }

  public withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = String(sessionId);
    const prev = this.sessionRequestChains.get(key) || Promise.resolve();
    const result = prev.then(() => fn());
    this.sessionRequestChains.set(key, result.catch(() => {}) as unknown as Promise<void>);
    return result;
  }

  private async allocateNextSequence(sequenceFilePath: string, scanDir: string): Promise<number> {
    const fromFile = await this.readLastSequenceFromFile(sequenceFilePath);
    const fromDirs = await this.maxSequenceFromExistingDirs(scanDir);
    const lastSeen = Math.max(fromFile ?? 0, fromDirs);
    const next = lastSeen + 1;
    await this.writeLastSequenceAtomic(sequenceFilePath, next);
    return next;
  }

  private async readLastSequenceFromFile(filePath: string): Promise<number | null> {
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

  private async maxSequenceFromExistingDirs(scanDir: string): Promise<number> {
    let max = 0;
    try {
      const entries = await fs.readdir(scanDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = /^(\d{2})$/.exec(e.name);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n)) max = Math.max(max, n);
        }
      }
    } catch {
      /* directorio inexistente */
    }
    return max;
  }

  private async writeLastSequenceAtomic(filePath: string, last: number): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify({ last }, null, 2)}\n`;
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, filePath);
  }
}
