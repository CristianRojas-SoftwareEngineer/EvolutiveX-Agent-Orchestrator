# Cómo funciona la reconstrucción SSE en Smart Code Proxy

Esta nota técnica explica por qué y cómo Smart Code Proxy reconstruye el mensaje final del asistente a partir de un stream SSE grabado, documenta la **fuente de bytes** (`sse.jsonl`, no `sse.txt`) y la constante `REPLAY_MODEL` para que nadie la "mejore" confundiéndola con una configuración real.

## Por qué reusar el SDK oficial

Los streams SSE de la API Messages de Anthropic emiten una secuencia de eventos tipados (`message_start`, `content_block_start`, `content_block_delta`, `message_delta`, `message_stop`, `ping`, etc.) que, fusionados, equivalen a la respuesta JSON que devolvería una llamada no-streaming. Implementar y mantener un parser propio implicaría replicar toda la lógica del SDK oficial para cada variación de `content_block` (texto, `tool_use`, `thinking`, imágenes), cada actualización de `usage`, y cada evento beta.

Smart Code Proxy toma un atajo: **reusa `@anthropic-ai/sdk` como parser**. El SDK ya sabe fusionar eventos SSE y exponer el mensaje final vía `stream.finalMessage()`.

## Fuente de bytes SSE: `sse.jsonl`, no `sse.txt`

La reconstrucción **siempre** lee `steps/NNN/response/sse.jsonl`, nunca `sse.txt`. Razones:

1. **`sse.jsonl` es determinista.** Se escribe vía `AuditWriterService.appendSseLine`, que usa `fsSync.appendFileSync` en el mismo callback `stream.on('data')`. El orden de líneas coincide 1:1 con el orden en que los chunks llegaron del upstream.
2. **`sse.txt` es un raw dump de depuración.** Se escribe vía `AuditWriterService.appendSseRawChunk` (también síncrono, pero semánticamente opcional: está sujeto a `MAX_AUDIT_SSE_RAW_BYTES`, puede truncarse y no afecta a la reconstrucción).
3. **Desacoplamiento de fuentes.** `appendSseRawChunk` podría reordenar eventos bajo alta carga (uso de `fs.appendFile` asíncrono); `sse.jsonl` usa escritura síncrona garantizando orden. El parser del SDK requiere eventos en orden estricto.

### Reensamblado del wire-format desde `sse.jsonl`

`SseReconstructService.reassembleSseBytesFromJsonl` convierte las entradas `{i, ts, line}` en un stream SSE válido:

- Cada `line` se emite tal cual (ya viene trimada sin `\r` ni newline).
- Cuando aparece un `event:` se cierra el bloque anterior con línea en blanco.
- Cuando aparece un `data:` se cierra el bloque actual (regla de Anthropic: un `data:` por evento).
- Otros campos (`id:`, `retry:`, comentarios `:`) se agregan al bloque activo sin cerrarlo.
- El buffer termina con `\n\n` final.

El resultado es byte-equivalente a lo que habría emitido el upstream si no hubiese race alguna en el raw dump.

## Cómo funciona el `fetch` mockeado

El servicio `SseReconstructService` (`@c:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\src\2-services\sse-reconstruct.service.ts`) instancia un cliente de Anthropic con un `fetch` custom que devuelve un `Response` con los bytes reensamblados desde `sse.jsonl`:

```ts
const mockFetch = async () =>
  new Response(this.createSseWebReadableStream(sseBuffer), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

const client = new Anthropic({
  apiKey: 'sse-audit-replay',
  fetch: mockFetch,
  baseURL: REPLAY_BASE_URL,
});
```

El SDK llama internamente al `fetch` mockeado cuando se invoca `client.messages.stream(params)` o `client.beta.messages.stream(params)` (según auto-detección de beta). Los bytes reales nunca salen de disco, el `apiKey` es irrelevante, y la API remota nunca se toca.

## El rol de `REPLAY_MODEL`

El SDK exige un `params.model: Model | string & {}` en TypeScript. Para satisfacer esa firma, Smart Code Proxy define a nivel de módulo:

```ts
const REPLAY_MODEL = 'claude-sse-replay';
```

**Experimento realizado (21 Abr 2026) contra `@anthropic-ai/sdk` v0.89.0, 13/13 valores OK:**

| Valor                                                 | Resultado |
| ----------------------------------------------------- | --------- |
| `claude-sse-replay`                                   | OK        |
| `claude-3-5-sonnet-20241022`                          | OK        |
| `claude-sonnet-4-5`                                   | OK        |
| `not-a-real-model`                                    | OK        |
| `""` (string vacío)                                   | OK        |
| `"   "` (whitespace)                                  | OK        |
| `"weird !@#$ value"`                                  | OK        |
| `"modelo-á-β-🤖"`                                     | OK        |
| `"x"` (un carácter)                                   | OK        |
| `null`                                                | OK        |
| `undefined` (omitido)                                 | OK        |
| `client.beta.messages.stream` con `claude-sse-replay` | OK        |

