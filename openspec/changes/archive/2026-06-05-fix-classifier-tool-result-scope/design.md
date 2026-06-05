## Context

`classifyRequestBody` usa búsqueda de string sobre el buffer completo para detectar `"tool_result"`. Esta heurística es correcta para el caso de turno único, pero falla cuando Claude Code acumula historial: un mensaje `tool_result` de un turno anterior aparece en el string, activando la clasificación `continuation` aunque el último mensaje del array sea un nuevo turno del usuario.

El extractor `extractToolUseIdsFromBody` (y su contraparte pública `extractToolResultIdsFromRequestBody`) ya implementa la semántica correcta — mira solo `messages[last]`. La función `classifyRequestBody` y estas funciones son inconsistentes.

El protocolo Anthropic define una "continuation" como: **el último mensaje del usuario contiene exclusivamente bloques `tool_result`**. No "hay tool_result en algún lugar del historial".

## Goals / Non-Goals

**Goals:**
- Hacer que `classifyRequestBody` use la misma semántica que `extractToolUseIdsFromBody`: verificar el último mensaje.
- Eliminar falsos positivos de clasificación `continuation` en sesiones largas con historial acumulado.
- Reutilizar lógica ya existente (`extractToolResultIdsFromRequestBody`) sin duplicar parseo.

**Non-Goals:**
- No cambiar el comportamiento de `handleContinuation` ni del resto de handlers.
- No modificar `extractToolUseIdsFromBody` ni `extractToolResultIdsFromRequestBody`.
- No introducir cambios en el esquema de sesión ni en los eventos del bus.

## Decisions

### Decisión 1: modificar `classifyRequestBody` usando el fast-path de string + parse de confirmación

**Opción elegida:**
```ts
if (str.includes('"tool_result"')) {
  if (extractToolResultIdsFromRequestBody(bodyBuffer).length > 0) {
    return { type: 'continuation' };
  }
  // "tool_result" en historial, no en último mensaje → continuar al resto de checks
}
```

**Alternativas descartadas:**

- *Eliminar el fast-path y parsear siempre*: introduce parseo JSON en cada request, aunque la mayoría no tenga `tool_result`. El fast-path de string es valioso como filtro.
- *Arreglar `handleContinuation` con fallback a `handleFresh` cuando `toolUseIds=[]`*: band-aid que no elimina la causa raíz. La clasificación errónea podría afectar otras partes del pipeline que lean `classification.type`.
- *Nueva función separada*: duplicaría lógica de `extractToolResultIdsFromRequestBody`. Reutilizar es preferible.

**Razonamiento:** El fast-path de string sigue siendo el guardián de la mayoría de casos (si no hay `"tool_result"` en el string, no hay nada que parsear). Solo cuando el string matchea se invoca `extractToolResultIdsFromRequestBody` para la verificación semántica. El costo de parseo se paga solo para requests que genuinamente contienen `"tool_result"` en algún lugar.

### Decisión 2: no añadir defensa secundaria en `handleContinuation`

Con el fix en el clasificador, `handleContinuation` nunca debería recibir `toolUseIds=[]` desde un request de historial acumulado. Añadir la defensa redundaría sin añadir valor, y oscurecería el contrato: si `toolUseIds=[]` llega a `handleContinuation` es una situación genuinamente inusual (request mal formado) que merece el warning como señal de diagnóstico.

## Risks / Trade-offs

- `extractToolResultIdsFromRequestBody` parsea JSON → si el body es malformado, devuelve `[]`. En ese caso el clasificador caería al resto de checks (posiblemente `preflight-warmup`). Riesgo aceptable: un body malformado no es una continuation válida de ningún modo.
- Dependencia de `classifyRequestBody` sobre `extractToolResultIdsFromRequestBody` — ambas en el mismo archivo, sin acoplamiento externo.
