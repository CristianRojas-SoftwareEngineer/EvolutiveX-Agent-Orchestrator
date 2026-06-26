## Why

5 jobs de CI fallan en la rama actual, bloqueando merges y releases. Los errores abarcan 4 plataformas (linux-amd64, linux-aarch64, macos-amd64, macos-aarch64, windows-amd64) y requieren fixes en el template de build y en el codigo de sherpa-onnx.

## What Changes

- **linux-amd64**: instalar `libasound2-dev` antes de compilar el sidecar TTS
- **linux-aarch64**: configurar `PKG_CONFIG_SYSROOT_DIR` y `PKG_CONFIG_PATH` para compilacion cruzada ARM
- **macos-amd64 / macos-aarch64**: adaptar el codigo `main.rs` a la breaking API de sherpa-onnx 1.13.3 (`OfflineTtsConfig` → `OfflineTtsModelConfig`, eliminacion de campos `config` y `espeak_data`, `OfflineTts::new` → `OfflineTts::create`)
- **windows-amd64**:fix PATH para `rustup` usando ruta explícita `.cargo\bin` en lugar de rehash

## Capabilities

### Non-canonical change
- **Build infrastructure / CI template**: los fixes de CI no corresponden a ninguna capacidad en `openspec/specs/`; son ajustes a pipeline de build y template `.build_template` que no afectan requisitos funcionales

## Impact

- `.build_template`: seccion `before_script` de linux-amd64 y linux-aarch64
- `src-tauri/src/main.rs`: lineas 136-143, API sherpa-onnx
- Scripts de pipeline CI para las 5 plataformas afectadas