**Conclusión:** el SDK **no valida `model` en runtime** cuando el `fetch` está mockeado; el valor es opaco. El string `'claude-sse-replay'` es solo una etiqueta autodescriptiva que deja claro al lector que no se trata de un modelo real.

**No cambiar por un nombre de modelo real:** induce a error al lector del código y no aporta nada funcional.

## Criterio de activación

La reconstrucción SSE se invoca automáticamente al cerrar un step terminal en:

- `agentic` con `stop_reason` ∈ {`end_turn`, `max_tokens`, `null`/error}.
- `side-request` con `stop_reason` terminal.

**No se invoca** para `client-preflight` (son interacciones no conversacionales sin mensaje de asistente que reconstruir).

## Auto-detección de modo Beta (Safeguard)

> **Nota:** Actualmente **no se utiliza** en la práctica con Claude Code, que opera en modo estable.

`SseReconstructService.computeUseBeta(originalUrl, headers)` devuelve `true` si:

- `originalUrl` contiene `beta=true`, o
- El request original traía el header `anthropic-beta`.

En cualquier otro caso usa `client.messages.stream()`. Esta decisión es **runtime-only** (no hay variable de configuración) y existe como **safeguard** para futura compatibilidad si Anthropic activa features beta.

## Qué hacer si el SDK futuro endurece la validación

Si una versión futura de `@anthropic-ai/sdk` empieza a rechazar strings arbitrarios en `params.model`, basta con editar la constante en `@c:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\src\2-services\sse-reconstruct.service.ts` para usar un nombre de modelo aceptado por esa versión. No es necesario exponer la decisión como variable de entorno: quien actualice el SDK puede ajustar la constante en la misma PR.

## Reconstrucción por Step

Cada step SSE ahora genera sus propios archivos de respuesta reconstruida:

```
steps/NNN/response/
  ├── sse.jsonl           # Eventos SSE crudos (existente)
  ├── sse.txt             # Raw dump de depuración (existente)
  ├── headers.json        # Headers de respuesta (existente)
  ├── body.json           # ✅ Mensaje reconstruido, pretty print (NUEVO)
  └── body.parsed.md      # ✅ Vista markdown semántica (NUEVO)
```

### Cómo funciona

1. **Al finalizar cada step SSE** (`stream.on('end')`), `AuditSseResponseHandler` invoca `ISseReconstructor.reconstructStepMessage(stepDir)`.

2. **El servicio `SseReconstructService`** lee `steps/NNN/response/sse.jsonl` y reconstruye el mensaje usando el SDK de Anthropic (mismo mecanismo que el turno completo).

3. **El mensaje reconstruido** se pasa a `IAuditWriter.writeStepResponseMarkdown(stepDir, message, context?)`, que genera:
   - `body.json` — mensaje completo en JSON (pretty print)
   - `body.parsed.md` — vista markdown semántica legible (enriquecida con `MarkdownRenderContext` si se proporciona: encabezados contextuales, blockquote metadata, TOC multi-step, detección de Skill)

### Reconstrucción del body top-level

`runReconstruction()` delega en `AuditWriterService.writeTopLevelMultiStepResponse(interactionDir, stepCount, context?)` para producir el `response/body.json` top-level. Este método:

- Copia la reconstrucción del **último step** como body top-level del turno
- No realiza una reconstrucción independiente del turno completo
- El body top-level es semánticamente equivalente a la respuesta final del asistente

### Best-effort

La reconstrucción por step es **best-effort**: si falla (por ejemplo, `sse.jsonl` corrupto o incompleto), se loggea el error pero el step continúa normalmente. Esto garantiza que un error en la reconstrucción no afecte el flujo principal del proxy.

### Detección de modo Beta por step (Safeguard)

> **Nota:** Actualmente **no se utiliza** en la práctica. Claude Code opera en modo estable (`client.messages.stream()`).

El servicio implementa detección de modo beta como **safeguard** para futura compatibilidad. El modo beta (`client.beta.messages.stream()`) expone características experimentales de Anthropic antes de su estabilización.

**¿Cuándo se activaría?**

- Si la URL contiene `beta=true`
- Si el request original incluye header `anthropic-beta`

**Implementación:**

- `runReconstruction()` guarda el flag en `headers.json` del step
- `reconstructStepMessage()` lo lee para decidir qué cliente SDK usar
- Por defecto es `false` (modo estable)

Esto garantiza que si Anthropic/Claude Code activan beta features en el futuro, la reconstrucción por step funcionará sin modificaciones de código.
