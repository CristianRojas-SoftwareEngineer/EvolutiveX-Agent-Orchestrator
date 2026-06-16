## Context

`TranscriptContextExtractor.extractLastNMessages` lee el JSONL de transcript que Claude Code escribe en `~/.claude/projects/`. El extractor asume que `message.content` siempre es `Array<{type, text}>`, pero Claude Code escribe `content` como string plano en los mensajes de usuario y como array de bloques en los mensajes de asistente.

El filtro `!Array.isArray(row.message?.content)` descarta silenciosamente todos los mensajes de usuario, dejando el array de contexto vacío o solo con mensajes de asistente. Al llegar vacío a `generateSpeechText`, se activa el fallback inmediatamente sin llamar al LLM.

## Goals / Non-Goals

**Goals:**
- Que el extractor reconozca `content` como string y lo use directamente como texto del mensaje.
- Que el extractor siga manejando `content` como array, filtrando bloques `type === 'text'`.
- Cubrir el caso con un test unitario.

**Non-Goals:**
- Cambiar la interfaz `IContextExtractor` ni los tipos de dominio.
- Procesar bloques `thinking` o `tool_use` del asistente.

## Decisions

**Normalizar content en el punto de lectura** — en lugar de ramificar la lógica en capas superiores, el extractor normaliza `content` a string internamente:

```
if typeof content === 'string' → usarlo como text directamente
if Array.isArray(content)      → filtrar bloques type==='text', unir con espacio
else                           → ignorar línea
```

Alternativa descartada: cambiar la interfaz para devolver `content` crudo y que el caller lo normalice. Añade complejidad innecesaria — la normalización pertenece al adapter, no al handler.

## Risks / Trade-offs

- Si Claude Code en alguna versión futura cambia el formato, el extractor seguirá funcionando mientras `content` sea string o array de texto.
- No hay riesgo de regresión en mensajes de asistente: el path de array ya funciona y no se toca su lógica central, solo se agrega el branch de string.
