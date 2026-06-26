## Context

5 jobs del pipeline GitLab CI (.gitlab-ci.yml) fallan en la compilacion del sidecar TTS. Los failures abarcan 4 familias de error en linux-amd64, linux-aarch64, macos-amd64, macos-aarch64 y windows-amd64. El pipeline usa `.build_template` (YAML anchor) compartido por los 5 jobs y el codigo `sidecar/src/main.rs` con la API de sherpa-onnx.

## Goals / Non-Goals

**Goals:**
- Los 5 jobs de CI compilan exitosamente en sus respectivas plataformas
- El template `.build_template` y el `before_script` de cada job quedan correctamente configurados
- El codigo `sidecar/src/main.rs` compila con sherpa-onnx 1.13.3

**Non-Goals:**
- No se modifica el comportamiento funcional del sidecar TTS
- No se cambia la estructura del pipeline ni los artefactos publicados
- No se actualiza la version de sherpa-onnx (solo se adapta el codigo a la API existente)

## Decisions

### Decision 1: Donde agregar libasound2-dev en linux-amd64

**Opcion elegida**: Anadir `libasound2-dev` como un paso adicional en la seccion `script` del `.build_template`, junto a los otros `apt-get install`.

**Alternativa descartada**: Crear un `before_script` separado para linux-amd64. Se descarta porque el template ya agrupa instalaciones de paquetes del sistema en `script`; anadirlo alli mantiene la consistencia.

**Cambio en `.build_template` (lineas 47-54)**:
```yaml
    - |
      if [ "$RUNNER_OS" = "Linux" ]; then
        apt-get update -qq
        apt-get install -y -qq zip libasound2-dev   # <-- anadido libasound2-dev
      fi
```

### Decision 2: Configuracion PKG_CONFIG para linux-aarch64

**Opcion elegida**: Exportar `PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu` y anadir `/usr/aarch64-linux-gnu/lib/pkgconfig` a `PKG_CONFIG_PATH` en el paso de compilacion cruzada del `.build_template`.

**Alternativa descartada**: Usar `cargo build` con flag `--target-dir` apuntando a un sysroot custom. Se descarta porque `alsa-sys` necesita resolucion de pkg-config para encontrar el sysroot ARM.

**Cambio en `.build_template` (lineas 56-63)**:
```yaml
    - |
      if [ "$CROSS" = "true" ]; then
        apt-get install -y -qq gcc-aarch64-linux-gnu
        export PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu
        export PKG_CONFIG_PATH="/usr/aarch64-linux-gnu/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
        export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
      fi
```

### Decision 3: Adaptacion de API sherpa-onnx en main.rs

**Opcion elegida**: Reescribir las lineas 134-143 de `sidecar/src/main.rs` para usar `OfflineTtsModelConfig` + `OfflineTts::create` en lugar de `OfflineTtsConfig` + `OfflineTts::new`.

**Detalle del cambio** (codigo actual vs nuevo):

```rust
// ANTES (sherpa-onnx < 1.13.3):
let config = OfflineTtsConfig {
    model: cli.model.to_string_lossy().into_owned(),
    config: cli.config.to_string_lossy().into_owned(),
    espeak_data: espeak_dir,
    ..Default::default()
};
let tts = match OfflineTts::new(&config) {

// NUEVO (sherpa-onnx 1.13.3):
let model_config = OfflineTtsModelConfig {
    model: cli.model.to_string_lossy().into_owned(),
    ..Default::default()
};
let tts = match OfflineTts::create(&model_config) {
```

**Nota**: `cli.config` y `espeak_data` ya no existen en la API 1.13.3. Si `cli.config` era util, se deberia evaluar si existe un mecanismo alternativo en la nueva API; por ahora se elimina porque el error de compilacion lo exige y el spec.md indica que no cambia comportamiento funcional.

### Decision 4: Fix PATH rustup en windows-amd64

**Opcion elegida**: Usar la ruta explícita `.cargo\bin\rustup` en lugar de depender de rehash del PATH. Concretamente, cambiar las lineas 105-106 del `before_script` de windows:

**Cambio en `.gitlab-ci.yml` (job build:windows-amd64)**:
```yaml
  before_script:
    - choco install -y rust-ms
    - choco install -y espeak-ng
    # Usar ruta explícita para evitar que PATH no se refresque entre sections
    - $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    - .cargo\bin\rustup default stable   # <-- ruta explícita
```

## Risks / Trade-offs

- **Riesgo**: Agregar `libasound2-dev` anade una dependencia de sistema que podria no existir en todas las imagenes Docker `rust:*`. Mitigacion: se prueba sobre la imagen `rust:1.88` ya usada en el template.
- **Riesgo**: La eliminacion de `cli.config` podria quitar funcionalidad que antes estaba habilitada. Mitigacion: el spec.md indica que el ajuste es solo para compilacion; si `cli.config` hacia falta en runtime, fallara en el proximo test de integracion y se reportara.
- **Riesgo**: Modificar `.gitlab-ci.yml` directamente en lugar de a traves de un template separado puede hacer diffs grandes. Mitigacion: el change es ciblado y limitado a los 4 fixes documentados.

## Migration Plan

1. Aplicar los cambios a `.gitlab-ci.yml` y `sidecar/src/main.rs`
2. Hacer push a la rama y verificar que el pipeline se dispara automaticamente
3. Monitorear los 5 jobs: linux-amd64, linux-aarch64, macos-amd64, macos-aarch64, windows-amd64
4. Si todos pasan, hacer merge; si alguno falla, diagnosticar y crear un nuevo delta si corresponde
