import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import type { ISessionStore } from './ports/session-store.port.js';

const REQUEST_SEQUENCE_FILE = 'request-sequence.json';

/**
 * Servicio adaptador para operaciones de filesystem de sesiones.
 * Gestiona secuencias en disco, mutex, y directorio raíz de auditoría.
 */
export class SessionStoreService implements ISessionStore {
  /** Mapa para serializar la asignación asíncrona de secuencias por sesión. */
  private sessionRequestChains = new Map<string, Promise<void>>();
  /** La raíz del sistema de archivos donde se almacenan los datos de auditoría. */
  private auditBaseDir: string;

  constructor(auditBaseDir: string) {
    this.auditBaseDir = path.isAbsolute(auditBaseDir)
      ? auditBaseDir
      : path.join(process.cwd(), auditBaseDir);
  }

  /**
   * Devuelve la ruta absoluta del directorio base de auditoría.
   */
  public getBaseDir(): string {
    return this.auditBaseDir;
  }

  /**
   * Asegura que el directorio raíz de auditoría existe y crea un archivo .gitkeep.
   */
  public async ensureAuditSessionsRoot(): Promise<void> {
    await fs.mkdir(this.auditBaseDir, { recursive: true });
    const gitkeep = path.join(this.auditBaseDir, '.gitkeep');
    try {
      await fs.access(gitkeep);
    } catch {
      await fs.writeFile(gitkeep, '', 'utf8');
    }
  }

  /**
   * Método thread-safe para obtener el siguiente número secuencial de petición para una sesión.
   * Utiliza una cadena de promesas para prevenir condiciones de carrera al leer/escribir archivos de secuencia.
   */
  public nextAuditRequestSequence(sessionId: string): Promise<number> {
    return this.withSessionLock(sessionId, () => this.allocateNextAuditRequestSequence(sessionId));
  }

  /**
   * Implementación de mutex interno utilizando cadenas de Promesas.
   */
  private withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = String(sessionId);
    const prev = this.sessionRequestChains.get(key) || Promise.resolve();
    const result = prev.then(() => fn());
    this.sessionRequestChains.set(key, result.catch(() => {}) as unknown as Promise<void>);
    return result;
  }

  /**
   * Lógica para determinar el número de secuencia absolutamente siguiente consultando el estado local y el disco.
   */
  private async allocateNextAuditRequestSequence(sessionId: string): Promise<number> {
    const fromFile = await this.readLastSequenceFromFile(sessionId);
    const fromDirs = await this.maxSequenceFromExistingRequestDirs(sessionId);
    const lastSeen = Math.max(fromFile ?? 0, fromDirs);
    const next = lastSeen + 1;
    await this.writeLastSequenceAtomic(sessionId, next);
    return next;
  }

  /**
   * Lee el último número de secuencia desde el archivo de metadatos de la sesión local.
   */
  private async readLastSequenceFromFile(sessionId: string): Promise<number | null> {
    const filePath = path.join(this.auditBaseDir, sessionId, REQUEST_SEQUENCE_FILE);
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

  /**
   * Escanea los directorios de Petición existentes en una sesión para encontrar el número de secuencia más alto.
   * Se utiliza como fallback de robustez.
   */
  private async maxSequenceFromExistingRequestDirs(sessionId: string): Promise<number> {
    const reqDir = path.join(this.auditBaseDir, sessionId, 'requests');
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

  /**
   * Escribe de forma atómica el siguiente número de secuencia en el disco.
   */
  private async writeLastSequenceAtomic(sessionId: string, last: number): Promise<void> {
    const sessionDir = path.join(this.auditBaseDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, REQUEST_SEQUENCE_FILE);
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify({ last }, null, 2)}\n`;
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, filePath);
  }
}
