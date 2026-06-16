## Context

El sistema de TTS en Smart Code Proxy intercepta hooks de Claude Code y reproduce audio contextual en eventos de ciclo de vida. Hoy, cuando llega `UserPromptSubmit`, el `AuditHookEventHandler` lee los últimos N=3 mensajes del transcript JSONL de la sesión (vía `TranscriptContextExtractor.extractLastNMessages`) y los envía al LLM dedicado de OpenRouter con el system prompt `VOICE_ASSISTANT_SYSTEM_PROMPT`, que pide "responder al último mensaje del usuario".

El problema: según la documentación oficial de Claude Code, `UserPromptSubmit` se dispara *"before Claude processes it"*, lo que significa que el prompt actual **no está todavía** en el transcript. El campo `prompt` llega en el payload del hook, no en el transcript. El LLM termina respondiendo al prompt del **turno anterior** y el audio se desincroniza con lo que el usuario acaba de pedir.

Adicionalmente, los `IContextExtractor` actuales y los tests cubren el caso genérico "últimos N", pero no la selección por rol (último `user` vs. último `assistant`).

## Goals / Non-Goals

**Goals:**

- Que el audio generado en `UserPromptSubmit` responda al **prompt actual**, no al anterior.
- Mantener la separación PKA: la selección de mensajes por rol vive en el extractor (capa 2), no en el handler (capa 3).
- Reusar la misma llamada a OpenRouter (mismo `model`, `max_tokens`, `reasoning`) — sin costes de API adicionales.
- Mantener el comportamiento de `Stop`, `SubagentStop` y `StopFailure` intacto.
- Caer al fallback `FALLBACK_SPEECH.UserPromptSubmit` cuando falte contexto (sesión nueva, sin API key, fallo HTTP).

**Non-Goals:**

- No se modifica el `CONTINUITY_SYSTEM_PROMPT` ni el flujo de resumen (`mode='summary'`).
- No se añade un segundo LLM ni un pipeline paralelo. La inferencia sigue yendo a OpenRouter vía `poolside/laguna-xs.2:free`.
- No se cambia la API del puerto `ITTSService` ni la implementación de `SapiTTSService`.
- No se introduce configuración nueva. `TTS_CONTEXT_N` sigue gobernando solo la rama `summary`.
- No se cambia el comportamiento de fallback cuando hay clave y respuesta exitosa. Solo cambia **qué** mensajes se mandan al LLM en `mode='prompt'`.

## Decisions

### D-1: Nuevo método en el puerto `IContextExtractor` con semántica de selección por rol

Se añade un método `extractUserPromptSubmitContext(transcriptPath, currentPrompt)` al puerto que devuelve un `UserPromptContext` con tres campos:

```ts
export interface UserPromptContext {
  previousUserMessage: string | undefined;
  lastAssistantResponse: string | undefined;
  currentPrompt: string;
}
```

El adapter `TranscriptContextExtractor` lo implementa: lee los últimos N=10 mensajes (ventana amplia para garantizar que están los dos roles pedidos), filtra por `role`, y devuelve la tríada. La selección curada es **del extractor**, no del handler.

**Semántica concreta de la tríada (aclaración surgida durante la implementación):**
- `previousUserMessage` = **el último mensaje con `role: 'user'` en el transcript** (no el penúltimo). El prompt actual (`currentPrompt`) llega en el payload del hook y aún no está en el transcript, por lo que el "prompt anterior" que el transcript contiene es ese último user.
- `lastAssistantResponse` = el último mensaje con `role: 'assistant'` en el transcript.
- `currentPrompt` = `event.prompt` del payload.

**Por qué:** El handler es orquestación pura; el extractor es quien sabe leer el formato JSONL. Mover la selección al extractor evita que el handler conozca el formato del transcript y mantiene la regla PKA "dependencias solo hacia el dominio". Además, centraliza los cambios de formato del transcript en un solo archivo.

**Alternativa considerada:** Hacer la selección en el handler con `messages.filter().at(-1)`. Descartada: acopla el handler al formato del transcript y duplica la lógica con `extractLastNMessages`.

### D-2: System prompt `VOICE_ASSISTANT_SYSTEM_PROMPT` reformulado para apuntar al tercer mensaje

Texto actual:
```
Eres la voz del asistente Smart Code Proxy. Responde al último mensaje
del usuario en una sola oración breve y natural en español, confirmando
lo que vas a hacer. Sin puntos al final. Sin markdown.
```

Texto nuevo:
```
Eres la voz del asistente Smart Code Proxy. Recibirás tres mensajes:
la petición anterior del usuario, tu última respuesta, y la nueva
petición del usuario. Responde SOLO a la nueva petición (la tercera)
en una sola oración breve y natural en español, confirmando que
procederás a investigar o ejecutar lo solicitado. Sin puntos al final.
Sin markdown.
```

**Por qué:** Con la tríada `user / assistant / user`, el LLM no puede saber a cuál "responder" sin instrucción explícita. El system prompt debe guiar el foco al tercer mensaje.

**Alternativa considerada:** Mantener el system prompt actual y añadir una marca tipo `[NUEVA PETICIÓN]:` al prompt actual. Descartada: depende de que el LLM lea correctamente la marca, y obliga al extractor a formatear texto en lugar de devolver datos estructurados.

### D-3: `speakAsync` discrimina por `mode` para enrutar a la tríada o a "últimos N"

```ts
const messages = mode === 'prompt'
  ? await this.extractUserPromptContext(event)
  : await this.extractContext(event.transcriptPath);
```

