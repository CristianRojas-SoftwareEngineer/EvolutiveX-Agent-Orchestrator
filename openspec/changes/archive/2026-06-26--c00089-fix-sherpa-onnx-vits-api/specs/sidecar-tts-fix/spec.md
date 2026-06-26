## Non-canonical record

Este registro documenta dos correcciones de bugs que no corresponden a ningun requisito canonico en `openspec/specs/`:

- **sidecar/src/main.rs (TTS offline config)**: Correccion de errores de compilacion en el sidecar TTS. El codigo actual usa wrappers `Some(...)` innecesarios en la inicializacion de `OfflineTtsConfig`/`OfflineTtsModelConfig`/`OfflineTtsVitsModelConfig`, y la llamada a `generate()` devuelve `OfflineTtsOutput` directamente (no un `Result`). No existe un requisito canonico para el API de Sherpa-ONNX en `openspec/specs/`; esta es mantenimiento correctiva del binario existente.

- **.gitlab-ci.yml (Windows PATH fix)**: Correccion del PATH en el runner de Windows para que `rustup` sea accesible. El job `windowsamd64` falla porque `rustup.exe` no esta en el PATH sin la asignacion previa de `$env:Path`. No corresponde a ningun requisito canonico; es correccion de configuracion de CI.
