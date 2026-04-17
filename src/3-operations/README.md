# Capa 3 — Operations (Handlers)

Todos los handlers de esta capa son **Command Handlers**: reciben un contexto y ejecutan efectos secundarios de auditoría (escritura a disco).

No hay **Queries**, **bus formal** ni **Mediator** porque el flujo es unidireccional (HTTP → auditoría). Un Mediator añadiría indirección sin valor en este contexto.

Los handlers dependen de **ports** (interfaces en `src/2-services/ports/`) y de tipos de dominio (`src/1-domain/types/`), nunca de clases concretas de Capa 2.

## Deuda conocida

- `test:unit` y `test:integration` ejecutan la misma suite — la separación se difiere a una iteración futura.
