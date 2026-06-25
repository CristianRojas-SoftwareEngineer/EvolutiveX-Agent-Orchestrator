## Why

El pipeline de release del sidecar TTS se migró de GitHub Actions a GitLab CI debido a un bloqueo de billing en GitHub Actions. Durante el primer run en GitLab CI se descubrieron tres bugs de configuración que impiden que los builds produzcan binarios publicables: una imagen Docker desactualizada en el job `release`, una instalación incorrecta de Rust en el runner Windows, y una imagen de macOS sin la toolchain Rust necesaria. Estos tres fixes son obligatorios para que el pipeline pueda compilar y publicar los cinco binaries.

## What Changes

- **MODIFIED** Requirement 1 (`Pipeline de CI para binarios sherpa-onnx en 5 plataformas`): cambia de GitHub Actions (`.github/workflows/tts-sidecar-release.yml`) a GitLab CI (`.gitlab-ci.yml`), con runners SaaS de GitLab y una estrategia matrix equivalente.
- **FIX** Job `release` en `.gitlab-ci.yml`: cambiar `image: rust:1.78` → `image: rust:1.85` para usar la misma toolchain que los jobs de build (linux-amd64, linux-aarch64).
- **FIX** Job `windows-amd64`: usar `choco install -y rust-ms` para instalar Rust correctamente en el runner Windows (antes: sin instalacion, compilación fallaba).
- **FIX** Jobs `macos-amd64` y `macos-aarch64`: usar `image: macos-26-xcode-26` con instalacion via `curl sh.rustup.rs` para garantizar la toolchain deseada (antes: imagen sin rustup).
- Actualizar la documentación del proyecto (README.md y cualquier otro archivo) para reemplazar las referencias a GitHub Actions, windows-latest, ubuntu-latest, macos-13/14 por GitLab CI con los runners SaaS correspondientes.
- Actualizar `openspec/specs/tts-sidecar-binary-distribution/spec.md` Requirement 1 y su tabla de mapping para reflejar GitLab CI con los runners SaaS de GitLab.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `tts-sidecar-binary-distribution`: el Requirement 1 ("Pipeline de CI para binarios sherpa-onnx en 5 plataformas") cambia su implementación de GitHub Actions (`.github/workflows/tts-sidecar-release.yml`) a GitLab CI (`.gitlab-ci.yml`). La tabla de mapping de triples Rust a runners cambia de `windows-latest`, `ubuntu-latest`, `macos-13`, `macos-14-arm64` a `saas-windows-medium-amd64`, `saas-linux-medium-amd64`, `saas-linux-medium-aarch64`, `saas-macos-medium-m1`. Los 5 targets y el layout del ZIP permanecen iguales; el mecanismo de distribución (Release a GitHub Releases) sigue siendo manual según decisión previa.

### Non-canonical change
(none)

## Impact

- **`.gitlab-ci.yml`**: archivo de pipeline principal, requiere los 3 fixes de configuración.
- **`openspec/specs/tts-sidecar-binary-distribution/spec.md`**: spec canónica que documenta el pipeline de distribución; se actualiza al archivar el delta.
- **Documentación del proyecto** (README.md y otros archivos): menciones a GitHub Actions y a los runners de GitHub deben actualizarse a GitLab CI.
- No afecta: scripts de runtime (`postinstall-tts.ts`), el sidecar en `sidecar/`, ni la lógica de verificación SHA256.
