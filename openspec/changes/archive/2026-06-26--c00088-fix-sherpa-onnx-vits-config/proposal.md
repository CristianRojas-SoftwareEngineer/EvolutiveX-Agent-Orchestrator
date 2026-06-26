## Why

El pipeline CI de tts-sidecar tiene 5 jobs fallando. Dos errores estructurales impiden que el sidecar TTS compile y se distribuya correctamente: un uso incorrecto de la API sherpa-onnx en el codigo Rust, y una ruta de rustup incorrecta en la configuracion CI de Windows.

## What Changes

- **sidecar/src/main.rs**: Corregir el uso de la API sherpa-onnx 1.13.3. `OfflineTtsModelConfig` no tiene campo `model`; debe usar `vits: OfflineTtsVitsModelConfig`. `OfflineTts::create` recibe `&OfflineTtsConfig` y retorna `Option<OfflineTts>` (no `Result`). El path del archivo tokens se deriva del path del modelo reemplazando `.onnx` → `.onnx.json`.
- **.gitlab-ci.yml**: Corregir la ruta de rustup en Windows. Chocolatey rust-ms instala en `C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe`; el YAML debe usar esta ruta directa en lugar de `.cargo\bin\rustup`, y resolver la expansion de `$env:PATH` de forma compatible con GitLab CI + PowerShell.

## Capabilities

### Non-canonical change

- **tts-sidecar-sherpa-onnx-fix**: Correccion de errores estructurales en codigo existente del sidecar TTS. El archivo `sidecar/src/main.rs` contiene bugs de uso de API que impiden la compilacion; no introduce nueva capacidad canonica.
- **tts-sidecar-windows-ci-fix**: Correccion de la configuracion CI de Windows en `.gitlab-ci.yml`. La ruta de rustup y la sintaxis de expansion de variables en PowerShell son incorrectas para el entorno GitLab CI; no corresponde a ningun requerimiento en `openspec/specs/`.

## Impact

- **Codigo afectado**: `sidecar/src/main.rs`, `.gitlab-ci.yml`
- **Dependencias**: crate `sherpa-onnx` v1.13.3, Chocolatey `rust-ms`, GitLab CI
- **Sistemas**: Pipeline CI de tts-sidecar (5 jobs: linux/amd64, linux/aarch64, windows/amd64, macos/amd64, macos/aarch64)
