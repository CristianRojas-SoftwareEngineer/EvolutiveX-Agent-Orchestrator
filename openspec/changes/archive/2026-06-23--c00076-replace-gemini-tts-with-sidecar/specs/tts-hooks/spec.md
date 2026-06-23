## MODIFIED Requirements

### Requirement: Provider dedicado de inferencia TTS (OpenRouter → Gemini)

**Reason:** La generación y síntesis de voz SHALL migrar de la API Gemini TTS (modelos `gemini-2.5-flash-preview-tts` y `gemini-3.1-flash-tts-preview`, free tier de 10 RPD ≈ 5 turnos útiles) a un sidecar local multiplataforma. El free tier de Gemini se agota en pocos turnos y deja al usuario sin voz; el sidecar local elimina la dependencia de cuota y de red.

**Migration:** Los servicios `gemini-tts.service.ts`, `sapi-tts.service.ts`, `openrouter-tts.service.ts` se eliminan del código. El campo `GEMINI_API_KEY` deja de leerse para fines de TTS (puede seguir usándose para otros fines del gateway, pero el TTS ya no lo requiere). El nuevo `PiperSidecarService` reemplaza la ruta de síntesis. Si el sidecar no está disponible, el handler omite audio y loggea `[TTS-SIDE]` con `reason`; **no** se reintroducen llamadas a Gemini, OpenRouter ni SAPI como fallback secundario.

El sistema SHALL componer un texto (de intención en `UserPromptSubmit` o de resumen en `Stop`) usando el provider activo de la sesión o el provider Gemini cuando esté disponible para esa tarea, y SHALL enviar ese texto al sidecar local para su síntesis y reproducción. La llamada al sidecar SHALL ser bloqueante desde el punto de vista del handler de hook: el handler SHALL esperar `{"status":"ok"}` por stdout antes de retornar, garantizando que la voz se reproduzca completamente antes de que el hook responda al cliente.

El sidecar SHALL consumir texto en español y SHALL reproducirlo con la voz `es_MX` (México, español latino neutro). El contrato entre el gateway y el sidecar SHALL ser STDIN/STDOUT con un único mensaje JSON por comando: `{"cmd":"speak","text":"...","voice":"es_MX"}` y respuesta `{"status":"ok"}` o `{"status":"error","message":"..."}`. El gateway SHALL **NO** depender de ninguna API de audio del SO (no usa PowerShell `Media.SoundPlayer`, ni `afplay`, ni `aplay`/`paplay`); toda la reproducción queda encapsulada en el sidecar.

Si el binario del sidecar no está presente en `vendor/tts-sidecar/<platform>-<arch>/`, el sistema SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"` y SHALL **NO** intentar ninguna síntesis. Si el binario está presente pero el proceso falla (exit code no-cero, timeout, JSON malformado), el sistema SHALL emitir `[TTS-SIDE]` con el `reason` correspondiente (`spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`) y SHALL **NO** intentar ningún fallback a otro motor.

#### Scenario: Síntesis exitosa con sidecar instalado

- **GIVEN** que el binario `tts-sidecar` está presente en `vendor/tts-sidecar/<platform>-<arch>/`
- **AND** el modelo `es_MX` está presente en `vendor/tts-sidecar/voices/es_MX/`
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL enviar `{"cmd":"speak","text":"<resumen>","voice":"es_MX"}` por stdin al sidecar
- **AND** SHALL esperar `{"status":"ok"}` por stdout antes de continuar
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false` y `textPreview` del texto reproducido

#### Scenario: Sidecar ausente omite audio sin romper el hook

- **GIVEN** que el binario `tts-sidecar` **NO** está presente en disco
- **WHEN** el handler procesa un evento `Stop` o `UserPromptSubmit`
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"`
- **AND** SHALL continuar el procesamiento del hook sin intentar síntesis
- **AND** SHALL retornar una respuesta HTTP 2xx al cliente

#### Scenario: Fallo del sidecar se reporta sin caer a otro motor

