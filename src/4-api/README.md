# Capa 4 — API (Composition Root)

En este proyecto, Capa 4 se limita a:

- **Composition Root** (`composition-root.ts`): wiring de todas las dependencias.
- **Configuración de entorno** (`config/env.config.ts`): parsing de variables de entorno.

No se implementan **Mediator**, **Auth**, **Unit of Work** ni **Tracking** porque:

- No hay múltiples canales de entrada (solo HTTP via Fastify).
- No hay persistencia transaccional (la auditoría es append-only en filesystem).
- No hay autenticación propia (el proxy delega la autenticación al upstream).

Estos componentes se dejan previstos para futura expansión si el proyecto evoluciona hacia múltiples interfaces o persistencia relacional.
