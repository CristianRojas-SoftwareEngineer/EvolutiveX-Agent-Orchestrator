## Why

El `TranscriptContextExtractor` descarta silenciosamente todos los mensajes de usuario del transcript JSONL de Claude Code porque asume que `content` es siempre un array de bloques, cuando en realidad Claude Code escribe `content` como string plano en los mensajes de usuario. El resultado es que el contexto extraído siempre llega vacío al LLM, forzando el uso de los mensajes de fallback genéricos en lugar de locuciones contextuales.

## What Changes

- Corregir `TranscriptContextExtractor.extractLastNMessages` para manejar `content` como string o como array `{type, text}[]`.
- Actualizar el test unitario (o añadir caso) que cubra mensajes con `content` string.

## Capabilities

### New Capabilities
<!-- ninguna -->

### Modified Capabilities
<!-- Sin cambios en requisitos de spec; la corrección hace cumplir el comportamiento ya especificado en tts-hooks -->

## Impact

- `src/2-services/tts/transcript-extractor.service.ts` (2-services)
- `tests/` — caso de test para content string