- **GIVEN** que el sidecar está presente pero el proceso termina con exit code no-cero
- **WHEN** el handler procesa un evento
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "non-zero-exit"` (o `spawn-failed`, `timeout`, `invalid-json` según el caso)
- **AND** SHALL **NO** intentar llamar a Gemini, OpenRouter ni SAPI como fallback
- **AND** SHALL continuar el procesamiento del hook

#### Scenario: Sin dependencia de claves de API externas

- **GIVEN** que `routing/providers/gemini/secrets.json` no existe o no contiene clave
- **WHEN** el handler procesa un evento
- **THEN** SHALL invocar el sidecar local normalmente (el sidecar no requiere credenciales)
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`

### Requirement: Robustez en la Inferencia y Reproducción de Audio

**Reason:** El dominio de fallo cambia: ya no hay "429 de Gemini" ni "timeout HTTP", sino "binario no instalado", "proceso muere", "JSON malformado". El comportamiento observable (la voz no suena, el hook no se rompe) es el mismo, pero los `reason` y la trazabilidad deben reflejar el nuevo dominio.

**Migration:** El sistema SHALL seguir garantizando que cualquier fallo de síntesis NO afecta el ciclo de vida normal de Claude Code ni bloquea las respuestas del proxy. Cada fallo SHALL ser registrado como `[TTS-SIDE]` con `reason` identificando la causa (`sidecar-missing`, `spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`, `exception`). El handler SHALL esperar al cierre del sidecar (o al timeout configurado) antes de retornar; si el sidecar cuelga, el handler SHALL terminar la espera con un error tipificado y continuar.

#### Scenario: Falla de spawn por binario ausente no afecta el hook

- **GIVEN** que el binario del sidecar no está presente en disco
- **WHEN** se procesa un hook `Stop`
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"` o `spawn-failed`
- **AND** SHALL continuar el procesamiento del hook retornando HTTP 2xx

#### Scenario: Timeout del sidecar libera al handler

- **GIVEN** que el sidecar no responde dentro del timeout configurado (por defecto 30s)
- **WHEN** se procesa un hook `Stop`
- **THEN** SHALL matar el proceso del sidecar
- **AND** SHALL emitir `[TTS-SIDE]` con `reason: "timeout"`
- **AND** SHALL continuar el procesamiento del hook sin propagar el error

### Requirement: Logging estructurado de fallback y mensaje dinámico

**Reason:** El log se reformula para reflejar el dominio del sidecar. Se introduce `[TTS-SIDE]` para fallos del sidecar (reemplaza el rol que tenía `[TTS-FALLBACK]`); `[TTS-SPEECH]` se conserva para síntesis exitosas. Los `reason` válidos cambian: ya no hay `no-gemini-key` ni `http-NNN`; los nuevos son los del sidecar (`sidecar-missing`, `spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`, `exception`).

**Migration:** Cada activación de fallback SHALL emitir `[TTS-SIDE]` con `eventName`, `usedFallback: true`, `reason` (uno de los nuevos valores) y `fallbackText` (texto que se habría sintetizado, conservado para diagnóstico). Cada mensaje dinámico SHALL emitir `[TTS-SPEECH]` con `eventName`, `usedFallback: false` y `textPreview` (máximo 120 caracteres). La etiqueta `[TTS-FALLBACK]` queda retirada del código y del log.

#### Scenario: Sidecar ausente emite log tipificado

- **GIVEN** que el binario del sidecar no está presente
- **WHEN** el handler procesa un evento
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"` (o `spawn-failed`)
- **AND** SHALL escribir el log en `server/logs.jsonl` antes de retornar la respuesta del hook

#### Scenario: Síntesis exitosa emite TTS-SPEECH con vista previa

- **GIVEN** que el sidecar responde `{"status":"ok"}` al comando `speak`
- **WHEN** el handler finaliza la síntesis
- **THEN** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`
- **AND** el campo `textPreview` SHALL contener los primeros 120 caracteres del texto reproducido
