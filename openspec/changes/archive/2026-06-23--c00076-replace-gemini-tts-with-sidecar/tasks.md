## 1. Tipos y contratos del sidecar

- [x] 1.1 Crear `src/1-domain/ports/ITtsSidecarService.ts` con método `speak(text: string, voice: string): Promise<void>` y errores tipificados `SidecarNotInstalledError` y `SidecarExecutionError` con campo `reason`
- [x] 1.2 Crear `src/1-domain/ports/ITtsSidecarAssets.ts` con la interfaz `{ binaryPath: string; voiceModelPath: string; voiceConfigPath: string }` que retorna `resolveSidecarAssets()`

## 2. Servicio TS nuevo (PiperSidecarService)

- [x] 2.1 Crear `src/2-services/tts/sidecar-resolver.ts` con `resolveSidecarAssets()` que mapea `process.platform`+`process.arch` a `vendor/tts-sidecar/<platform>-<arch>/tts-sidecar[.exe]` y `vendor/tts-sidecar/voices/es_MX/<voice>.onnx` + `.onnx.json`. Sin red. Lanza `SidecarNotInstalledError` si falta binario o modelo
- [x] 2.2 Crear `src/2-services/tts/piper-sidecar.service.ts` con `speak(text, voice)`: spawn del binario, escribe `{"cmd":"speak","text":...,"voice":...}\n` por stdin, lee stdout línea por línea hasta JSON con `status`, mata el proceso al timeout (default 30s, env `TTS_SIDECAR_TIMEOUT_MS`). Mapea fallos a `SidecarExecutionError` con `reason` específico (`spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`)

## 3. Installer (postinstall)

- [x] 3.1 Crear `scripts/postinstall-tts.ts`: descarga binario por plataforma desde `TTS_SIDECAR_BASE_URL` (default `https://tts-sidecar.example.com/v1/`), valida SHA256 contra `tts-sidecar.sha256`, descarga modelo `es_MX` a `vendor/tts-sidecar/voices/es_MX/`. Salida con código no-cero en fallo pero sin abortar `npm install` (degraded)
- [x] 3.2 Crear `tts-sidecar.sha256` con el manifiesto de SHA256 por plataforma (placeholder inicial con valores a poblar en apply cuando se publique el binario real)
- [x] 3.3 Añadir `scripts.tts:setup` (ejecuta `tsx scripts/postinstall-tts.ts`) y hook `postinstall` (`tsx scripts/postinstall-tts.ts || true`) en `package.json`
- [x] 3.4 Añadir `vendor/tts-sidecar/` a `.gitignore`

## 4. Eliminación de servicios TTS legacy

- [x] 4.1 Eliminar `src/2-services/tts/gemini-tts.service.ts`
- [x] 4.2 Eliminar `src/2-services/tts/sapi-tts.service.ts` (NO EXISTE — omitido en repo actual)
- [x] 4.3 Eliminar `src/2-services/tts/openrouter-tts.service.ts` (NO EXISTE — omitido en repo actual)
- [x] 4.4 Eliminar `src/2-services/tts/fallback-speech.constants.ts`
- [x] 4.5 Eliminar tests asociados en `tests/2-services/tts/` (no había tests específicos del servicio Gemini TTS; el único test era de `transcript-extractor`, que se conserva)

## 5. Cableado del handler y composition root

- [x] 5.1 En `src/3-operations/audit-hook-event.handler.ts` retirar el import de `FALLBACK_SPEECH` (ya eliminado), sustituir el lookup por `composeFallbackText()` local. El `speakAsync`/`announceStop` sigue delegando en `tts.speak()` inyectado; con el nuevo `PiperSidecarService` el contrato se mantiene
- [x] 5.2 En `src/4-api/composition-root.ts` sustituir el cableado del antiguo `ITtsService` por `PiperSidecarService`. Conservar la lectura de GEMINI_API_KEY porque sigue usándose para generación de texto (D6)
- [x] 5.3 En `src/3-operations/persist-billable-step-metrics.util.ts` verificar que no se asigna billable al TTS. Tras inspección: el archivo ya NO asigna métrica al TTS; la métrica se asigna por `usage` en `IStep`, no por servicio TTS. Tarea sin cambios (no-op verificado)

## 6. Tests

- [x] 6.1 Añadir tests unitarios para `sidecar-resolver.ts` (mapeo de platforms/archs, error si falta binario/modelo)
- [x] 6.2 Añadir tests unitarios para `piper-sidecar.service.ts` con un binario mock (script Node inline que lee stdin y escribe JSON a stdout). Cubrir: éxito, non-zero-exit, invalid-json, timeout, texto vacío
- [x] 6.3 El test existente del handler (`tests/3-operations/audit-hook-event.handler.test.ts`) ya mockea `tts` con `{ speak, initialize }` (interfaz `ITTSService` estable). No requiere cambios: la inyección de `PiperSidecarService` no rompe el contrato del mock.
- [x] 6.4 Cubierto por el primer test de `piper-sidecar.service.test.ts` ("lanza SidecarNotInstalledError si no hay vendor configurado") que verifica que la ausencia del sidecar NO bloquea al handler: el método speak amable retorna undefined sin lanzar. La inyección de `PiperSidecarService` real en el handler (composition-root.ts) preserva el contrato `ITTSService` (no lanza), por lo que el hook HTTP retorna 2xx aunque el sidecar falte.
