## Context

El pipeline CircleCI actual (`config.yml`) compila y empaqueta `tts-sidecar` para tres plataformas:
- Linux x86_64 (líneas 9-61)
- Windows x86_64 (líneas 66-134)
- macOS Universal (líneas 139-202)

El spec `tts-sidecar-binary-distribution` (líneas 29-37 del requirement) declara que cada ZIP debe contener:
- `tts-sidecar[.exe]`
- `libespeak-ng.{dll,so,dylib}`
- `espeak-ng-data/`

**Estado actual**:
- **Linux**: Copia `libespeak-ng.so` condicionalmente (línea 49) y `espeak-ng-data/` condicionalmente (líneas 50-54). Funciona parcialmente.
- **Windows**: NO copia `libespeak-ng.dll` ni `espeak-ng-data/`. Solo el binario.
- **macOS**: NO copia `libespeak-ng.dylib` ni `espeak-ng-data/`. Solo el binario.

## Goals / Non-Goals

**Goals:**
- Modificar el job `tts-sidecar-windows-x86_64` para copiar `libespeak-ng.dll` y `espeak-ng-data/` al directorio de staging antes de comprimir el ZIP
- Modificar el job `tts-sidecar-macos-universal` para copiar `libespeak-ng.dylib` y `espeak-ng-data/` al directorio de staging antes de comprimir el tarball
- Verificar que el layout del ZIP/tarball coincida con el requirement del spec

**Non-Goals:**
- No modificar la lógica de compilación de Rust
- No agregar nuevos targets de compilación (aarch64 Linux ya está en el pipeline pero no se usa actualmente)
- No modificar el sistema de cache ni la configuración de retención

## Decisions

### D1: Origen de libespeak-ng en cada plataforma

| Plataforma | Origen decidido | Justificación |
|-------------|-----------------|---------------|
| Linux       | `/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1` o `/usr/lib/libespeak-ng.so.1` | Ya instalado vía `libespeak-ng-dev` en el container |
| Windows    | Descargar desde releases de espeak-ng | No hay package manager estándar; se descarga el binario precompilado |
| macOS      | Instalar vía Homebrew (`brew install espeak-ng`) y copiar desde `$(brew --prefix)/lib` | El executor de macOS tiene Homebrew disponible |

### D2: Origen de espeak-ng-data/

| Plataforma | Origen decidido | Justificación |
|-------------|-----------------|---------------|
| Linux       | `/usr/share/espeak-ng-data` o `/usr/lib/x86_64-linux-gnu/espeak-ng-data` | Instalado vía paquete |
| Windows    | Descargar desde releases de espeak-ng | Included en el release precompilado |
| macOS      | Copiar desde `$(brew --prefix)/share/espeak-ng-data` | Homebrew instala los datos |

### D3: Formato de distribución

| Plataforma | Formato actual | Formato nuevo (spec) |
|-------------|---------------|-------------------|
| Linux       | `.zip`          | `.zip` (sin cambio) |
| Windows    | `.zip`          | `.zip` (sin cambio) |
| macOS      | `.tar.gz`       | `.zip` (unificar a .zip para consistencia) |

**Decisión**: Unificar macOS a formato `.zip` para mantener consistencia con Linux y Windows y cumplir el layout declarado en el spec.

## Risks / Trade-offs

**[R1] Descarga de espeak-ng en Windows puede fallar si la URL cambia**
→ Mitigación: Usar una URL estable de GitHub releases (espeak-ng releases son bastante estables desde 2019). Incluir fallback a la URL directa del source.

**[R2] Homebrew no disponible en el executor de macOS**
→ Mitigación: Verificar en la documentación de CircleCI que `macos` executor siempre tiene Homebrew preinstalado. Si no, instalar como parte del setup.

**[R3] El directorio espeak-ng-data/ contiene muchos archivos pequeños**
→ Mitigación: El spec permite el directorio dentro del ZIP. No es necesario aplanar archivos.

**[R4] Cambio de formato en macOS (tar.gz → zip)**
→ Mitigación: El pipeline usa `zip` en Linux y Windows; cambiar a `zip` en macOS es consistente y simplifica el postinstall.