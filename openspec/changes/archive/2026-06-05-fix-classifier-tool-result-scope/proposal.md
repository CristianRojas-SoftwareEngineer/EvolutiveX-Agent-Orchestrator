## Why

`classifyRequestBody` detecta continuaciones buscando `"tool_result"` en todo el buffer de texto, pero el extractor `extractToolUseIdsFromBody` solo mira el último mensaje. Cuando Claude Code acumula historial de turnos anteriores, requests genuinamente frescos que contienen `tool_result` en mensajes anteriores son clasificados erróneamente como `continuation`, resultando en workflows orphan espurios y warnings falsos que aumentan en frecuencia con la longitud de la sesión.

## What Changes

- `classifyRequestBody` pasará de buscar `"tool_result"` en el string completo a verificar que el bloque `tool_result` esté en el **último mensaje** del array — consistente con la semántica real del protocolo Anthropic y con `extractToolUseIdsFromBody`.
- `extractToolResultIdsFromRequestBody` (ya existente en el servicio) provee exactamente la lógica correcta; el clasificador la reutilizará.
- Los tests del clasificador se ampliarán para cubrir el caso de historial acumulado (tool_result en mensajes anteriores, último mensaje sin tool_result).

## Capabilities

### New Capabilities

*(ninguna — esta change no introduce capacidades nuevas)*

### Modified Capabilities

- `gateway-audit-projection`: el requirement de clasificación de `continuation` SHALL restringirse al último mensaje (cambio de invariante observable).

## Impact

- `src/1-domain/services/request-classifier.service.ts` — único archivo de producción modificado.
- `tests/1-domain/request-classifier.test.ts` — tests nuevos para el caso de historial acumulado.
- Sin impacto en APIs externas, dependencias, base de datos, ni contratos de red.
- Reducción de warnings y workflows orphan espurios en sesiones largas.
