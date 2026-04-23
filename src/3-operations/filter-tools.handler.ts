import { ProxyEnvironmentConfig } from '../1-domain/types/config.types.js';

interface ToolDefinition {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface RequestBody {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  tools?: ToolDefinition[];
}

/**
 * Handler para filtrar tools específicas del body del request antes de
 * la auditoría y el envío al upstream.
 *
 * Esto reduce el consumo de tokens innecesarios y elimina ruido en la observabilidad.
 */
export class FilterToolsHandler {
  constructor(private config: ProxyEnvironmentConfig) {}

  /**
   * Filtra las tools configuradas del body del request.
   * @param rawBody - Buffer con el body original
   * @returns Buffer con el body filtrado (o el original si no hay cambios o errores)
   */
  public execute(rawBody: Buffer): Buffer {
    // Si no hay tools configuradas para filtrar, retornar body original
    if (this.config.FILTERED_TOOLS.length === 0) {
      return rawBody;
    }

    // Si el body está vacío, retornar original
    if (rawBody.length === 0) {
      return rawBody;
    }

    try {
      const body = JSON.parse(rawBody.toString('utf-8')) as RequestBody;

      // Si no hay tools o no es un array, retornar original
      if (!body.tools || !Array.isArray(body.tools)) {
        return rawBody;
      }

      const originalCount = body.tools.length;

      // Filtrar las tools excluyendo las que coincidan con FILTERED_TOOLS
      body.tools = body.tools.filter(
        (tool: ToolDefinition) => !this.config.FILTERED_TOOLS.includes(tool.name),
      );

      // Si no hubo cambios, retornar el body original
      if (body.tools.length === originalCount) {
        return rawBody;
      }

      // Si quedaron 0 tools, eliminar la propiedad tools del body
      if (body.tools.length === 0) {
        delete body.tools;
      }

      // Serializar y retornar el body filtrado
      return Buffer.from(JSON.stringify(body), 'utf-8');
    } catch {
      // Si hay error de parseo, retornar el body original sin modificaciones
      return rawBody;
    }
  }
}
