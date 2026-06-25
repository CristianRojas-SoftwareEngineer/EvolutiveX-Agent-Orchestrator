# Design: c00086-fix-ci-msrv-and-platform-guards

## Contexto

El pipeline CI del sidecar TTS falla por cuatro causas independientes confirmadas en los logs:

- **Familia A:** Los jobs de Linux (`linux-amd64`, `linux-aarch64`) y el job `release` usan `image: rust:1.85`, pero el código emplea características de Rust `1.88`. El compilador falla antes de emitir un binario.
- **Familia B:** El job `build:windows-amd64` instala Rust vía `choco install -y rust-ms` pero la sesión PowerShell no recarga el PATH tras la instalación. La línea siguiente (`rustup default stable`) falla con `'rustup' is not recognized`.
- **Familia C:** La plantilla `.build_template` (~líneas 46-47 de `.gitlab-ci.yml`) ejecuta `apt-get update -qq` y `apt-get install -y -qq zip` sin guard de plataforma. En los runners de macOS no existe `apt-get`, lo que produce exit 127 en los jobs `macos-amd64` y `macos-aarch64`.
- **Causa raíz:** `sidecar/Cargo.lock` no existe en el repositorio. Sin él, cada ejecución del pipeline resuelve el árbol de dependencias de forma independiente, convirtiendo el MSRV en un blanco móvil.

**Estado actual:**
- Imagen Docker Linux/release: `rust:1.85`
- `sidecar/Cargo.toml`: sin campo `rust-version`
- `sidecar/Cargo.lock`: no existe en el repositorio
- `build:windows-amd64` before_script: no recarga PATH tras choco
- `.build_template`: `apt-get` sin guard de plataforma

**Constraints:**
- Los jobs de macOS usan `rustup default stable` (toolchain flotante); el MSRV solo opera en entornos donde `cargo` lee el campo `rust-version`.
- La imagen de macOS está fijada por `allowed_images` del instance runner (`macos-26-xcode-26`) y no se modifica en este delta.
- `vendor/tts-sidecar/` está gitignored; el crate fuente es `sidecar/`.
- No se toca `sidecar/src/main.rs` ni ningún otro archivo de código Rust fuera de `Cargo.toml` y `Cargo.lock`.

## Objetivos / No-Objetivos

**Objetivos:**
- Actualizar la imagen Docker de los jobs `linux-amd64`, `linux-aarch64` y `release` de `rust:1.85` a `rust:1.88`.
- Insertar la recarga de PATH en el `before_script` del job `build:windows-amd64`, entre `choco install` y `rustup default stable`.
- Envolver los comandos `apt-get` de `.build_template` en un guard de shell `if [ "$RUNNER_OS" = "Linux" ]`.
- Declarar `rust-version = "1.88"` en `sidecar/Cargo.toml` y generar `sidecar/Cargo.lock` para congelar el árbol de dependencias.
- Actualizar `openspec/specs/tts-sidecar-binary-distribution/spec.md` para reflejar todos los cambios anteriores.

**No-Objetivos:**
- Subir la versión de Rust más allá de `1.88`.
- Modificar `sidecar/src/main.rs` u otro código fuente Rust.
- Refactorizar la arquitectura del sidecar o cambiar sus dependencias.
- Introducir nueva funcionalidad o nuevos targets de compilación.
- Modificar la imagen de macOS ni su método de instalación de rustup.

## Decisiones

### D1 — MSRV en `Cargo.toml`: `rust-version = "1.88"`

**Elección:** Declarar `rust-version = "1.88"` en `[package]` de `sidecar/Cargo.toml`.

**Alternativa descartada:** No declarar MSRV (dejar que el compilador falle sin mensaje orientativo).

**Rationale:** Con `rust-version` declarado, `cargo check` y `cargo build` producen un error explícito que menciona la versión mínima requerida antes de intentar compilar. Convierte un fallo críptico en un diagnóstico accionable tanto en CI como en entornos locales. El campo es soportado desde Cargo 1.56 y no tiene coste de mantenimiento adicional.

### D2 — Árbol de dependencias congelado: generar y versionar `sidecar/Cargo.lock`

**Elección:** Ejecutar `cargo generate-lockfile` en `sidecar/` y versionar el archivo resultante.

**Alternativa descartada:** Mantener `Cargo.lock` en `.gitignore` (comportamiento actual por omisión para librerías).

**Rationale:** `sidecar/` es un binario, no una librería. La convención de la comunidad Rust es versionar `Cargo.lock` en binarios para garantizar builds reproducibles. Sin él, `cargo build` resuelve el árbol en cada ejecución y puede seleccionar versiones de dependencias que no compilan con el MSRV declarado, deshaciendo el efecto de `rust-version`. Versionar `Cargo.lock` convierte el MSRV en una propiedad estable del repositorio.

