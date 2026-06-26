## 1. Correccion API sherpa-onnx en sidecar/src/main.rs

- [x] 1.1 Reemplazar `OfflineTtsModelConfig { model: ..., ..Default() }` por `OfflineTtsModelConfig { vits: OfflineTtsVitsModelConfig { model: cli.model.to_string_lossy().into_owned(), tokens: tokens_path, ..Default::default() }, ..Default::default() }`
- [x] 1.2 Derivar `tokens_path` del `cli.model` reemplazando la extension `.onnx` por `.onnx.json`
- [x] 1.3 Cambiar `match OfflineTts::create(&model_config) { Ok(t) => ..., Err(e) => ... }` por `match OfflineTts::create(&model_config) { Some(t) => ..., None => ... }`
- [ ] 1.4 Verificar que el codigo compila con `cargo build --release --manifest-path sidecar/Cargo.toml`

## 2. Correccion Windows CI en .gitlab-ci.yml

- [x] 2.1 Reemplazar `.cargo\bin\rustup default stable` por `C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe default stable` en el before_script de `build:windows-amd64`
- [x] 2.2 Eliminar o corregir la linea de recarga de PATH con sintaxis `$env:Path` (ya no es necesaria si se usa la ruta directa de rustup)
- [ ] 2.3 Hacer push a la rama y verificar que los 5 jobs del pipeline CI pasan exitosamente
