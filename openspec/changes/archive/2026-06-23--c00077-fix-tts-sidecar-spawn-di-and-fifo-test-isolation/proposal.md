## Why

El delta archivado `c00076-replace-gemini-tts-with-sidecar` dejó dos deudas técnicas pendientes: los tests del `PiperSidecarService` fueron relajados para tolerar el no-determinismo de Windows (wrapper `.cmd` + node sobre proceso real), y el test FIFO acumula un falso PASS porque lee desde una ruta hardcodeada errónea más una race condition ENOTEMPTY bajo paralelismo de Vitest. Ambos problemas degradan la confianza en la suite y generan flakiness que contaminaría el gate `verify` de futuros deltas.

## What Changes

- `src/2-services/tts/piper-sidecar.service.ts`: se añade una factory `spawnFn` inyectable en el constructor (valor por defecto: `spawn` de `node:child_process`), se agrega un handler `child.stdin.on('error', () => {})` para absorber silenciosamente EPIPE, y el parser de stdout pasa de `if (nl >= 0)` a un bucle `while` para manejar correctamente múltiples líneas en un mismo chunk.
- `tests/2-services/tts/piper-sidecar.service.test.ts`: los tests 3, 4 y 5 se re-endurecen usando `spawnFn` mockeado con un stub de `ChildProcess` controlable y aseveraciones exactas sobre el campo `reason` del log (`'non-zero-exit'`, `'invalid-json'`, `'timeout'`).
- `tests/5-user-interfaces/fifo-pending-fallback.test.ts`: se corrige la ruta de lectura de `meta.json` a `path.join(tempSessionsDir, sessionId)`, se usa un `sessionId` único por corrida, y se llama `await sessionPersistence.flush()` en `afterAll` antes de `fs.rm` para eliminar la race condition de teardown.
- `src/app.ts`: se agrega `await deps.sessionPersistence.flush()` en el hook `onClose` tras cerrar los workflows huérfanos, asegurando que todas las escrituras encoladas se completen antes de que el proceso salga.

## Capabilities

### Non-canonical change

- `piper-sidecar-spawn-di`: seam de inyección de `spawn`, handler EPIPE y parser `while` son mejoras internas de `PiperSidecarService` sin requisito en `openspec/specs/`; no cambian el contrato observable del sidecar definido en `tts-hooks`.
- `piper-sidecar-tests-hardening`: los tests de `PiperSidecarService` son artefactos de test sin contrapartida canónica; su re-endurecimiento no modifica ningún spec.
- `fifo-test-isolation`: la corrección de ruta, UUID único y `flush()` en el test FIFO es un fix de aislamiento de test sin requisito en `openspec/specs/`.
- `app-onclose-flush`: el `flush()` en `onClose` es una mejora de durabilidad de shutdown sin requisito en `openspec/specs/`; el comportamiento observable del sidecar y la sesión no cambian.

## Impact

- **Código fuente**: `src/2-services/tts/piper-sidecar.service.ts`, `src/app.ts`.
- **Tests**: `tests/2-services/tts/piper-sidecar.service.test.ts`, `tests/5-user-interfaces/fifo-pending-fallback.test.ts`.
- **Specs canónicos**: ninguno modificado.
- **APIs / dependencias externas**: ninguna.
