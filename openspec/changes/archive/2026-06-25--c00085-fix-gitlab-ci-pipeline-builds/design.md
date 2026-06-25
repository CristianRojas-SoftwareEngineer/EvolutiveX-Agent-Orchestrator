## Context

El pipeline de release del sidecar TTS se migró de GitHub Actions a GitLab CI debido a un bloqueo de billing en GitHub Actions. El `.gitlab-ci.yml` ya tiene los 3 jobs de build (linux-amd64, windows-amd64, macos-amd64/ar... aberation) configurados, pero durante el primer run completo se encontraron tres bugs de configuracion que impiden que los builds produzcan binarios publicables:

1. El job `release` (linea 168) usa `image: rust:1.78` mientras los jobs de build linux-amd64 y linux-aarch64 ya usan `image: rust:1.85`. La discrepancia de toolchain causa inconsistencias.
2. El job `windows-amd64` no instala Rust explicitamente; depende de que la imagen base lo tenga, lo cual no ocurre en el runner SaaS de GitLab.
3. Los jobs `macos-amd64` y `macos-aarch64` usan `image: macos-26-xcode-26` pero no instalan Rust; la imagen no incluye rustup por defecto.

El cross-compile de linux-aarch64 desde x86_64 y la publicacion manual a GitHub Releases son decisiones previas del usuario que se respetan.

## Goals / Non-Goals

**Goals:**
- Corregir la imagen del job `release` para que use `rust:1.85` consistente con los jobs de build.
- Instalar Rust correctamente en el runner Windows de GitLab SaaS.
- Instalar Rust correctamente en los runners macOS de GitLab SaaS.
- Garantizar que los 5 jobs de build completen con codigo 0 en el proximo trigger.

**Non-Goals:**
- No se modifica el mecanismo de publicacion a GitHub Releases (sigue siendo manual).
- No se cambia la estrategia de cross-compile para linux-aarch64 (sigue siendo desde x86_64).
- No se re-estructura el layout del ZIP ni se modifican los nombres de assets.
- No se implementan nuevos features en el pipeline; solo seCorrigen los bugs de configuracion.

## Decisions

### D1: Usar `image: rust:1.85` (no `rust:1.78` ni nightly) para el job `release` y los jobs Linux

**Decision:** Cambiar `image: rust:1.78` → `image: rust:1.85` en el job `release` (linea 168 del `.gitlab-ci.yml`).

**Rationale:** Los jobs de build linux-amd64 y linux-aarch64 ya usan `image: rust:1.85`. Usar una version anterior (1.78) en el job `release` crea una discrepancia de toolchain que puede producir binarios inconsistentes entre el build y el release. Se elige 1.85 (no nightly) porque es una version estable reciente que coincide con la ya usada en los jobs de build, y porque el usuario confirmo que `rust:1.85` es la toolchain deseada.

**Alternatives considered:**
- `rust:1.78`: Descartada porque es la version que ya causa el bug actual y no coincide con los builds.
- `rust:nightly`: Descartada por inestabilidad — no es apropiada para un pipeline de release que requiere reproducibilidad.

### D2: Instalar Rust en Windows via `choco install -y rust-ms`

**Decision:** En el job `windows-amd64`, agregar el paso `choco install -y rust-ms` antes de invocar `cargo build`.

**Rationale:** El runner SaaS de Windows en GitLab no tiene Rust preinstalado. La opcion `choco install -y rust-ms` es el mecanismo mas simple y oficial de instalar Rust en un runner Windows con Chocolatey. Instala Rust en la ruta estandar (`C:\Users\...\.cargo`) y agrega `rustc` y `cargo` al PATH.

**Alternatives considered:**
- Descargar `rustup-init.exe` directamente y ejecutarlo con flags `--default-toolchain 1.85 --default-host x86_64-pc-windows-msvc`: Descartada porque requiere manejar el ejecutable, permisos de ejecucion, y cleanup manual. `choco install -y rust-ms` hace todo eso de forma idempotente y es el enfoque recomendado por la comunidad Rust para Windows con Chocolatey.

### D3: Usar `image: macos-26-xcode-26` con instalacion via `curl sh.rustup.rs`

**Decision:** Los jobs `macos-amd64` y `macos-aarch64` usan `image: macos-26-xcode-26` e instalan rustup via `curl sh.rustup.rs -s -- --default toolchain 1.85 --default-host <triple>`.

