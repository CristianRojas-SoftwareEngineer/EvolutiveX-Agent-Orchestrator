# Especificación: tts-sidecar-binary-distribution

## Propósito
Definir los requisitos del pipeline de CI que produce, empaqueta y publica los binarios del sidecar TTS (`tts-sidecar`, basado en sherpa-onnx + CPAL) para cinco plataformas, de forma que el postinstall NPM pueda descargarlos y verificarlos con SHA256 real.

---

## Requirements

### Requirement: Pipeline de CI para binarios sherpa-onnx en 5 plataformas
El sistema SHALL ejecutar un pipeline de CircleCI que compile el binario `tts-sidecar` (basado en sherpa-onnx + CPAL) para cinco targets. La correspondencia entre el target del job y el executor SHALL ser exactamente la siguiente:

| Triple Rust (job CI)                | Executor CircleCI          | Asset publicado     |
|-------------------------------------|-----------------------------|---------------------|
| `x86_64-pc-windows-msvc`            | `windows-amd64`              | `windows-amd64.zip` |
| `x86_64-unknown-linux-gnu`          | `linux-amd64`               | `linux-amd64.zip`  |
| `aarch64-unknown-linux-gnu`        | `linux-aarch64`             | `linux-aarch64.zip` |
| `x86_64-apple-darwin`              | `macos-amd64`               | `macos-amd64.zip`  |
| `aarch64-apple-darwin`             | `macos-aarch64`             | `macos-aarch64.zip` |

Cada job SHALL bundlear `libespeak-ng` y `espeak-ng-data/` dentro del ZIP, junto al binario, bajo el directorio `<targetId>/` en la raíz del ZIP. El layout exacto SHALL ser:

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
- **WHEN** se dispara el pipeline `.gitlab-ci.yml` (en push de tag `tts-sidecar-v*` o manual via web)
- **THEN** SHALL haber exactamente 5 jobs de build más 1 job de release
- **AND** cada job de build SHALL completar con código 0
- **AND** cada job SHALL producir un ZIP con el layout declarado arriba
- **AND** el nombre del asset SHALL coincidir con el `targetId` de su triple Rust según la tabla de mapping

#### Scenario: job windows-amd64 reconoce rustup tras instalar con choco
- **WHEN** el `before_script` del job `build:windows-amd64` ejecuta `choco install -y rust-ms`
- **AND** a continuación recarga el PATH con `[System.Environment]::GetEnvironmentVariable`
- **THEN** el comando `rustup default stable` SHALL completar con código 0
- **AND** SHALL NO producir el error `'rustup' is not recognized`

#### Scenario: build_template omite apt-get en runners no Linux
- **WHEN** `.build_template` se ejecuta en un runner de macOS o Windows
- **THEN** los comandos `apt-get update` y `apt-get install` SHALL ser omitidos sin error
- **AND** el job SHALL continuar con los pasos siguientes sin fallar con exit 127

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

#### Scenario: macOS build bundlea libespeak-ng.dylib
- **GIVEN** el job `build:macos-amd64` o `build:macos-aarch64`
- **WHEN** el pipeline ejecuta los pasos de build
- **THEN** SHALL copiar `libespeak-ng.dylib` al directorio `<targetId>/` dentro del ZIP
- **AND** SHALL copiar el directorio `espeak-ng-data/` con su contenido

#### Scenario: Windows build bundlea libespeak-ng.dll
- **GIVEN** el job `build:windows-amd64`
- **WHEN** el pipeline ejecuta los pasos de build
- **THEN** SHALL copiar `libespeak-ng.dll` al directorio `<targetId>/` dentro del ZIP
- **AND** SHALL copiar el directorio `espeak-ng-data/` con su contenido

#### Scenario: Linux build bundlea libespeak-ng.so
- **GIVEN** el job `build:linux-amd64` o `build:linux-aarch64`
- **WHEN** el pipeline ejecuta los pasos de build
- **THEN** SHALL copiar `libespeak-ng.so` al directorio `<targetId>/` dentro del ZIP
- **AND** SHALL copiar el directorio `espeak-ng-data/` con su contenido

---

### Requirement: Manifiesto `tts-sidecar.sha256` con estructura versionada
El sistema SHALL mantener un archivo `tts-sidecar.sha256` en la raíz del repo con la siguiente estructura:

