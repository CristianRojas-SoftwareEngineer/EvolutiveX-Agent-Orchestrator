import { createHash } from 'node:crypto';
import { AuditSession } from '../types/audit.types.js';
import { ProxyEnvironmentConfig } from '../types/config.types.js';

const FALLBACK_SESSION_DIR = '_unknown';

/**
 * Servicio de dominio puro para resolver IDs de sesión desde cabeceras.
 * Sin dependencias de I/O ni filesystem.
 */
export class SessionResolverService {
  constructor(private config: ProxyEnvironmentConfig) {}

  /**
   * Identifica la sesión de auditoría a partir de las cabeceras de la petición usando lógica de prioridad:
   * 1. Cabecera Primaria (Override)
   * 2. Cabecera Secundaria (Fallback)
   * 3. ID de Sesión por Defecto
   * 4. Fallback a Desconocido
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
   * Formatea el nombre de un directorio de interacción combinando el número de secuencia y el ID de petición.
   * Ejemplo: '000001_req-a1b2'
   */
  public formatAuditInteractionDirName(sequence: number, requestId: string): string {
    const seq = String(Math.max(0, Math.floor(sequence)) || 0).padStart(6, '0');
    return `${seq}_${requestId}`;
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
