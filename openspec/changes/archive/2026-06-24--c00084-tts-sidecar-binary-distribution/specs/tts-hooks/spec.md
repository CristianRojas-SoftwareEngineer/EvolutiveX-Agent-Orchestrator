# Spec — Hooks de TTS y reproducción de audio (complementaria)

> Spec modificada por `c00084-tts-sidecar-binary-distribution`. Esta spec
> describe el comportamiento del sidecar TTS una vez instalado, en el
> contexto de los hooks de Claude Code. Es complementaria a
> `tts-sidecar-binary-distribution/spec.md` (producción de binarios) y
> a `tts-sidecar-installer/spec.md` (instalación del sidecar en la
> máquina del usuario).

## MODIFIED Requirements

### Requirement: Robustez en la Inferencia y Reproducción de Audio

El sistema SHALL garantizar que cualquier fallo al leer el transcript, al
invocar al LLM para el resumen/respuesta, o al sintetizar audio con el
sidecar NO afecte el ciclo de vida normal de Claude Code ni bloquee las
respuestas del proxy. Cada fallo SHALL ser registrado como `[TTS-SIDE]` con `reason`
identificando la causa (`sidecar-missing`, `spawn-failed`, `timeout`,
`invalid-json`, `non-zero-exit`, `exception`), de forma que sea
detectable sin afectar el flujo principal. La reproducción de audio
SHALL completarse antes de que el handler retorne; el sidecar SHALL ser
invocado de forma bloqueante, con un timeout configurable (default 30s,
env `TTS_SIDECAR_TIMEOUT_MS`) tras el cual el handler termina la espera
con `reason: "timeout"` y continúa.

**Reason:** El delta `c00076` implementó el código TypeScript del
sidecar pero dejó sin hacer la distribución binaria, por lo que
`resolveSidecarAssets()` lanzaba `SidecarNotInstalledError` en
producción. El delta `c00084` completa la infraestructura de
CI/publicación que permite al postinstall descargar los binarios reales,
de modo que `sidecar-missing` deja de ser el caso común. La degradación
elegante se mantiene para escenarios extremos (binario corrupto tras
descarga, plataforma no soportada, espeak-ng-data/ ausente por layout
incorrecto del ZIP, etc.).

**Migration:** Ejecutar `npm run tts:setup` tras el primer `npm install`
del delta. En CI, los binarios se descargan automáticamente via
postinstall. No se requiere cambio en el código de
`AuditHookEventHandler`.

#### Scenario: Sidecar ausente no afecta el hook (escenario residual)

- **GIVEN** que el binario del sidecar no está presente en disco
- **WHEN** se procesa un hook `Stop`
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"`
  o `"spawn-failed"`
- **AND** SHALL continuar el procesamiento del hook retornando HTTP 2xx

#### Scenario: Sidecar presente resuelve y reproduce audio

- **GIVEN** que `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]` existe
- **AND** su SHA256 coincide con el del ZIP en `tts-sidecar.sha256`
- **AND** `vendor/tts-sidecar/voices/es_MX-claude-high/es_MX-claude-high.onnx`
  y `.onnx.json` existen
- **WHEN** `resolveSidecarAssets()` es invocado
- **THEN** SHALL retornar paths absolutos al binario y al modelo de voz
  `es_MX-claude-high`
- **AND** SHALL invocar el sidecar via spawn con
  `--model <voice.onnx> --config <voice.onnx.json>`
- **AND** SHALL esperar la confirmación antes de retornar

#### Scenario: Timeout del sidecar libera al handler

- **GIVEN** que el sidecar no responde dentro del timeout configurado
  (por defecto 30s)
- **WHEN** se procesa un hook `Stop`
- **THEN** SHALL matar el proceso del sidecar
- **AND** SHALL emitir `[TTS-SIDE]` con `reason: "timeout"`
- **AND** SHALL continuar el procesamiento del hook sin propagar el error

#### Scenario: Síntesis de audio completa antes de retornar

- **GIVEN** que el sidecar está presente y responde `{"status":"ok"}`
- **WHEN** el handler invoca `speak(text)`
- **THEN** SHALL esperar a que el sidecar confirme antes de continuar
- **AND** el handler SHALL retornar solo después de que la voz haya
  terminado de reproducirse

#### Scenario: Voz distinta a `es_MX-claude-high` se selecciona por env

- **GIVEN** que `TTS_SIDECAR_VOICE` está seteado a otra voz (p. ej.
  `es_ES-sharma-medium` si se agregara al manifiesto)
- **AND** que esa voz existe bajo `vendor/tts-sidecar/voices/<voice>/`
- **WHEN** `PiperSidecarService.speak(text, voice)` se invoca con la voz
- **THEN** SHALL resolver el path del modelo correspondiente a esa voz
- **AND** SHALL pasar el nombre de voz al spawn