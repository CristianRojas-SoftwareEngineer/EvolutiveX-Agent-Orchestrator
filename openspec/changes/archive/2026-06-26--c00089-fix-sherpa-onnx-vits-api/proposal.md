## Why

El sidecar TTS basado en `sherpa-onnx` no compila. La API de `sherpa-onnx` versión 1.13.3 requiere inicialización de structs diferente a la actual, y el método `generate()` devuelve `OfflineTtsOutput` directamente (no un `Result`). Adicionalmente, el pipeline CI de Windows tiene un error de PATH que impide usar `rustup` correctamente.

## What Changes

- **sidecar/src/main.rs, líneas 115-125**: Corregir la inicialización de `OfflineTtsConfig` removiendo los wrappers `Some(...)` innecesarios y añadiendo `..Default::default()` a los tres structs anidados.
- **sidecar/src/main.rs, líneas 176-183**: Corregir la llamada a `generate()` para manejar el retorno como `OfflineTtsOutput` directo (campos `.samples: Vec<f32>` y `.sample_rate: u32`), no como `Result`.
- **.gitlab-ci.yml, líadnea ~107**: Agregar la corrección de PATH `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` antes de `rustup default stable` en el job de Windows.

## Capabilities

### Non-canonical change

- **sidecar/src/main.rs (TTS offline config)**: Correción de bugs de compilación en el código existente del sidecar TTS. No introduce nuevas capacidades ni modifica requisitos canónicos; es mantenimiento correctivo del binario existente.
- **.gitlab-ci.yml (Windows PATH fix)**: Correción del PATH en el runner de Windows para que `rustup` sea accesible. No corresponde a ningún requisito canónico; es corrección de configuración de CI.

## Impact

- **sidecar/src/main.rs**: El binario `sidecar` deja de compilar sin estas correcciones. Afecta la capacidad de generar audio TTS.
- **.gitlab-ci.yml**: El job `windowsamd64` falla en el paso de configuración de Rust, bloqueando el build de ese runner.
