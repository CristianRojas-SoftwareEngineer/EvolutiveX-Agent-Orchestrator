# Delta: tts-sidecar-binary-distribution — voz unificada en ZIP

### Requirement: Pipeline de CI con modelo de voz dentro del ZIP

El sistema SHALL ejecutar un pipeline de CircleCI que compile el binario `tts-sidecar` para cinco targets. Cada job SHALL bundlear `libespeak-ng`, `espeak-ng-data/` y el modelo de voz `es_MX-claude-high` dentro del ZIP.

#### Scenario: ZIP con layout unificado incluye la voz

- **GIVEN** el pipeline CircleCI compila para `windows-amd64`
- **WHEN** el job `windows-amd64` produce `windows-amd64.zip`
- **THEN** el ZIP contiene `voices/es_MX-claude-high/es_MX-claude-high.onnx`
- **AND** el ZIP contiene `voices/es_MX-claude-high/es_MX-claude-high.onnx.json`
- **AND** el ZIP contiene `libespeak-ng.dll`
- **AND** el ZIP contiene `espeak-ng-data/`

#### Scenario: postinstall no descarga la voz por separado

- **GIVEN** el archivo `tts-sidecar.sha256` no tiene campo `voices`
- **WHEN** el `postinstall-tts.ts` se ejecuta
- **THEN** solo descarga un ZIP (el binario, que ya incluye la voz)
- **AND** no hace requests HTTP a `voices/es_MX-claude-high/`

#### Scenario: Job download-model descarga y persiste el modelo

- **GIVEN** el workflow CircleCI se dispara
- **WHEN** el job `download-model` termina
- **THEN** el modelo de voz está disponible en el workspace para los jobs `linux-amd64`, `windows-amd64`, `macos-amd64`

---

### Requirement: Manifiesto `tts-sidecar.sha256` sin sección voices

El sistema SHALL mantener un archivo `tts-sidecar.sha256` sin sección `voices`. El SHA256 del ZIP verifica implicitamente la voz dentro de él.

#### Scenario: Manifiesto sin sección voices

- **WHEN** el implementer lee `tts-sidecar.sha256`
- **THEN** tiene el campo `binaries` con exactamente 5 entradas
- **AND** NO tiene el campo `voices`
