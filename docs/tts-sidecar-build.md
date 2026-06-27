# tts-sidecar: Build Multi-Platform CI Pipeline

## Qué es tts-sidecar

Sidecar de síntesis de voz TTS escrito en Rust. Recibe comandos JSON por stdin y reproduce audio por el dispositivo de salida por defecto.

**Stack:**
- `sherpa-onnx` — sintetizador TTS (modelos ONNX)
- `cpal` — reproducción de audio cross-platform
- `espeak-ng` — sintetizador de respaldo / datos de voz

**Protocolo STDIN/JSON:**
```
Entrada:  {"cmd":"speak","text":"...","voice":"..."}
Salida OK:    {"status":"ok"}
Salida error: {"status":"error","reason":"..."}
```

## Plataformas y targets de compilación

| Job CircleCI | Executor | Target Rust | Binary output |
|---|---|---|---|
| `tts-sidecar-linux-x86_64` | Docker `cimg/rust:1.88.0` | `x86_64-unknown-linux-gnu` | `tts-sidecar` |
| `tts-sidecar-windows-x86_64` | `windows-server-2022-gui` | `x86_64-pc-windows-msvc` | `tts-sidecar.exe` |
| `tts-sidecar-macos-universal` | macOS `m4pro.medium` + Xcode 16.4 | `aarch64-apple-darwin` + `x86_64-apple-darwin` → `lipo` | `tts-sidecar-macos-universal` |

Los tres jobs corren en paralelo en el workflow `build-all`.

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

Cada job produce un artefacto compressado con su binario y las dependencias necesarias:

### Linux (`.zip`)
```
staging/
  tts-sidecar
  libespeak-ng.so.1      # library
  espeak-ng-data/        # datos de voz
tts-sidecar-linux-x86_64.zip
tts-sidecar-linux-x86_64.sha256.txt
```

### Windows (`.zip` via PowerShell)
```
staging/
  tts-sidecar.exe
tts-sidecar-windows-x86_64.zip
tts-sidecar-windows-x86_64.sha256.txt
```

### macOS (`.tar.gz`)
```
tts-sidecar-macos-universal    # fat binary (arm64 + x86_64)
tts-sidecar-macos-universal.tar.gz
tts-sidecar-macos-universal.sha256.txt
```

## Configuración de CircleCI

Archivo: [`.circleci/config.yml`](.circleci/config.yml)

```yaml
workflows:
  build-all:
    jobs:
      - tts-sidecar-linux-x86_64
      - tts-sidecar-windows-x86_64
      - tts-sidecar-macos-universal
```

Jobs con nombre descriptivo (`tts-sidecar-{os}-{arch}`) y steps con el formato:

```
{acción} {artifact} ({mode}, {target})
```

Ejemplo: `"Compilar tts-sidecar (release, x86_64-pc-windows-msvc)"`

## Notas de debugging

### Windows: caché no se restaura

Síntoma: Cargo descarga todas las dependencias en cada run.

1. Verificar que `%USERPROFILE%` resuelve a `C:\Users\circleci` — `echo $env:USERPROFILE` en PowerShell.
2. Confirmar que los paths en `save_cache` usan forward slashes (`C:/Users/...`) y no backslashes.
3. Confirmar que `CARGO_HOME` y `RUSTUP_HOME` están fijados como variables de entorno del job.

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
| `espeak-ng` | Fallback TTS + datos de voz | Sistema (Linux/macOS) o bundled (Windows) |
| `rustup` | Gestor de toolchain Rust | Descargado en runtime (Windows/macOS) |
