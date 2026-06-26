## Non-canonical record

- **Build template para linux-amd64**: se agrega `apt-get install -y libasound2-dev` en la seccion `before_script` de `.build_template`. No tiene contrapartida canonica en `openspec/specs/`; es infraestructura de build.
- **Build template para linux-aarch64**: se configura `PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu` y se anade `/usr/aarch64-linux-gnu/lib/pkgconfig` a `PKG_CONFIG_PATH` para compilacion cruzada ARM. No corresponde a ningun requisito funcional.
- **Codigo main.rs (sherpa-onnx 1.13.3)**: se reescriben las lineas 136-143 para usar `OfflineTtsModelConfig` en lugar de `OfflineTtsConfig`, se eliminan los campos `config` y `espeak_data`, y se cambia `OfflineTts::new` por `OfflineTts::create`. Este ajuste corrige errores de compilacion en macos-amd64 y macos-aarch64; no cambia comportamiento funcional.
- **Build template para windows-amd64**: se usa la ruta explícita `.cargo\bin\rustup` en lugar de depender de rehash del PATH. No corresponde a un requisito funcional.

## ADDED Requirements

### Requirement: CI build pipeline runs successfully on all target platforms

El pipeline de CI DEBE compilar y pasar todos los jobs en linux-amd64, linux-aarch64, macos-amd64, macos-aarch64 y windows-amd64 sin errores de dependencias faltantes ni errores de compilacion.

#### Scenario: linux-amd64 build succeeds
- **WHEN** el job linux-amd64 ejecuta `cargo build` en el sidecar TTS
- **THEN** la libreria `libasound2-dev` esta disponible y `alsa-sys` compila sin errores

#### Scenario: linux-aarch64 cross-compilation succeeds
- **WHEN** el job linux-aarch64 ejecuta `cargo build` con target `aarch64-unknown-linux-gnu`
- **THEN** `PKG_CONFIG_SYSROOT_DIR` y `PKG_CONFIG_PATH` estan configurados correctamente y `alsa-sys` resuelve las dependencias ARM

#### Scenario: macos build succeeds with sherpa-onnx 1.13.3
- **WHEN** los jobs macos-amd64 y macos-aarch64 ejecutan `cargo build`
- **THEN** `OfflineTts::create` se invoca con `OfflineTtsModelConfig` y los campos `config` y `espeak_data` no existen en la configuracion

#### Scenario: windows-amd64 rustup is accessible
- **WHEN** el job windows-amd64 ejecuta comandos `rustup`
- **THEN** `rustup` es encontrado sin depender de rehash del PATH
