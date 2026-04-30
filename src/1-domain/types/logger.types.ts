import type { FastifyBaseLogger } from 'fastify';

/**
 * Tipo para el logger de Fastify, compatible con Pino.
 * Usado para inyección de dependencias en handlers.
 */
export type Logger = FastifyBaseLogger;
