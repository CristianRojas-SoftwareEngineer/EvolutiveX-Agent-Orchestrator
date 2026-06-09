## 1. Corrección del extractor

- [x] 1.1 Modificar `TranscriptContextExtractor.extractLastNMessages` en `src/2-services/tts/transcript-extractor.service.ts` para normalizar `content`: si es string usarlo directamente; si es array filtrar bloques `type === 'text'`; en otro caso ignorar la línea.

## 2. Tests

- [x] 2.1 Añadir caso de test en `tests/` que cubra un transcript JSONL con mensajes de usuario con `content` string y verifique que el extractor los incluye en el resultado.
- [x] 2.2 Verificar que los tests existentes siguen pasando: `npm run test:quick`.
