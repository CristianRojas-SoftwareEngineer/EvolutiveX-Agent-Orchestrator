## Context

`PiperSidecarService` llama directamente a `spawn` de `node:child_process` sin seam de inyección, lo que obliga a los tests a levantar procesos reales via wrapper `.cmd` + node en Windows. Esto introduce no-determinismo en el orden de eventos `stdout`/`close`, razón por la que los tests 3, 4 y 5 fueron relajados a verificaciones permisivas. Paralelamente, el test FIFO lee `meta.json` desde una ruta incorrecta (`path.dirname(tempSessionsDir)/sessions/<id>`), lo que produce falsos PASS cuando quedan datos rancios en esa ruta de corridas anteriores; el `sessionId` hardcodeado amplifica el problema. El `afterAll` llama `fs.rm` sin esperar `flush()`, produciendo ENOTEMPTY bajo paralelismo de Vitest. El hook `onClose` de `app.ts` tampoco llama `flush()` tras cerrar workflows huérfanos.

## Goals / Non-Goals

**Goals:**
- Añadir seam `spawnFn` inyectable en `PiperSidecarService` para tests deterministas sin procesos reales.
- Corregir el parser de stdout con `while` y añadir handler EPIPE silencioso en stdin.
- Re-endurecer los 3 tests con stub de `ChildProcess` y aseveraciones exactas sobre `reason`.
- Corregir la ruta de lectura del test FIFO, usar `sessionId` único, y llamar `flush()` en `afterAll`.
- Añadir `flush()` en el `onClose` de `app.ts` para durabilidad de shutdown.

**Non-Goals:**
- No cambiar el contrato observable del sidecar (`tts-hooks`).
- No modificar `scripting/install/features/voice.ts`.
- No añadir nueva capacidad de síntesis o fallback de audio.

## Decisions

### D1 — Seam de inyección de spawn: constructor vs. parámetro de método

`spawnFn` se inyecta en el **constructor** como `opts.spawnFn?: SpawnFn`. Esto mantiene la interfaz pública `speak()` sin cambios y el seam queda en un único punto de configuración. El método `invokeSidecar` usa `this.spawnFn` en lugar del `spawn` importado. En producción el valor por defecto es el `spawn` real.

Alternativa descartada: parámetro de `invokeSidecar` — rompería la firma interna y requeriría pasar el argumento por toda la cadena `speak → invokeSidecar`.

```typescript
type SpawnFn = typeof import('node:child_process').spawn;

constructor(opts: { timeoutMs?: number; logger?: Logger; spawnFn?: SpawnFn } = {}) {
  this.spawnFn = opts.spawnFn ?? spawn;
  // ...
}
```

### D2 — Stub de ChildProcess en tests

Los tests re-endurecidos crean un stub mínimo usando `EventEmitter` + `PassThrough` streams. El stub expone `stdin`, `stdout`, `stderr`, `kill()` y `killed`. Una función helper `makeChildStub(response: string)` encapsula la creación y programa la emisión del `response` al stdout cuando stdin termina (`'finish'`), seguido de `emit('close', 0)`. El `spawnFn` mockeado devuelve ese stub.

```typescript
function makeChildStub(stdoutResponse: string): { child: ChildProcess; spawnFn: SpawnFn } {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const child = Object.assign(emitter, { stdin, stdout, stderr, killed: false, kill: vi.fn() }) as unknown as ChildProcess;
  stdin.on('finish', () => { stdout.push(stdoutResponse); stdout.push(null); emitter.emit('close', 0); });
  const spawnFn = vi.fn().mockReturnValue(child) as unknown as SpawnFn;
  return { child, spawnFn };
}
```

Para el test de timeout: el stub no emite nada, y se pasa `timeoutMs: 50` al servicio.

### D3 — Parser stdout: bucle `while`

Reemplaza el `if (nl >= 0)` actual:

```typescript
// antes
const nl = stdoutBuf.indexOf('\n');
if (nl >= 0) { /* una sola línea */ }

// después
let nl: number;
while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
  const line = stdoutBuf.slice(0, nl).trim();
  stdoutBuf = stdoutBuf.slice(nl + 1);
  if (!line) continue;
  // parse JSON, settle resolve/reject, break
}
```

El `break` tras `settle(resolve)` y `settle(reject)` impide procesar líneas adicionales una vez resuelta la promesa.

### D4 — Handler EPIPE silencioso en stdin

```typescript
child.stdin?.on('error', () => {
  // EPIPE silencioso: el sidecar cerró el pipe antes de que terminemos de escribir.
});
```

Se añade inmediatamente después de crear el child. No afecta la lógica de settle/reject porque los errores de stdin no propagan a la promesa.

### D5 — Test FIFO: ruta y sessionId únicos

```typescript
// antes
const sessionId = 'test-fifo-fallback';
const sessionDir = path.join(path.dirname(tempSessionsDir), 'sessions', sessionId);

// después
const sessionId = 'test-fifo-fallback-' + Date.now();
const sessionDir = path.join(tempSessionsDir, sessionId);
```

`tempSessionsDir` es el `auditBaseDir` pasado a `createProxyDependencies`. `SessionPersistence` resuelve rutas como `path.resolve(rootDir, '<sessionId>/workflows/...')`, por lo que el directorio correcto es `<tempSessionsDir>/<sessionId>`.

### D6 — flush en afterAll y onClose

En el test FIFO: `sessionPersistence` se extrae del objeto `deps` fuera de `beforeAll`:
```typescript
let sessionPersistence: { flush(): Promise<void> };
// en beforeAll: sessionPersistence = deps.sessionPersistence;
// en afterAll: await sessionPersistence.flush(); (antes de fs.rm)
```

En `app.ts`, tras el bucle de cierre de huérfanos:
```typescript
await deps.sessionPersistence.flush();
```

## Risks / Trade-offs

- **Stub vs. proceso real** → los tests re-endurecidos no ejercen el binario ni el wrapper de shell; esto es intencional (el comportamiento del binario ya está cubierto por los tests que usan `setupMockVendor` con proceso real). El riesgo de divergencia binario↔stub es aceptable dado que el contrato JSON por stdin/stdout está fijo en la spec.
- **`Date.now()` en sessionId** → colisiones extremadamente improbables bajo paralelismo normal de Vitest; si se necesitara mayor garantía, se puede usar `crypto.randomUUID()` en una iteración futura.
- **flush en onClose** → añade latencia de shutdown igual al tiempo de las escrituras pendientes (normalmente < 50 ms en SSD local); es un trade-off deliberado a favor de integridad de datos.

## Migration Plan

1. Editar `src/2-services/tts/piper-sidecar.service.ts`: añadir tipo `SpawnFn`, campo `spawnFn` en constructor, handler EPIPE, parser `while`.
2. Editar `tests/2-services/tts/piper-sidecar.service.test.ts`: añadir helper `makeChildStub`, re-endurecer tests 3, 4, 5.
3. Editar `tests/5-user-interfaces/fifo-pending-fallback.test.ts`: corregir `sessionId`, ruta `sessionDir`, exponer `sessionPersistence`, añadir `flush()` en `afterAll`.
4. Editar `src/app.ts`: añadir `await deps.sessionPersistence.flush()` en `onClose` tras el bucle de huérfanos.
5. Ejecutar suite completa (`npm test`) y verificar que todos los tests pasan sin `--no-parallel` ni retries.

Rollback: `git revert` del commit del archive si la suite no cierra en verde.
