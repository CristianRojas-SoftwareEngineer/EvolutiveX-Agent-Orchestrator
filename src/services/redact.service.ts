/**
 * Servicio para sanitizar datos sensibles (API keys, tokens, cookies)
 * de las cabeceras y cuerpos JSON anidados antes de que sean logueados o auditados.
 */
export class RedactService {
  /** Conjunto de nombres de cabeceras conocidos por contener información sensible. */
  private readonly sensitiveHeaderNames = new Set([
    'authorization',
    'x-api-key',
    'cookie',
    'set-cookie',
    'proxy-authorization',
  ]);

  /** Conjunto de claves JSON en cuerpos de petición/respuesta que deben ser redactadas. */
  private readonly sensitiveJsonKeys = new Set([
    'api_key',
    'apikey',
    'password',
    'secret',
    'token',
    'access_token',
    'refresh_token',
  ]);

  /**
   * Sanitiza un objeto de cabeceras, reemplazando valores sensibles con '[REDACTED]'.
   */
  public redactHeaders(headers: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (!headers || typeof headers !== 'object') return out;

    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) {
        out[k] = v.map((item) => this.redactHeaderValue(k, item));
      } else {
        out[k] = this.redactHeaderValue(k, v);
      }
    }
    return out;
  }

  /**
   * Recorre recursivamente un objeto JSON y redacta las claves encontradas en SENSITIVE_JSON_KEYS.
   * 
   * @param obj El objeto a redactar.
   * @param depth Profundidad de recursión actual (limitada a 32).
   */
  public deepRedactJson(obj: any, depth = 0): any {
    if (depth > 32) return '[MAX_DEPTH]';
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) =>
        typeof item === 'object' && item !== null
          ? this.deepRedactJson(item, depth + 1)
          : item
      );
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        out[k] = this.deepRedactJson(v, depth + 1);
      } else if (Array.isArray(v)) {
        out[k] = this.deepRedactJson(v, depth + 1);
      } else {
        out[k] = this.redactJsonValue(k, v);
      }
    }
    return out;
  }

  /**
   * Intenta parsear un Buffer como JSON UTF-8. Devuelve null si falla el parsing.
   */
  public tryParseJson(buffer: Buffer | null): any | null {
    if (!buffer || buffer.length === 0) return null;
    try {
      return JSON.parse(buffer.toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Lógica para redactar un único valor de cabecera basado en su nombre de clave.
   */
  private redactHeaderValue(name: string, value: any): any {
    if (value == null) return value;
    const lower = String(name).toLowerCase();
    if (this.sensitiveHeaderNames.has(lower)) return '[REDACTED]';
    return value;
  }

  /**
   * Lógica para redactar un único valor JSON basado en su nombre de clave.
   */
  private redactJsonValue(key: string, value: any): any {
    if (this.sensitiveJsonKeys.has(String(key).toLowerCase())) {
      return typeof value === 'string' && value.length > 0 ? '[REDACTED]' : '[REDACTED]';
    }
    return value;
  }
}
