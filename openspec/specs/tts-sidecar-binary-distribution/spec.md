# Especificación: tts-sidecar-binary-distribution

## Propósito
Definir los requisitos del pipeline de CI que produce, empaqueta y publica los binarios del sidecar TTS (`tts-sidecar`, basado en sherpa-onnx + CPAL) para cinco plataformas, de forma que el postinstall NPM pueda descargarlos y verificarlos con SHA256 real.

---

## Requirements

### Requirement: Pipeline de CI para binarios sherpa-onnx en 5 plataformas
El sistema SHALL ejecutar un workflow de GitHub Actions (`.github/workflows/tts-sidecar-release.yml`) con una estrategia matrix que compile el binario `tts-sidecar` (basado en sherpa-onnx + CPAL) **desde el crate versionado en `sidecar/`** (NO desde `vendor/tts-sidecar/`, que está gitignored y solo aloja la instalación de runtime) para cinco targets. La correspondencia entre el target del job CI (triple Rust) y el nombre del asset publicado (`<targetId>.zip`) SHALL ser exactamente la siguiente:

| Triple Rust (job CI)                | Runner GitHub Actions         | Asset publicado     |
|-------------------------------------|-------------------------------|---------------------|
| `x86_64-pc-windows-msvc`            | `windows-latest`              | `windows-amd64.zip` |
| `x86_64-unknown-linux-gnu`          | `ubuntu-latest`               | `linux-amd64.zip`   |
| `aarch64-unknown-linux-gnu`         | `ubuntu-latest` (cross)       | `linux-aarch64.zip` |
| `x86_64-apple-darwin`               | `macos-13`                    | `macos-amd64.zip`   |
| `aarch64-apple-darwin`              | `macos-14-arm64`              | `macos-aarch64.zip` |

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

El workflow SHALL crear la Release con el tag `tts-sidecar-v<semver>` donde `<semver>` es la versión del crate Rust (de `Cargo.toml`). El tag NO SHALL ser el version del repo (p. ej. no `v1.0.0`); SHALL incluir el prefijo `tts-sidecar-` para distinguirlo de otros tags del repo.

El workflow SHALL generar `tts-sidecar.sha256` con SHA256 reales (reemplazando los placeholders `0000…` y `0.0.0-placeholder`) tanto para los 5 ZIPs como para los 2 archivos de voz, y SHALL commitear ese archivo al repo como parte del job de release.

#### Scenario: CI matrix compila para los 5 targets sin errores
- **WHEN** se dispara el workflow `tts-sidecar-release.yml` (en push de tag `tts-sidecar-v*` o manual via `workflow_dispatch`)
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

Inicialmente (antes del primer run del workflow) el archivo contiene placeholders (`version: "0.0.0-placeholder"`, hashes `0000…`). El workflow SHALL reemplazar los placeholders con valores reales en su job de release.

#### Scenario: Estructura del manifiesto es la esperada
- **WHEN** el implementer lee `tts-sidecar.sha256`
- **THEN** SHALL tener el campo `version` con semver (o placeholder)
- **AND** SHALL tener el campo `binaries` con exactamente 5 entradas (una por `targetId` soportado)
- **AND** SHALL tener el campo `voices` con al menos la entrada `es_MX-claude-high`
- **AND** SHALL NO tener la entrada `es_MX-claude-voice-medium` (nombre incorrecto que este delta elimina)

---

### Requirement: Trigger del workflow sobre tags `tts-sidecar-v*`
El workflow SHALL dispararse en `push` de tags que coincidan con el patrón `tts-sidecar-v*` (p. ej. `tts-sidecar-v0.1.0`, `tts-sidecar-v1.2.3`). NO SHALL dispararse en pushes a ramas (las Releases se crean solo desde tags explícitos del sidecar). El workflow SHALL también soportar `workflow_dispatch` para runs manuales (útil para regenerar la Release sin bump de versión).

#### Scenario: Push de tag dispara el workflow
- **WHEN** se pushea el tag `tts-sidecar-v0.1.0`
- **THEN** SHALL ejecutarse el workflow automáticamente
- **AND** SHALL crear la Release `tts-sidecar-v0.1.0` con los assets

#### Scenario: Push a rama NO dispara el workflow
- **WHEN** se pushea un commit a `main` o cualquier rama
- **THEN** SHALL NO ejecutarse el workflow (solo tags `tts-sidecar-v*` lo disparan)