**Rationale:** La imagen `macos-26-xcode-26` es la imagen macOS actual default en GitLab SaaS y viene con Xcode 26. No incluye Rust por defecto. La instalacion via `curl sh.rustup.rs` con `--default toolchain 1.85` garantiza que se instala exactamente la version 1.85 de Rust,fixeada en el comando, sin depender de un package manager que pueda tener versiones desactualizadas.

**Alternatives considered:**
- `brew install rust`: Descartada porque el Rust de Homebrew puede estar desactualizado o no ser exactamente 1.85. Ademas, `brew` no permite fixear la version de toolchain de forma tan directa como `rustup`.
- Usar una imagen Docker con Rust preinstalado en macOS: No es viable — Docker no esta disponible en los runners macOS de GitLab SaaS.
- `macos-15-xcode-16`: No es la imagen default actual; se prefiere `macos-26-xcode-26` que es la que GitLab SaaS provee como standard para macOS.

### D4: Estrategia de distribucion — GitLab CI compila, publicacion a GitHub Releases manual

**Decision:** No se modifica el mecanismo de publicacion. GitLab CI compila los 5 binarios y los sube como artifacts del pipeline; la publicacion a GitHub Releases sigue siendo un paso manual realizado por el usuario.

**Rationale:** Esta fue una decision previa del usuario (mencionada en el briefing de phase 1). El delta se enfoca unicamente enfixear los bugs de configuracion del pipeline para que los builds completen. La sincronizacion con GitHub Releases es un paso posterior fuera del alcance de este delta.

### D5: Cross-compile de linux-aarch64 desde x86_64

**Decision:** Se mantiene la estrategia existente: el job `linux-aarch64` compila desde un runner x86_64 usando cross-compilation.

**Rationale:** Decision previa del usuario. El target `aarch64-unknown-linux-gnu` se compila usando `cross` o `cargo-zigbuild` desde un runner x86_64. No se modifica esta estrategia en este delta.

## Risks / Trade-offs

- **[Risk] Incompatibilidad de `choco install -y rust-ms` con futuras versiones de Chocolatey o del runner Windows de GitLab SaaS** → **Mitigation:** Si el package `rust-ms` cambia de nombre o deja de estar disponible, se puede migrar a la descarga directa de `rustup-init.exe`. El fix es local y no afecta otros jobs.
- **[Risk] La version `rust:1.85` de la imagen Docker no esta disponible en Docker Hub en algún momento** → **Mitigation:** Las imagenes `rust:*` en Docker Hub son versionadas y persistentes. Si ocurre, se puede apuntar a un digest SHA256 especifico en lugar de la tag.
- **[Risk] La instalacion via `curl sh.rustup.rs` en macOS puede pedir input interactivo** → **Mitigation:** Se usan los flags `-s -- --default toolchain 1.85 --default-host <triple>` que hacen la instalacion no-interactiva. Si el comportamiento de rustup-init cambia, se puede agregar `--profile minimal` para reducir el set de herramientas instaladas.

## Migration Plan

1. **Aplicar el delta** (`apply-specification-delta`): el implementer modifica `.gitlab-ci.yml` con los 3 fixes y actualiza la documentacion (README.md y demas archivos afectados).
2. **Trigger manual del pipeline**: ejecutar `git push` con un tag `tts-sidecar-v*` para disparar el pipeline completo y verificar que los 5 builds completan con codigo 0.
3. **Verificacion**: Confirmar que los artifacts de cada job contienen el ZIP con el layout correcto.
4. **Sincronizar spec canonica**: al archivar el delta, `synchronize-specification-delta` actualiza `openspec/specs/tts-sidecar-binary-distribution/spec.md` con el Requirement 1 modificado.
5. **Rollback**: si el pipeline falla, se revierte el cambio en `.gitlab-ci.yml` y se investiga el error especifico. No se requiere rollback de la spec porque aun no se ha sincronizado.

## Open Questions

1. **¿Se debe agregar un job de verificacion que confirme que los binarios publicados son identicos a los construidos?** — Actualmente no hay un paso de verificacion post-release. Esto queda fuera del alcance de este delta pero podria ser un mejora futura.
2. **¿Se considerara automatizar la publicacion a GitHub Releases desde GitLab CI?** — Esto fue descartado en decisiones previas (publicacion manual). Si el usuario lo desea en el futuro, seria un delta separado.