```json
{
  "version": "<semver del crate, p. ej. 0.1.0>",
  "binaries": {
    "<targetId>": {
      "file": "<targetId>.zip",
      "sha256": "<sha256 hex del archivo ZIP>"
    }
  },
  "voices": {
    "<voice>": {
      "model":  "voices/<voice>/<voice>.onnx",
      "config": "voices/<voice>/<voice>.onnx.json",
      "sha256": {
        "model":  "<sha256 hex del .onnx>",
        "config": "<sha256 hex del .onnx.json>"
      }
    }
  }
}
```

Donde `<targetId>` SHALL ser uno de: `windows-amd64`, `linux-amd64`, `linux-aarch64`, `macos-amd64`, `macos-aarch64`.

El campo `binaries.<targetId>.file` SHALL apuntar al **archivo ZIP** (no al binario extraído dentro del ZIP). El campo `binaries.<targetId>.sha256` SHALL ser el SHA256 del ZIP completo.

El campo `voices.<voice>.model` y `voices.<voice>.config` SHALL ser paths **relativos a `TTS_SIDECAR_BASE_URL`** (p. ej. `voices/es_MX-claude-high/es_MX-claude-high.onnx`), de modo que la URL de descarga se construye como `<BASE_URL><model>` directamente. El `postinstall-tts.ts` SHALL colocar el archivo descargado en `vendor/tts-sidecar/voices/<voice>/<basename>` (usando solo el nombre base del path), y SHALL NOT re-anteponer el prefijo `voices/<voice>/` al valor del manifiesto.

Inicialmente (antes del primer run del pipeline) el archivo contiene placeholders (`version: "0.0.0-placeholder"`, hashes `0000…`). El pipeline SHALL reemplazar los placeholders con valores reales en su job de release.

#### Scenario: Estructura del manifiesto es la esperada
- **WHEN** el implementer lee `tts-sidecar.sha256`
- **THEN** SHALL tener el campo `version` con semver (o placeholder)
- **AND** SHALL tener el campo `binaries` con exactamente 5 entradas (una por `targetId` soportado)
- **AND** SHALL tener el campo `voices` con al menos la entrada `es_MX-claude-high`
- **AND** SHALL NO tener la entrada `es_MX-claude-voice-medium` (nombre incorrecto que este delta elimina)

---

### Requirement: Trigger del pipeline sobre tags `tts-sidecar-v*`
El pipeline SHALL dispararse en `push` de tags que coincidan con el patrón `tts-sidecar-v*` (p. ej. `tts-sidecar-v0.1.0`, `tts-sidecar-v1.2.3`). NO SHALL dispararse en pushes a ramas (las Releases se crean solo desde tags explícitos del sidecar). El pipeline SHALL también soportar ejecución manual desde la UI de GitLab (útil para regenerar la Release sin bump de versión).

#### Scenario: Push de tag dispara el pipeline
- **WHEN** se pushea el tag `tts-sidecar-v0.1.0`
- **THEN** SHALL ejecutarse el pipeline automáticamente
- **AND** SHALL crear la Release `tts-sidecar-v0.1.0` con los assets

#### Scenario: Push a rama NO dispara el pipeline
- **WHEN** se pushea un commit a `main` o cualquier rama
- **THEN** SHALL NO ejecutarse el pipeline (solo tags `tts-sidecar-v*` lo disparan)

---

### Requirement: MSRV declarado en Cargo.toml y árbol de dependencias congelado en Cargo.lock
El crate `sidecar/` SHALL declarar `rust-version = "1.88"` en su `Cargo.toml` de forma que `cargo check` y `cargo build` rechacen toolchains anteriores con un error explícito antes de intentar compilar.

El archivo `sidecar/Cargo.lock` SHALL existir en el repositorio, generado mediante `cargo generate-lockfile`, para que el árbol de dependencias quede congelado entre ejecuciones del pipeline y el MSRV no sea un blanco móvil.

#### Scenario: cargo check rechaza toolchain anterior al MSRV
- **WHEN** se ejecuta `cargo check` con una toolchain `rustc` anterior a `1.88`
- **THEN** SHALL fallar con un error que menciona `rust-version = "1.88"` del `Cargo.toml`
- **AND** SHALL NO intentar compilar el crate

#### Scenario: Cargo.lock está presente y versionado
- **WHEN** se clona el repositorio en un entorno limpio
- **THEN** SHALL existir el archivo `sidecar/Cargo.lock` en el árbol de trabajo
- **AND** `cargo build` en ese directorio SHALL usar las versiones de dependencias registradas en `Cargo.lock` sin resolución adicional
