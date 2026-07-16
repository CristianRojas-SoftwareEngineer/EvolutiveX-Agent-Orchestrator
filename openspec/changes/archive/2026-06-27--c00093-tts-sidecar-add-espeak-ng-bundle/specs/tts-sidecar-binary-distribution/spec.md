## MODIFIED Requirements

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

- En **Linux**: `libespeak-ng.so` + directorio `espeak-ng-data/`
- En **Windows**: `libespeak-ng.dll` + directorio `espeak-ng-data/`
- En **macOS**: `libespeak-ng.dylib` + directorio `espeak-ng-data/`

El nombre del archivo ZIP SHALL ser exactamente `<targetId>.zip` (en minúsculas, con guiones, sin prefijo ni extensión adicional).

El modelo de voz `es_MX-claude-high` (archivos `.onnx` y `.onnx.json`) NO SHALL incluirse dentro del ZIP. Se publica como dos assets separados en la misma Release, bajo el path `voices/es_MX-claude-high/`.

**Nota sobre espeak-ng**: `espeak-ng` es el **phonemizer requerido por sherpa-onnx** para convertir texto fonemas antes de la síntesis de voz. NO es un fallback TTS ni una voz alternativa.

#### Scenario: CI matrix compila para los 5 targets sin errores
- **WHEN** se dispara el pipeline CircleCI (en push de tag `tts-sidecar-v*` o manual via web)
- **THEN** SHALL haber exactamente 5 jobs de build más 1 job de release
- **AND** cada job de build SHALL completar con código 0
- **AND** cada job SHALL producir un ZIP con el layout declarado arriba
- **AND** el nombre del asset SHALL coincidir con el `targetId` de su triple Rust según la tabla de mapping

#### Scenario: ZIP descargado extrae al layout esperado
- **GIVEN** el ZIP `windows-amd64.zip` publicado en la Release
- **WHEN** se extrae sobre el directorio de instalación
- **THEN** SHALL existir `<directorio>/windows-amd64/tts-sidecar.exe`
- **AND** SHALL existir `<directorio>/windows-amd64/libespeak-ng.dll`
- **AND** SHALL existir el directorio `<directorio>/windows-amd64/espeak-ng-data/` con al menos un archivo adentro

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