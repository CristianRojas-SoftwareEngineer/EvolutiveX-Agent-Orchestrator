# tts-sidecar: Build Multi-Platform CI Pipeline

## Qué es tts-sidecar

Sidecar de síntesis de voz TTS escrito en Rust. Recibe comandos JSON por stdin y reproduce audio por el dispositivo de salida por defecto.

**Stack:**
- `sherpa-onnx` — sintetizador TTS (modelos ONNX)
- `cpal` — reproducción de audio cross-platform
- `espeak-ng` — phonemizer para sherpa-onnx (convierte texto a fonemas) + datos de voz

**Protocolo STDIN/JSON:**
```
Entrada:  {"cmd":"speak","text":"...","voice":"..."}
Salida OK:    {"status":"ok"}
Salida error: {"status":"error","reason":"..."}
```

## Plataformas y targets de compilación

| Job CircleCI | Executor | Target Rust | ZIP output |
|---|---|---|---|
| `download-model` | Docker `cimg/base:stable` | N/A (descarga modelo de HuggingFace) | Workspace compartido |
| `linux-amd64` | Docker `cimg/rust:1.88.0` | `x86_64-unknown-linux-gnu` | `linux-amd64.zip` |
| `windows-amd64` | `windows-server-2022-gui` | `x86_64-pc-windows-msvc` | `windows-amd64.zip` |
| `macos-amd64` | macOS `m4pro.medium` + Xcode 16.4 | `aarch64-apple-darwin` + `x86_64-apple-darwin` → `lipo` | `macos-amd64.zip` |

El job `download-model` descarga el modelo de voz desde HuggingFace, aplica el patch de metadatos ONNX (sample_rate, n_speakers, etc.), y comparte el modelo vía workspace con los 3 jobs de compilación. Los tres jobs de build corren en paralelo tras `download-model`.

## Toolchain Rust

### Linux
- Imagen Docker `cimg/rust:1.88.0` incluye Rust preinstalado.
- Target añadido: `x86_64-unknown-linux-gnu`.
- Dependencias del sistema: `libasound2-dev`, `libespeak-ng-dev`, `espeak-ng-data`, `zip`.

### Windows
- Executor `windows-server-2022-gui` (shell Bash + PowerShell para steps nativos).
- Rust instalado via `rustup-init.exe` si no está en caché.
- Target: `x86_64-pc-windows-msvc` — **sin gcc externo**, evita MinGW.
- `CARGO_HOME` y `RUSTUP_HOME` fijados en el `environment:` del job a paths absolutos.

### macOS
- Xcode 16.4 con Rust via `rustup`.
- Targets: `aarch64-apple-darwin` (nativo Apple Silicon) + `x86_64-apple-darwin` (Intel).
- Binary universal creado con `lipo -create`.
- `rustup target add` dentro del bloque condicional — solo se ejecuta si `rustup` no existe.

## Estrategia de caché

### Separación registry vs. target

La caché se divide en dos partes independientes para evitar que cambios en `target/` invaliden el `registry/` (donde están las dependencias compiladas):

| Clave | Contenido |
|---|---|
| `cargo-{os}-registry-{{ checksum }}` | `~/.cargo/registry`, `~/.cargo/git` |
| `cargo-{os}-target-{{ checksum }}` | `sidecar/target` |

Esto reduce drásticamente el tiempo de compilación en runs subsecuentes — las dependencias ya están descargadas y compiladas.

### Retención

`retention.caches: 1d` en los tres jobs. `Cargo.lock` cambia con frecuencia, así que retener caché más de 1 día genera almacenamiento innecesario sin beneficio.

### Paths Windows

CircleCI en Windows resuelve `%USERPROFILE%` a `C:\Users\circleci`. En `save_cache` se usan **forward slashes** (`C:/Users/circleci/.cargo/registry`) — CircleCI no maneja bien los backslashes en paths de caché.

## Empaquetado de artefactos

Cada job produce un ZIP con el binario, `libespeak-ng`, `espeak-ng-data/` y el modelo de voz. El layout exacto dentro del ZIP es:

```
<targetId>.zip
└── <targetId>/
    ├── tts-sidecar[.exe]
    ├── libespeak-ng.{dll,so,dylib}
    ├── espeak-ng-data/...
    └── vendor/
        └── tts-sidecar/
            └── voices/
                └── es_MX-claude-high/
                    ├── es_MX-claude-high.onnx
                    └── es_MX-claude-high.onnx.json
```

| Plataforma | Library | ZIP output |
|---|---|---|
| Linux amd64 | `libespeak-ng.so` | `linux-amd64.zip` |
| Windows amd64 | `libespeak-ng.dll` | `windows-amd64.zip` |
| macOS Universal | `libespeak-ng.dylib` | `macos-amd64.zip` |

El modelo de voz `es_MX-claude-high` se descarga desde Hugging Face en el job `download-model` del pipeline CircleCI y se incluye dentro del ZIP de cada plataforma. El postinstall NPM no necesita descargar la voz por separado — una sola descarga del ZIP y todo está listo.

## Configuración de CircleCI

Archivo: [`.circleci/config.yml`](.circleci/config.yml)

```yaml
workflows:
  build-all:
    jobs:
      - download-model
      - linux-amd64:
          requires:
            - download-model
      - windows-amd64:
          requires:
            - download-model
      - macos-amd64:
          requires:
            - download-model
```

Jobs con nombre descriptivo (`{os}-{arch}`) y steps con el formato:

```
{acción} {artifact} ({mode}, {target})
```

Ejemplo: `"Compilar tts-sidecar (release, x86_64-pc-windows-msvc)"`

## Notas de debugging

### Windows: `msiexec /a` no extrae archivos en executor headless

Síntoma: el directorio `espeak-ext/` queda vacío y el bundle no incluye `libespeak-ng.dll` ni `espeak-ng-data/`.

Causa: `msiexec /a` (admin install mode) requiere desktop interactivo y falla silenciosamente en executors headless de CircleCI.
Solución: usar `choco install -y espeak-ng` que usa el MSI con flags `/quiet /qn` (sin admin mode) y funciona en executors headless. Los archivos quedan en `C:\Program Files\eSpeak NG\`.

### macOS: `~/.cargo/env` not found

Síntoma: `rustup-init` genera un path con `~` literal.

Causa: el `$HOME` del executor macOS de CircleCI contiene `~` en la ruta. No fijar `CARGO_HOME` ni `RUSTUP_HOME` en el `environment:` del job — rustup y Cargo usan sus defaults internos que sí funcionan.

### Linux: `CARGO_HOME: ~/.cargo` rompe la caché

Causa: YAML no expande `~` en `environment:` — pasa el path literal `~/.cargo` a Cargo.
Solución: no fijar `CARGO_HOME` en el `environment:` del job; la imagen Docker tiene los defaults correctos.

## Dependencias externas

| Dependencia | Rol | Proveniencia |
|---|---|---|
| `sherpa-onnx` | Síntesis TTS con modelos ONNX | Crates.io |
| `cpal` | Audio output cross-platform | Crates.io |
| `espeak-ng` | Phonemizer para sherpa-onnx (convierte texto a fonemas) + datos de voz | Sistema (Linux/macOS) o bundled (Windows) |
| `rustup` | Gestor de toolchain Rust | Descargado en runtime (Windows/macOS) |
