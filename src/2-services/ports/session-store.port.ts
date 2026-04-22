import { ActiveTurn, StepMeta } from '../../1-domain/types/audit.types.js';

/**
 * Port que define el contrato público de almacenamiento de sesiones.
 * Consumido por los handlers de Capa 3.
 */
export interface ISessionStore {
  getBaseDir(): string;
  ensureAuditSessionsRoot(): Promise<void>;
  nextAuditInteractionSequence(sessionId: string): Promise<number>;
  getActiveTurn(sessionId: string): Promise<ActiveTurn | null>;
  setActiveTurn(sessionId: string, turn: ActiveTurn): Promise<void>;
  registerTurn(dir: string, turn: ActiveTurn): void;
  getTurnByDir(dir: string): Promise<ActiveTurn | null>;
  getTurnByDirSync(dir: string): ActiveTurn | null;
  incrementStepCountByDir(dir: string): number;
  pushStepMetaByDir(dir: string, meta: StepMeta): Promise<void>;
  closeTurn(dir: string, sessionId: string): Promise<void>;
}
