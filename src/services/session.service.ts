import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AuditSession } from '../interfaces/audit.interface.js';
import { ProxyEnvironmentConfig } from '../interfaces/config.interface.js';

const REQUEST_SEQUENCE_FILE = 'request-sequence.json';
const FALLBACK_SESSION_DIR = '_unknown';

/**
 * Servicio encargado de resolver los IDs de sesión desde las cabeceras de la petición,
 * gestionar los números secuenciales de petición y asegurar la asignación en disco libre de colisiones.
 */
export class SessionService {
  /** Mapa para serializar la asignación asíncrona de secuencias por sesión. */
  private sessionRequestChains = new Map<string, Promise<void>>();
  /** La raíz del sistema de archivos donde se almacenan los datos de auditoría. */
  private auditBaseDir: string;
  /** Referencia a la configuración de entorno global. */
  private config: ProxyEnvironmentConfig;

  /**
   * @param config La configuración global del proxy.
   * @param auditBaseDir El directorio base para las auditorías (por defecto el CWD).
   */
  constructor(config: ProxyEnvironmentConfig, auditBaseDir: string = process.cwd()) {
    this.config = config;
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
   * Identifica la sesión de auditoría a partir de las cabeceras de la petición usando lógica de prioridad:
   * 1. Cabecera Primaria (Override)
   * 2. Cabecera Secundaria (Fallback)
   * 3. ID de Sesión por Defecto
   * 4. Fallback a Desconocido
   *
   * @param headers Las cabeceras de la petición entrante.
   * @returns Un objeto que contiene el sessionId resuelto y la cabecera a eliminar.
   */
  public getAuditSessionId(headers: Record<string, string | string[] | undefined>): AuditSession {
    const tryNamedHeader = (name?: string): AuditSession | null => {
      if (!name) return null;
      const v = this.getHeaderValue(headers, name);
      if (v == null || String(v).trim() === '') return null;
      const raw = String(v).trim();
      return { sessionId: this.sessionIdFromRaw(raw), stripHeaderName: name };
    };

    const primary = tryNamedHeader(this.config.AUDIT_SESSION_OVERRIDE_HEADER);
    if (primary) return primary;

    const fb = tryNamedHeader(this.config.AUDIT_SESSION_FALLBACK_HEADER);
    if (fb) return fb;

    if (
      this.config.DEFAULT_AUDIT_SESSION &&
      String(this.config.DEFAULT_AUDIT_SESSION).trim() !== ''
    ) {
      const raw = String(this.config.DEFAULT_AUDIT_SESSION).trim();
      return { sessionId: this.sessionIdFromRaw(raw), stripHeaderName: null };
    }

    return { sessionId: FALLBACK_SESSION_DIR, stripHeaderName: null };
  }

  /**
   * Elimina una cabecera de sesión específica del objeto de cabeceras para evitar su exposición al upstream.
   */
  public stripAuditHeaderInPlace(
    headers: Record<string, string | string[] | undefined>,
    headerName: string,
  ): void {
    if (!headers) return;
    const lower = String(headerName).toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === lower) {
        delete headers[k];
      }
    }
  }

  /**
   * Método thread-safe para obtener el siguiente número secuencial de petición para una sesión.
   * Utiliza una cadena de promesas para prevenir condiciones de carrera al leer/escribir archivos de secuencia.
   *
   * @param sessionId El ID de sesión resuelto.
   */
  public nextAuditRequestSequence(sessionId: string): Promise<number> {
    return this.withSessionLock(sessionId, () => this.allocateNextAuditRequestSequence(sessionId));
  }

  /**
   * Formatea el nombre de un directorio de petición combinando el número de secuencia y el ID de petición.
   * Ejemplo: '000001_req-a1b2'
   */
  public formatAuditRequestDirName(sequence: number, requestId: string): string {
    const seq = String(Math.max(0, Math.floor(sequence)) || 0).padStart(6, '0');
    return `${seq}_${requestId}`;
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

  /**
   * Ayudante para recuperar un único valor de cabecera de forma insensible a mayúsculas/minúsculas.
   */
  private getHeaderValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const lower = String(name).toLowerCase();
    if (!headers) return undefined;
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === lower) {
        const v = headers[k];
        return Array.isArray(v) ? v[0] : v;
      }
    }
    return undefined;
  }

  /**
   * Sanitiza una cadena cruda para ser utilizada como un nombre de directorio seguro.
   */
  private safeSessionDirName(raw: string): string {
    if (!raw) return FALLBACK_SESSION_DIR;
    const s = String(raw).trim().slice(0, 128);
    const safe = s
      // eslint-disable-next-line no-control-regex -- Requerido para compatibilidad con filenames en Windows
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^\.+/, '')
      .replace(/\s+/g, '_');
    if (!safe || safe === '.' || safe === '..') return FALLBACK_SESSION_DIR;
    return safe;
  }

  /**
   * Resolución final del ID de sesión, aplicando sanitización y sufijo de hash opcional.
   */
  private sessionIdFromRaw(raw: string): string {
    const dir = this.safeSessionDirName(raw);
    if (!this.config.AUDIT_SESSION_HASH_SUFFIX) return dir;
    if (!raw || raw.trim() === '' || dir === FALLBACK_SESSION_DIR) return dir;

    const h = createHash('sha256').update(raw.trim()).digest('hex').slice(0, 8);
    const base = dir.slice(0, 100);
    return `${base}-${h}`;
  }
}
