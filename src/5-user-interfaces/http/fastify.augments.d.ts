import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auditSessionId?: string;
    auditRequestDir?: string;
    requestSequence?: number;
    requestStartTime?: number;
    requestBodyOmitted?: boolean;
  }
}
