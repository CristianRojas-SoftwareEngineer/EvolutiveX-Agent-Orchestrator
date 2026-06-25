# Tasks: c00086-fix-ci-msrv-and-platform-guards

## 1. Causa raíz — MSRV y Cargo.lock

- [x] 1.1 Añadir el campo `rust-version = "1.88"` en la sección `[package]` de `sidecar/Cargo.toml` ~doing
- [x] 1.2 Ejecutar `cargo generate-lockfile` en el directorio `sidecar/` para generar `sidecar/Cargo.lock` ~doing
- [x] 1.3 Verificar que `sidecar/Cargo.lock` existe y no está en `.gitignore`; añadirlo al staging (`git add sidecar/Cargo.lock`) ~doing

## 2. Familia A — Imagen Docker Linux y release

- [x] 2.1 Cambiar la directiva `image:` del job `linux-amd64` en `.gitlab-ci.yml` de `rust:1.85` a `rust:1.88` (~línea 105) ~doing
- [x] 2.2 Cambiar la directiva `image:` del job `linux-aarch64` en `.gitlab-ci.yml` de `rust:1.85` a `rust:1.88` (~línea 117) ~doing
- [x] 2.3 Cambiar la directiva `image:` del job `release` en `.gitlab-ci.yml` de `rust:1.85` a `rust:1.88` (~línea 168) ~doing

## 3. Familia B — Recarga de PATH en Windows

- [x] 3.1 En el `before_script` del job `build:windows-amd64` (~líneas 96-101 de `.gitlab-ci.yml`), insertar entre el paso `choco install -y rust-ms` y el paso `rustup default stable` la siguiente línea: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")` ~doing

## 4. Familia C — Guard apt-get en .build_template

- [x] 4.1 En `.build_template` de `.gitlab-ci.yml` (~líneas 46-47), envolver los comandos `apt-get update -qq` y `apt-get install -y -qq zip` en el guard: `if [ "$RUNNER_OS" = "Linux" ]; then … fi`, siguiendo el patrón ya existente en las líneas 49-55 del mismo template ~doing

## 5. Spec canónica actualizada

- [x] 5.1 En `openspec/specs/tts-sidecar-binary-distribution/spec.md` (~línea 21), reemplazar `rust:1.85` por `rust:1.88` ~doing
- [x] 5.2 Verificar que el requisito de recarga de PATH en Windows y el guard de apt-get en macOS están reflejados en la spec (ya escritos en la tarea de define) ~doing

## Limitaciones conocidas

**W2 — Cargo.lock semilla**: el lockfile presente es un esqueleto (sin sección `[[package]]`
completa) porque `cargo` no está disponible en el entorno local. Cumple el requisito
"SHALL existir". La corrección raíz se completa cuando la primera corrida de CI ejecute
`cargo build --release` y el lockfile resultante sea commiteado al repositorio.