`extractUserPromptContext` es un helper nuevo del handler que llama al método nuevo del extractor y mapea el resultado a `SessionMessage[]` (lista de 0-3 elementos). Si el resultado tiene menos de 3 elementos, se devuelve la lista tal cual; `generateSpeechText` ya maneja el caso `messages.length === 0` con `no-messages` fallback, y los casos de 1-2 mensajes caen al system prompt sin romperse.

**Por qué:** Es un punto único de bifurcación. Mantiene la firma de `generateSpeechText` y `speakAsync` estables, y deja una única decisión arquitectónica visible.

**Alternativa considerada:** Pasar el contexto ya formateado desde `executeAsync` directamente a `generateSpeechText`. Descartada: añade un parámetro opcional a `generateSpeechText` y rompe la simetría con la rama `summary`.

### D-4: Caso "sesión nueva" (transcript vacío) — fallback silencioso al mensaje genérico

Cuando `previousUserMessage` y `lastAssistantResponse` son `undefined`, `extractUserPromptContext` devuelve una lista con un único `SessionMessage` `{ role: 'user', text: currentPrompt }`. El system prompt sigue siendo válido (responde al único mensaje user) y el LLM puede generar una locución honesta ("voy a investigar X"). Si la llamada a OpenRouter falla, se reproduce `FALLBACK_SPEECH.UserPromptSubmit` ("Solicitud recibida. Procesando con Claude.").

**Por qué:** Es el comportamiento que ya existe para `messages.length === 0`; no se introduce un nuevo camino de fallo, solo se documenta la diferencia entre "transcript vacío" (1 mensaje) y "fallo total" (0 mensajes). En la práctica, ambos casos se manejan sin cambios de código.

**Alternativa considerada:** Lanzar un error explícito en sesión nueva y tratarlo como un caso especial. Descartada: complica el flujo con un camino de error que ya está cubierto por el fallback genérico.

### D-5: El extractor usa una ventana de 10 mensajes para garantizar cobertura

`extractUserPromptSubmitContext` lee con `extractLastNMessages(path, 10)` y filtra por rol. Diez es un límite arbitrario pero suficiente: en un turno típico hay 1-4 mensajes visibles (user → assistant → tool_use → tool_result → assistant final). 10 cubre turnos con muchas tools sin penalizar el costo de I/O.

**Por qué:** El transcript puede contener entradas "sistema" intercaladas (system reminders, tool results) que el filtro por rol ignora, así que la ventana debe ser generosa.

**Alternativa considerada:** Hacer dos lecturas del transcript con ventanas más pequeñas. Descartada: duplica I/O y el costo de abrir/leer el archivo JSONL es despreciable para 10 líneas.

## Risks / Trade-offs

- **[Riesgo] El LLM ignora el system prompt y responde al primer mensaje user (el prompt anterior).** → Mitigación: el system prompt es explícito sobre "responder SOLO al tercer mensaje"; los tests del handler validan el array `chatHistory` enviado a fetch para evitar regresiones silenciosas. Si el modelo elegido (`poolside/laguna-xs.2:free`) no respeta la instrucción, se considerará cambiar de modelo o añadir un sufijo explícito al prompt actual en una iteración posterior.

- **[Riesgo] El transcript tiene muchos `assistant` consecutivos y el "último assistant" no es realmente la respuesta final al turno anterior.** → Mitigación: el filtro `filter(m => m.role === 'assistant').at(-1)` toma el último. Si hay bloques `tool_use` + `tool_result` + `assistant` final, el filtro ya aísla el último assistant. Documentado en el helper.

- **[Riesgo] Cambio de comportamiento perceptible para el usuario: ahora oye "voy a X" en vez de "ya he hecho X".** → Mitigación: el sistema reproduce el `mode='summary'` en `Stop`, donde sí se confirma lo hecho. El `mode='prompt'` debe anunciar intención, no logro. El system prompt lo explicita.

- **[Riesgo] Tests existentes de `extractLastNMessages` no cubren la nueva tríada.** → Mitigación: añadir tests dedicados para `extractUserPromptSubmitContext` (transcript con 0, 1, 2 y 5 turnos) en `tests/2-services/tts/transcript-extractor.test.ts`.

- **[Trade-off] Se añade un método al puerto `IContextExtractor`.** → Es una adición, no una modificación, así que no rompe implementaciones alternativas. El handler usa el método nuevo solo en `mode='prompt'`.

- **[Trade-off] El system prompt reformulado es más largo y explícito.** → Consume ~30 tokens más por llamada. Coste despreciable frente a los 512 de `max_tokens`.

## Migration Plan

No aplica: el cambio es interno, sin migraciones de datos, de base de datos, ni de configuración. La feature ya está en producción y la modificación se aplica de forma transparente.

Rollback: si el nuevo comportamiento resulta problemático, basta con revertir el commit. El puerto `IContextExtractor` mantiene `extractLastNMessages` intacto, así que el flujo `summary` no se ve afectado por un rollback parcial.

## Open Questions

- ¿Conviene añadir `TTS_PROMPT_CONTEXT_N` como variable de entorno para ajustar la ventana de 10 mensajes, o mantenerla hardcodeada? Pendiente: por ahora se mantiene hardcodeada por parsimonia (§2 Simplicity First de `CLAUDE.md`).
- ¿El modelo `poolside/laguna-xs.2:free` respeta correctamente la instrucción "responder SOLO al tercer mensaje" en español? Esto se validará empíricamente con un test de integración (`tests/scripting/headless-tts-*.test.ts`).
