## MODIFIED Requirements

### Requirement: Pipeline de CI para binarios sherpa-onnx en 5 plataformas
El sistema SHALL ejecutar un pipeline de GitLab CI (`.gitlab-ci.yml`) con una estrategia matrix que compile el binario `tts-sidecar` (basado en sherpa-onnx + CPAL) **desde el crate versionado en `sidecar/`** (NO desde `vendor/tts-sidecar/`, que está gitignored y solo aloja la instalación de runtime) para cinco targets. La correspondencia entre el target del job CI (triple Rust) y el runner SaaS de GitLab SHALL ser exactamente la siguiente:

| Triple Rust (job CI)                | Runner GitLab SaaS              | Asset publicado     |
|-------------------------------------|---------------------------------|---------------------|
| `x86_64-pc-windows-msvc`            | `saas-windows-medium-amd64`     | `windows-amd64.zip` |
| `x86_64-unknown-linux-gnu`          | `saas-linux-medium-amd64`       | `linux-amd64.zip`   |
| `aarch64-unknown-linux-gnu`         | `saas-linux-medium-amd64` (cross) | `linux-aarch64.zip` |
| `x86_64-apple-darwin`               | `saas-macos-medium-m1`          | `macos-amd64.zip`   |
| `aarch64-apple-darwin`              | `saas-macos-medium-m1`          | `macos-aarch64.zip` |

La imagen Docker para los jobs de Linux (linux-amd64, linux-aarch64) SHALL ser `image: rust:1.85`. El job `release` SHALL usar la misma imagen `image: rust:1.85` para mantener consistencia de toolchain.

El job de Windows (windows-amd64) SHALL instalar Rust mediante `choco install -y rust-ms` antes de compilar, para garantizar una instalación correcta de la toolchain en el runner Windows.

Los jobs de macOS (macos-amd64, macos-aarch64) SHALL usar `image: macos-26-xcode-26` y SHALL instalar rustup via `curl sh.rustup.rs -s -- --default toolchain 1.85` para garantizar la versión exacta de Rust.

Cada job SHALL bundlear `libespeak-ng` (`libespeak-ng.{dll,so,dylib}`) y `espeak-ng-data/` dentro del ZIP, junto al binario, bajo el directorio `<targetId>/` en la raíz del ZIP. El layout exacto SHALL ser:

```
<targetId>.zip
└── <targetId>/
    ├── tts-sidecar[.exe]
    ├── libespeak-ng.{dll,so,dylib}
    └── espeak-ng-data/...
```

El nombre del archivo ZIP SHALL ser exactamente `<targetId>.zip` (en minúsculas, con guiones, sin prefijo ni extensión adicional). El `postinstall-tts.ts` del paquete NPM depende de este naming exacto.

El modelo de voz `es_MX-claude-high` (archivos `.onnx` y `.onnx.json`) NO SHALL incluirse dentro del ZIP. Se publica como dos assets separados en la misma Release, bajo el path `voices/es_MX-claude-high/`.

El pipeline SHALL crear la Release con el tag `tts-sidecar-v<semver>` donde `<semver>` es la versión del crate Rust (de `Cargo.toml`). El tag NO SHALL ser el version del repo (p. ej. no `v1.0.0`); SHALL incluir el prefijo `tts-sidecar-` para distinguirlo de otros tags del repo.

El pipeline SHALL generar `tts-sidecar.sha256` con SHA256 reales (reemplazando los placeholders `0000…` y `0.0.0-placeholder`) tanto para los 5 ZIPs como para los 2 archivos de voz, y SHALL commitear ese archivo al repo como parte del job de release.

#### Scenario: CI matrix compila para los 5 targets sin errores
- **WHEN** se dispara el pipeline `.gitlab-ci.yml` (en push de tag `tts-sidecar-v*` o manual via `workflow_dispatch` en GitLab)
- **THEN** SHALL haber exactamente 5 jobs de build más 1 job de release
- **AND** cada job de build SHALL completar con código 0
- **AND** cada job SHALL producir un ZIP con el layout declarado arriba
- **AND** el nombre del asset SHALL coincidir con el `targetId` de su triple Rust según la tabla de mapping

#### Scenario: SHA256 real se genera y verifica contra el archivo publicado
- **WHEN** el job de release calcula SHA256 de los 5 ZIPs y de los 2 archivos de voz
- **THEN** SHALL escribir `tts-sidecar.sha256` con la estructura documentada y con hashes reales
- **AND** SHALL commitear ese archivo al repo
- **AND** SHALL subir los 5 ZIPs + 2 archivos de voz como assets de la Release `tts-sidecar-v<semver>`

#### Scenario: ZIP descargado extrae al layout esperado
- **GIVEN** el ZIP `windows-amd64.zip` publicado en la Release
- **WHEN** el `postinstall-tts.ts` lo extrae sobre `vendor/tts-sidecar/`
- **THEN** SHALL existir `vendor/tts-sidecar/windows-amd64/tts-sidecar.exe`
- **AND** SHALL existir `vendor/tts-sidecar/windows-amd64/libespeak-ng.dll`
- **AND** SHALL existir el directorio `vendor/tts-sidecar/windows-amd64/espeak-ng-data/` con al menos un archivo adentro
- **AND** SHALL NO existir ningún archivo suelto en la raíz de `vendor/tts-sidecar/` que no esté bajo un subdirectorio `<targetId>/`

