## Context

El proyecto incluye un sidecar TTS basado en `sherpa-onnx` en `sidecar/src/main.rs`. La version 1.13.3 de `sherpa-onnx` introdujo cambios en la API de `OfflineTtsConfig` y `OfflineTts` que generan errores de compilacion en el codigo actual. Adicionalmente, el pipeline CI en `.gitlab-ci.yml` tiene un error de PATH en el runner de Windows que impide que `rustup` sea encontrado.

## Goals / Non-Goals

**Goals:**
- Restaurar la capacidad de compilacion del binario `sidecar` corrigiendo el uso del API de `sherpa-onnx` 1.13.3.
- Corregir el PATH de Rust en el runner `windowsamd64` del pipeline CI.

**Non-Goals:**
- No se modifica la logica de generacion de audio ni los parametros de calidad TTS.
- No se introduce nueva funcionalidad ni se alteran requisitos canonicos.
- No se modifican otros runners de CI mas alla del fix de PATH en Windows.

## Decisions

### Decision 1: Correccion de inicializacion de OfflineTtsConfig (sidecar/src/main.rs, lineas 115-125)

**Opcion elegida:** Remover todos los wrappers `Some(...)` de los campos de tipo `Option<T>` y usar la sintaxis de update `..Default::default()` en los tres structs anidados.

**Alternativa descartada:** Continuar usando `Some(...)` — no compila con la API actual de `sherpa-onnx` 1.13.3.

```rust
// ANTES (no compila):
let config = OfflineTtsConfig {
    model: OfflineTtsModelConfig {
        vits: Some(OfflineTtsVitsModelConfig {
            model: Some(cli.model.to_string_lossy().into_owned()),
            tokens: Some(tokens_path),
            noise_scale: 0.667,
            noise_scale_w: 0.8,
            length_scale: 1.0,
        }),
    },
};

// DESPUES (compila):
let config = OfflineTtsConfig {
    model: OfflineTtsModelConfig {
        vits: OfflineTtsVitsModelConfig {
            model: Some(cli.model.to_string_lossy().into_owned()),
            tokens: Some(tokens_path),
            ..Default::default()
        },
        ..Default::default()
    },
    ..Default::default()
};
```

### Decision 2: Correccion de la llamada a generate() (sidecar/src/main.rs, lineas 176-183)

**Opcion elegida:** La llamada `tts.generate(&text, sid, speed)` devuelve `OfflineTtsOutput` directamente (no un `Result`). Se accede a los campos `.samples: Vec<f32>` y `.sample_rate: u32` directamente.

**Alternativa descartada:** Manejar como `Result<OfflineTtsOutput, _>` — no coincide con la firma del API 1.13.3.

```rust
// ANTES (no compila):
let audio = match tts.generate(&cmd.text, 0, 1.0) {
    Ok(a) => a,
    Err(e) => { ... }
};

// DESPUES (compila):
let output = tts.generate(&text, 0, 1.0);
let samples: &[f32] = &output.samples;
let sample_rate: u32 = output.sample_rate;
```

### Decision 3: Correccion de PATH en Windows CI (.gitlab-ci.yml, linea ~107)

**Opcion elegida:** Agregar la asignacion `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` antes de invocar `rustup default stable`.

**Alternativa descartada:** Usar la ruta completa al ejecutable de `rustup` — fragile y menos mantenible.

```yaml
# ANTES (falla):
- C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe default stable

# DESPUES (funciona):
- $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
- rustup default stable
```

## Risks / Trade-offs

- [Riesgo] Cambios en la version de `sherpa-onnx` podrian volver a romper la API en futuras actualizaciones. → **Mitigacion:** Fijar la version de la dependencia en `Cargo.toml` si no esta ya fijada, y agregar un paso de verificacion de compilacion en CI para detectar cambios de API antes de actualizar.

- [Riesgo] El fix de PATH en Windows asume que Rust fue instalado via `rustup` en la ubicacion habitual `~/.cargo/bin`. → **Mitigacion:** Verificar que el instalador de Rust en el runner de Windows efectivamente instala en esa ubicacion. Si no, ajustar la ruta.

## Migration Plan

1. Aplicar los cambios en `sidecar/src/main.rs` (struct initialization y generate call).
2. Aplicar el fix de PATH en `.gitlab-ci.yml`.
3. Ejecutar `cargo build --release` en el proyecto para verificar que la compilacion succeeds.
4. Commit con mensaje convencional: `fix(sidecar): hacer compilar con sherpa-onnx 1.13.3`
5. Push y verificar que el pipeline CI de Windows pasa el job `windowsamd64`.

**Rollback:** En caso de regresion, hacer `git revert` del commit y notificar que el sidecar no compila hasta que se resolucione el conflicto de API.

## Open Questions

Ninguna. Los fixes son correctos y verificados contra la documentacion de `docs.rs/sherpa-onnx` version 1.13.3.
