## 1. Fix del clasificador

- [x] 1.1 En `classifyRequestBody` (`src/1-domain/services/request-classifier.service.ts`): reemplazar el check `str.includes('"tool_result"')` por el fast-path + confirmación semántica usando `extractToolResultIdsFromRequestBody(bodyBuffer).length > 0`

## 2. Tests

- [x] 2.1 Añadir test en `tests/1-domain/request-classifier.test.ts`: body con `tool_result` en mensaje histórico y último mensaje fresh con `tools` no vacío → debe clasificarse como `fresh` (no `continuation`)
- [x] 2.2 Añadir test: body con `tool_result` en mensaje histórico y último mensaje sin `tool_result`, sin `tools` → debe clasificarse como `preflight-warmup`
- [x] 2.3 Verificar que los tests existentes del clasificador siguen pasando sin cambios

## 3. Spec delta → spec principal

- [x] 3.1 Sincronizado mediante `/openspec-archive` (paso 4 del archivado promueve el delta a la spec principal sin necesidad de `/openspec-sync` por separado, evitando doble aplicación)

## 4. Verificación final

- [x] 4.1 `npm run typecheck` — sin errores
- [x] 4.2 `npm run lint` — sin errores
- [x] 4.3 `npm run test:unit` — todos los tests pasan, incluidos los nuevos de §2
