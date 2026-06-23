## 1. PiperSidecarService — seam de spawn, EPIPE y parser while

- [x] 1.1 Añadir tipo `SpawnFn` y campo `private readonly spawnFn: SpawnFn` en `src/2-services/tts/piper-sidecar.service.ts`; agregar `spawnFn?: SpawnFn` a las opciones del constructor con valor por defecto `spawn` de `node:child_process` ~doing
- [x] 1.2 Reemplazar la llamada directa a `spawn(...)` en `invokeSidecar` por `this.spawnFn(...)` ~doing
- [x] 1.3 Añadir `child.stdin?.on('error', () => {})` inmediatamente después de crear el child para absorber silenciosamente errores EPIPE ~doing
- [x] 1.4 Reemplazar el bloque `if (nl >= 0)` del handler `child.stdout?.on('data', ...)` por un bucle `while ((nl = stdoutBuf.indexOf('\n')) >= 0)` con `break` tras cada `settle` ~doing

## 2. Tests de PiperSidecarService — re-endurecimiento con stub

- [x] 2.1 Añadir helper `makeChildStub(stdoutResponse: string)` en `tests/2-services/tts/piper-sidecar.service.test.ts` que crea un `ChildProcess` stub usando `EventEmitter` + `PassThrough` streams y devuelve `{ child, spawnFn }` donde `spawnFn` es un `vi.fn()` que retorna el child; el stub emite `stdoutResponse` en stdout y `emit('close', 0)` cuando stdin termina ~doing
- [x] 2.2 Re-endurecer test 3 ("speak amable omite audio sin lanzar cuando el sidecar falla"): reemplazar `setupMockVendor` por `makeChildStub('{"status":"error","message":"voice-not-found"}\n')`; eliminar el comentario de no-determinismo; añadir `expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'non-zero-exit' }), expect.any(String))` ~doing
- [x] 2.3 Re-endurecer test 4 ("speak amable maneja JSON inválido del sidecar sin lanzar"): reemplazar `setupMockVendor` por `makeChildStub('esto no es json\n')`; añadir `expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'invalid-json' }), expect.any(String))` ~doing
- [x] 2.4 Re-endurecer test 5 ("speak amable maneja timeout del sidecar sin lanzar"): reemplazar `setupMockVendor` por un stub que no emite nada (stdin `'finish'` no hace nada); pasar `timeoutMs: 50` al servicio; añadir `expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'timeout' }), expect.any(String))` ~doing

## 3. Test FIFO — ruta correcta, sessionId único y flush en teardown

- [x] 3.1 Declarar `let sessionPersistence: { flush(): Promise<void> }` en el scope del `describe` en `tests/5-user-interfaces/fifo-pending-fallback.test.ts` y asignarlo desde `deps.sessionPersistence` en `beforeAll`
- [x] 3.2 Cambiar `sessionId` de `'test-fifo-fallback'` a `'test-fifo-fallback-' + Date.now()` en el cuerpo del test `it`
- [x] 3.3 Corregir `sessionDir` de `path.join(path.dirname(tempSessionsDir), 'sessions', sessionId)` a `path.join(tempSessionsDir, sessionId)`
- [x] 3.4 Añadir `await sessionPersistence.flush()` en `afterAll` antes de la llamada a `fs.rm(tempSessionsDir, ...)`

- [x] 3.5 Corregir `sessionRoot` en `tests/5-user-interfaces/gzip-decompression.test.ts` de `path.join(path.dirname(tempSessionsDir), 'sessions', 'test-gzip')` a `path.join(tempSessionsDir, 'test-gzip')` (mismo bug de ruta que el test FIFO)
- [x] 3.6 Corregir `sessionDir` en `tests/5-user-interfaces/agent-headers-correlation.test.ts` de `path.join(path.dirname(tempSessionsDir), 'sessions', 'test-agent-headers')` a `path.join(tempSessionsDir, 'test-agent-headers')`; añadir `sessionPersistence` y `flush()` antes de la aserción de existencia del directorio (mismo bug de ruta + flush que el test FIFO)

## 4. app.ts — flush en onClose

- [x] 4.1 Añadir `await deps.sessionPersistence.flush()` en el hook `onClose` de `src/app.ts` tras el bucle `for (const workflow of openWorkflows)` y el `if (openWorkflows.length > 0)` log

## 5. Verificación final

- [x] 5.1 Ejecutar `npm test` sin `--no-parallel` ni retries y confirmar que todos los tests pasan (suite en verde)
