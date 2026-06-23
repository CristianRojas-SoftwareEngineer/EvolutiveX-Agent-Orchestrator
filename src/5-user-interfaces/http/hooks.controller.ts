import type { FastifyRequest, FastifyReply } from 'fastify';
import { parseHookEvent } from '../../1-domain/types/hook.types.js';
import type { AuditHookEventHandler } from '../../3-operations/audit-hook-event.handler.js';

export class HooksController {
  constructor(private readonly hookEventHandler: AuditHookEventHandler) {}

  public async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Responder 202 primero para que Claude Code no espere el procesamiento
    reply.code(202).send();

    try {
      const body = request.body as Buffer;
      let payload: unknown;
      try {
        payload = JSON.parse(body.toString());
      } catch {
        payload = {};
      }
      const event = parseHookEvent(payload);
      if (!event.eventName) {
        request.log.warn(
          { body: body.toString().slice(0, 200) },
          'hook payload inválido — eventName vacío',
        );
        return;
      }
      this.hookEventHandler.execute(event);
    } catch (err) {
      request.log.error({ err }, 'Error procesando evento hook');
    }
  }
}