### D3 — Imagen Docker para jobs de Linux y release: `rust:1.88`

**Elección:** Fijar la imagen a `rust:1.88` en los jobs `linux-amd64`, `linux-aarch64` y `release` de `.gitlab-ci.yml`.

**Alternativa descartada:** `rust:latest` o `rust:1.88-slim`.

**Rationale:** Una imagen con versión fijada produce compilaciones deterministas. `rust:latest` puede cambiar el toolchain sin aviso, enmascarando regresiones. `rust:1.88-slim` excluye herramientas del sistema que las dependencias del sidecar pueden requerir; la imagen full es más segura sin investigación adicional del árbol.

### D4 — Recarga de PATH en Windows: `[System.Environment]::GetEnvironmentVariable`

**Elección:** Insertar `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")` en el `before_script` de `build:windows-amd64`, entre `choco install -y rust-ms` y `rustup default stable`.

**Alternativa descartada:** Invocar `refreshenv` (función de Chocolatey). `refreshenv` requiere que el módulo de Chocolatey esté cargado en la sesión, lo cual no está garantizado en todos los runners SaaS de GitLab para Windows.

**Rationale:** La API `[System.Environment]::GetEnvironmentVariable` es parte de .NET Framework y está siempre disponible en PowerShell sin dependencias externas. Lee directamente el PATH del registro del sistema y del usuario, que es exactamente lo que escribe `choco install`. Es el patrón estándar para recargar el PATH en scripts PowerShell de CI.

### D5 — Guard de plataforma en `.build_template`: `if [ "$RUNNER_OS" = "Linux" ]`

**Elección:** Envolver las líneas `apt-get update -qq` y `apt-get install -y -qq zip` de `.build_template` en `if [ "$RUNNER_OS" = "Linux" ]; then … fi`.

**Alternativa descartada:** Usar `which apt-get` como guard. Requeriría capturar la salida y evaluar el exit code, añadiendo verbosidad sin ventaja.

**Rationale:** El patrón `if [ "$RUNNER_OS" = "Linux" ]` ya existe en las líneas 49-55 del mismo template; seguirlo mantiene consistencia interna en el YAML. `$RUNNER_OS` es una variable de entorno estándar del runner de GitLab SaaS que toma los valores `Linux`, `macOS`, o `Windows`. El guard es inerte en Linux (valor esperado es `Linux`) y omite silenciosamente los comandos en macOS y Windows.

## Riesgos / Trade-offs

| Riesgo | Mitigación |
|--------|-----------|
| Imagen `rust:1.88` no recibe parches de seguridad del SO automáticamente. | Aceptable para el alcance de este delta. Futuros bumps requerirán un nuevo delta. |
| Declarar `rust-version = "1.88"` rompe entornos locales con toolchains anteriores. | El error de `cargo` es inmediato y orientativo. El desarrollador ejecuta `rustup update stable`. |
| `Cargo.lock` puede quedar desactualizado si se añaden dependencias sin regenerarlo. | El proceso estándar (`cargo add`, `cargo update`) regenera `Cargo.lock` automáticamente. |
| `$RUNNER_OS` podría no estar definida en entornos locales o runners self-hosted. | Solo afecta al step de `apt-get`, que en esos entornos se omitiría silenciosamente. Aceptable. |
| El job `release` ya usa una imagen; cambiarla de `rust:1.85` a `rust:1.88` es un cambio implícito. | La imagen del job `release` se actualiza explícitamente junto a los jobs de Linux; el spec lo documenta. |

## Plan de migración

La spec no declara ningún requirement como REMOVED; no hay código legacy que retirar.

Los archivos modificados (`.gitlab-ci.yml`, `sidecar/Cargo.toml`) y el archivo nuevo (`sidecar/Cargo.lock`) son cambios aditivos o de corrección. No se requiere estrategia de rollback más allá de revertir el commit si el pipeline falla; el estado anterior es recuperable vía git.

**Secuencia de despliegue:**
1. Añadir `rust-version = "1.88"` en `sidecar/Cargo.toml`.
2. Generar `sidecar/Cargo.lock` con `cargo generate-lockfile` y añadirlo al repositorio.
3. Actualizar imagen Docker en `.gitlab-ci.yml` (jobs `linux-amd64`, `linux-aarch64`, `release`).
4. Insertar recarga de PATH en el `before_script` de `build:windows-amd64`.
5. Envolver `apt-get` en el guard `if [ "$RUNNER_OS" = "Linux" ]` en `.build_template`.
6. Actualizar `openspec/specs/tts-sidecar-binary-distribution/spec.md`.
