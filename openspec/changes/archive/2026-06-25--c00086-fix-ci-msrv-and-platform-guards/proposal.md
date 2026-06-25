## Why

El pipeline CI del sidecar TTS falla por cuatro causas independientes que se agrupan en tres familias más una causa raíz:

- **Familia A (imagen Docker — Linux/release):** Los jobs `linux-amd64`, `linux-aarch64` y `release` usan `image: rust:1.85`, pero el código fuente del crate emplea características estabilizadas en `1.88`. El compilador falla antes de emitir un binario.
- **Familia B (Windows PATH no recargado):** El job `build:windows-amd64` instala Rust vía `choco install -y rust-ms` pero la sesión PowerShell no recarga el PATH tras la instalación. La siguiente línea (`rustup default stable`) falla con `'rustup' is not recognized` porque el ejecutable instalado aún no está en el PATH de la sesión activa.
- **Familia C (apt-get sin guard en macOS):** La plantilla `.build_template` en `.gitlab-ci.yml` ejecuta `apt-get update -qq` y `apt-get install -y -qq zip` en las líneas ~46-47 sin guard de plataforma. Los runners de macOS no disponen de `apt-get`, lo que produce `apt-get: command not found` con exit 127 y aborta los jobs `macos-amd64` y `macos-aarch64`.
- **Causa raíz (Cargo.lock ausente):** `sidecar/Cargo.lock` no existe en el repositorio. Sin él, cada ejecución del pipeline resuelve el árbol de dependencias de forma independiente, convirtiendo el MSRV en un blanco móvil y haciendo los builds no deterministas.

## What Changes

- **Familia A:** La directiva `image:` de los jobs `linux-amd64`, `linux-aarch64` y `release` en `.gitlab-ci.yml` se actualiza de `rust:1.85` a `rust:1.88`. La spec canónica (`openspec/specs/tts-sidecar-binary-distribution/spec.md`) se actualiza en consecuencia.
- **Familia B:** Se inserta una línea de recarga de PATH en el `before_script` del job `build:windows-amd64`, entre el paso `choco install -y rust-ms` y el paso `rustup default stable`: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`.
- **Familia C:** Las dos líneas de `apt-get` en `.build_template` (~líneas 46-47 de `.gitlab-ci.yml`) se envuelven en un guard de shell `if [ "$RUNNER_OS" = "Linux" ]; then … fi`, siguiendo el patrón ya presente en las líneas 49-55 del mismo template.
- **Causa raíz:** Se declara `rust-version = "1.88"` en `[package]` de `sidecar/Cargo.toml` para que `cargo` rechace toolchains incompatibles con un error explícito. Se genera `sidecar/Cargo.lock` mediante `cargo generate-lockfile` y se versiona en el repositorio para congelar el árbol de dependencias.

## Capabilities

### Modified Capabilities

- `tts-sidecar-binary-distribution`: los requisitos del pipeline CI se actualizan para reflejar la imagen `rust:1.88` en jobs de Linux y release; el requisito de recarga de PATH en el `before_script` del job de Windows; el guard de `apt-get` en la plantilla compartida; y la presencia de `Cargo.lock` versionado junto al MSRV declarado en `Cargo.toml`.

## Impact

- `.gitlab-ci.yml`: imagen actualizada en tres jobs (`linux-amd64`, `linux-aarch64`, `release`); recarga de PATH insertada en `build:windows-amd64`; líneas `apt-get` guardadas en `.build_template`.
- `sidecar/Cargo.toml`: campo `rust-version = "1.88"` añadido en `[package]`.
- `sidecar/Cargo.lock`: archivo nuevo, generado con `cargo generate-lockfile` y versionado en el repositorio.
- `openspec/specs/tts-sidecar-binary-distribution/spec.md`: imagen canónica actualizada de `rust:1.85` a `rust:1.88`; requisitos de PATH Windows y guard apt-get añadidos; MSRV y Cargo.lock documentados.
