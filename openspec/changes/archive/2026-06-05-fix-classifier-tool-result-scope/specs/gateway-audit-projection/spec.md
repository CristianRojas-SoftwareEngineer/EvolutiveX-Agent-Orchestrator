## MODIFIED Requirements

### Requirement: Clasificación de requests — `continuation` basada en el último mensaje

`classifyRequestBody` SHALL clasificar un request como `continuation` únicamente si el **último mensaje** del array `messages` contiene uno o más bloques `type: "tool_result"` con `tool_use_id` de tipo string. La presencia de `"tool_result"` en mensajes anteriores del historial acumulado NO SHALL ser condición suficiente para la clasificación `continuation`.

La implementación SHALL mantener el fast-path de búsqueda de string como pre-filtro (si no hay `"tool_result"` en el buffer completo, no hay continuation posible), y solo cuando el pre-filtro detecte el string SHALL parsear el body para verificar la condición semántica en el último mensaje.

Esta invariante es consistente con la semántica del protocolo Anthropic Messages API: una continuation es una respuesta de herramienta que ocupa la última posición del array de mensajes, no un artefacto del historial acumulado de la conversación.

#### Scenario: request con tool_result en último mensaje se clasifica como continuation

- **WHEN** el body contiene un array `messages` cuyo último elemento es `{ role: "user", content: [{ type: "tool_result", tool_use_id: "tu-x", ... }] }`
- **THEN** `classifyRequestBody` SHALL devolver `{ type: "continuation" }`

#### Scenario: request con tool_result solo en historial no se clasifica como continuation

- **WHEN** el body contiene un array `messages` donde un mensaje anterior tiene `type: "tool_result"` pero el último mensaje es `{ role: "user", content: "nueva instrucción" }` (sin tool_result)
- **THEN** `classifyRequestBody` SHALL NOT devolver `{ type: "continuation" }`
- **AND** la clasificación SHALL aplicar las reglas subsiguientes (`fresh`, `side-request`, etc.) sobre el body

#### Scenario: request con tool_result en historial Y tools no vacío se clasifica como fresh

- **WHEN** el body contiene mensajes de historial con `tool_result` y el último mensaje es un nuevo turno del usuario
- **AND** el body incluye un campo `tools` con al menos una herramienta definida
- **THEN** `classifyRequestBody` SHALL devolver `{ type: "fresh" }`

#### Scenario: body malformado o sin mensajes no es continuation

- **WHEN** el fast-path de string detecta `"tool_result"` en el buffer
- **AND** el parseo JSON falla o `messages` está vacío o el último mensaje no tiene bloques `tool_result` válidos
- **THEN** `classifyRequestBody` SHALL NOT devolver `{ type: "continuation" }`
