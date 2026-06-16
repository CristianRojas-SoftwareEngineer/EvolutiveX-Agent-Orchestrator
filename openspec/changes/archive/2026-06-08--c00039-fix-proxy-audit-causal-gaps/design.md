## Context

Proyección causal vía EventBus → SessionPersistence. Workflows wire (`sessionId-wire-N`) interceptan peticiones HTTP; el workflow sesión (`sessionId`) cierra vía hook Stop.

## Goals / Non-Goals

**Goals:** Restaurar trazabilidad causal tool→respuesta; cerrar workflows wire; body.json completo.

**Non-Goals:** Reescribir métricas de sesión; cambiar layout causal-workflows-v1.

## Decisions

1. **Cierre wire en `registerWireStepInCorrelator`** — al detectar stop terminal, `forceClose` con `outcome: success` si `workflowId !== sessionId`. El workflow sesión sigue cerrando vía hook.
2. **`registerStep` sin emit** — evita sobrescribir `request/body.json` con `inferenceRequest` sintético (`messages: []`).
3. **Text blocks en assembler** — mismo patrón que thinking (tracker por índice de bloque).

## Risks / Trade-offs

- Cierre wire en `end_turn` antes del hook Stop: aceptable; el hook Stop solo cierra workflow sesión.
- Métricas `total_workflows` pueden seguir desincronizadas (deuda documentada).

## Migration Plan

Deploy directo; sin migración de datos históricos en `sessions/`.
