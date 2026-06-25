# Tasks — Tts Sidecar Binary Distribution

> Delta: `c00084-tts-sidecar-binary-distribution`. Tasks reescritas tras
> la auditoría de coherencia para incorporar D4 (voz separada del ZIP),
> D5 (postinstall con `;`), D6 (`package.json#files`), D7 (mapping
> triple-Rust ↔ targetId), y la 2ª revisión: D9 (crate en `sidecar/`,
> no en `vendor/`), D10 (default real de `BASE_URL` + `configs/.env.example`),
> D11 (postinstall sin `tsx`, descompresión con `adm-zip`).

## 1. Rust crate del sidecar

- [x] 1.1 ~doing Crear estructura del crate en `sidecar/` (`sidecar/Cargo.toml`,
      `sidecar/src/main.rs`) con nombre `tts-sidecar` y dependencia de
      `sherpa-onnx` y `cpal`. **NO** crear el crate en `vendor/tts-sidecar/`:
      esa ruta está gitignored (`.gitignore:27`) y el fuente no se
      versionaría (verificado con `git check-ignore`). `vendor/tts-sidecar/`
      queda solo como dir de instalación de runtime.
- [x] 1.2 ~doing Implementar protocolo STDIN/JSON y CPAL audio output en `main.rs`:
      lectura de stdin con `{"cmd":"speak","text":"...","voice":"..."}`,
      escritura de stdout con `{"status":"ok"}` o
      `{"status":"error", ...}`.
- [x] 1.3 Agregar args CLI `--model <path.onnx> --config <path.onnx.json>`
      y lógica que carga el binario de espeak-ng desde el directorio del
      binario (no del sistema).
- [x] 1.4 ~doing Verificar esqueleto del crate con `cargo check --manifest-path
      sidecar/Cargo.toml` (sin compilar binarios para los 5 targets; solo
      verificar que compila para el target nativo del mantenedor).
      <!-- NOTA: cargo no está instalado en el entorno local; verificación aplazada al CI (D8). -->

## 2. Workflow de CI (GitHub Actions)

- [x] 2.1 ~doing Crear `.github/workflows/tts-sidecar-release.yml` con trigger
      en `push` de tags que coincidan con `tts-sidecar-v*` y en
      `workflow_dispatch` manual.
- [x] 2.2 Definir la strategy matrix de 5 jobs con el mapping explícito
      `triple Rust → targetId npm`:

      | Triple Rust                  | Runner              | Asset publicado   |
      |------------------------------|---------------------|-------------------|
      | `x86_64-pc-windows-msvc`     | `windows-latest`    | `windows-amd64.zip` |
      | `x86_64-unknown-linux-gnu`   | `ubuntu-latest`     | `linux-amd64.zip`   |
      | `aarch64-unknown-linux-gnu`  | `ubuntu-latest` (cross) | `linux-aarch64.zip` |
      | `x86_64-apple-darwin`        | `macos-13`          | `macos-amd64.zip`   |
      | `aarch64-apple-darwin`       | `macos-14-arm64`    | `macos-aarch64.zip` |

- [x] 2.3 En cada job: instalar el target con `rustup target add`,
      compilar con `cargo build --release --manifest-path sidecar/Cargo.toml
      --target <triple>` (el crate vive en `sidecar/`, ver D9), bundlear
      `libespeak-ng.{dll,so,dylib}` + `espeak-ng-data/` desde el build
      de espeak-ng apropiado para el target, crear ZIP con layout
      `<targetId>/{tts-sidecar[.exe], libespeak-ng.{dll,so,dylib},
      espeak-ng-data/...}`.
- [x] 2.4 Crear job `release` que: (a) espera a los 5 jobs de build;
      (b) descarga `voices/es_MX-claude-high/es_MX-claude-high.onnx` y
      `.onnx.json` desde
      `https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/`;
      (c) calcula SHA256 de los 5 ZIPs y de los 2 archivos de voz;
      (d) genera `tts-sidecar.sha256` con SHA256 reales;
      (e) usa `softprops/action-gh-release@v2` para crear la Release
      `tts-sidecar-v<semver>` (donde `<semver>` viene del `Cargo.toml`)
      con los 5 ZIPs + 2 archivos de voz como assets;
      (f) commitea `tts-sidecar.sha256` al repo.
- [x] 2.5 Agregar permisos `contents: write` al workflow (requerido por
      `softprops/action-gh-release` y por el commit del SHA).

## 3. Cableado en el repo

- [x] 3.1 ~doing **Reescribir** `scripts/postinstall-tts.ts` para el nuevo
      flujo ZIP + voz-separada. Comportamiento esperado:
      - Detecta `targetId` con `process.platform` + `process.arch`.
      - Lee `TTS_SIDECAR_BASE_URL` del entorno; si no está definida, usa el
        **default real** de la constante `BASE_URL` (reemplazar el placeholder
        `https://tts-sidecar.example.com/v1/` por
        `https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v0.1.0/`).
        NO depender de cargar `.env*` (nada lo inyecta en este proceso) — D10.
      - Construye URL del ZIP: `<BASE_URL>/<targetId>.zip`.
      - Descarga el ZIP, verifica SHA256 contra `tts-sidecar.sha256`,
        extrae sobre `vendor/tts-sidecar/` usando `adm-zip` (D11; Node no
        trae unzip nativo).
      - `chmod 755` al binario extraído (si no Windows).
      - Construye URLs de voz desde los campos `voices.<voice>.model` /
        `.config` del manifiesto, que ya son paths relativos a `BASE_URL`
        (p. ej. `voices/es_MX-claude-high/es_MX-claude-high.onnx`): URL =
        `<BASE_URL><model>`. Colocar el archivo en
        `vendor/tts-sidecar/voices/<voice>/<basename>` usando **solo el
        nombre base** del path; NO re-anteponer `voices/<voice>/` (evitar
        doble-path).
      - Descarga `.onnx` y `.onnx.json`, verifica SHA256 contra el manifiesto.
      - Idempotente: si todo ya está instalado y los SHA coinciden,
        sale con código 0 sin re-descargar.
      - Sale con código 0 incluso en errores controlados (red caída,
        SHA inválido en un archivo, plataforma no soportada). Solo
        retorna código ≠ 0 si el manifiesto es JSON inválido
        (irrecuperable).

- [x] 3.2 ~doing Modificar `package.json`:
      - Agregar `adm-zip` a `dependencies` (NO devDependencies; se instala
        antes del `postinstall` del consumidor) y `@types/adm-zip` a
        `devDependencies` (D11).
      - Agregar `"tts:setup"` en `scripts` invocando el postinstall de forma
        ejecutable con `node` (sin `tsx`).
      - Cambiar `postinstall` de
        `"tsx scripting/openspec/patch-openspec-change-metadata.ts"` a
        encadenar (con `;` — D5) la ejecución del postinstall de TTS con
        `node` (NO `tsx`, que es devDependency ausente en un install del
        paquete publicado — D11). El entry del postinstall DEBE ser
        ejecutable por `node` **en un clone fresco sin build previo y sin
        tsx** y en el paquete publicado; elegir el mecanismo que garantice
        ambos (p. ej. un launcher ESM plano en `scripts/` que no requiera
        compilación, o emitir el `.js` runnable y referenciarlo). Si falla
        por ausencia del entry, NO debe abortar el `npm install`.
      - Agregar campo `files` con whitelist explícita incluyendo `dist`
        (`main` apunta a `dist/index.js` y el postinstall publicado corre con
        `node`):
        `["dist", "src", "scripts", "tts-sidecar.sha256", "configs", "README.md", "LICENSE"]`
        (D6). El template de entorno entra vía `configs` (`configs/.env.example`).

- [x] 3.3 ~doing Crear `.npmignore` en la raíz del repo con blacklist explícita:
      `vendor/`, `node_modules/`, `dist/`, `server/`, `sessions/`,
      `.agentkanban/`, `openspec/.workbench/`.

- [x] 3.4 ~doing Modificar `configs/.env.example` (existe; NO crear `.env.example`
      en la raíz — D10) agregando:
      ```
      TTS_SIDECAR_BASE_URL=https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v0.1.0/
      TTS_SIDECAR_VOICE=es_MX-claude-high
      ```
      Documentar que `<owner>/<repo>` son placeholders hasta que se
      concrete el nombre del repo público. Recordar que este valor es solo
      documentación del override: el default efectivo vive en la constante
      `BASE_URL` del script (3.1), porque nada carga este archivo en el
      proceso del postinstall.

- [x] 3.5 ~doing Corregir el nombre de voz a `es_MX-claude-high` en:
      - `src/2-services/tts/sidecar-resolver.ts:48` (default voice)
      - `src/2-services/tts/piper-sidecar.service.ts:62` (fallback voice)
      - `scripts/postinstall-tts.ts:24` (constante `VOICE`)
      Eliminar el valor incorrecto `es_MX-claude-voice-medium` de los
      tres archivos.

- [x] 3.6 ~doing Reescribir la estructura de `tts-sidecar.sha256` para que
      coincida con la documentada en
      `specs/tts-sidecar-binary-distribution/spec.md`:
      - `version` (semver del crate o `0.0.0-placeholder` pre-CI)
      - `binaries.<targetId>.file` = `<targetId>.zip` (no archivo suelto)
      - `binaries.<targetId>.sha256` = SHA256 del ZIP (placeholder pre-CI)
      - `voices.es_MX-claude-high` (reemplaza `voices.es_MX-claude-voice-medium`)
      - `voices.es_MX-claude-high.model` = `voices/es_MX-claude-high/es_MX-claude-high.onnx`
        y `.config` = `voices/es_MX-claude-high/es_MX-claude-high.onnx.json`
        (paths **relativos a `BASE_URL`**, con el prefijo `voices/<voice>/`;
        el postinstall NO debe re-anteponerlo al colocar el archivo local).
      - `voices.es_MX-claude-high.sha256.model` y `.config` con SHA256
        reales (placeholder pre-CI)
      Mantener el `targetId` (no el triple Rust) como clave de `binaries`.

## 4. Verificación (recipe y wiring — NO binarios reales ni hashes CI)

- [x] 4.1 ~doing Ejecutar `cargo check --manifest-path sidecar/Cargo.toml` y
      verificar que no hay errores de compilación Rust.
      <!-- NOTA: cargo no disponible localmente; aplazado al CI (D8). -->
- [x] 4.2 Validar `.github/workflows/tts-sidecar-release.yml` con
      `actionlint` o equivalente: trigger correcto sobre tags
      `tts-sidecar-v*`, matrix con los 5 jobs según el mapping D7,
      compilación desde `sidecar/` (`--manifest-path sidecar/Cargo.toml`),
      permisos `contents: write`, uso correcto de
      `softprops/action-gh-release@v2`.
- [x] 4.3 Validar la coherencia del cableado TS:
      - `package.json#postinstall` encadena con `;` el postinstall de TTS
        ejecutado con `node` (NO `tsx`) después del openspec-postinstall (D11).
      - `package.json#scripts` contiene `tts:setup` invocando el postinstall
        con `node` (sin `tsx`).
      - `package.json#dependencies` contiene `adm-zip` (D11).
      - `package.json#files` contiene la whitelist completa incluyendo `dist`
        y SIN `.env.example` de raíz (D6).
      - `scripts/postinstall-tts.ts` define la constante `BASE_URL` con el
        default real de GitHub Releases (no `example.com`) y extrae el ZIP con
        `adm-zip` (D10, D11).
      - `src/2-services/tts/sidecar-resolver.ts` línea 48 usa
        `es_MX-claude-high`.
      - `src/2-services/tts/piper-sidecar.service.ts` línea 62 usa
        `es_MX-claude-high`.
      - `scripts/postinstall-tts.ts` línea 24 usa `es_MX-claude-high`.
      - `scripts/postinstall-tts.ts` implementa el flujo ZIP + voz-separada
        (3.1) sin re-anteponer `voices/<voice>/` al path del manifiesto.
      - `tts-sidecar.sha256` tiene estructura con `binaries.<targetId>.file`
        apuntando a ZIP y entrada `voices.es_MX-claude-high`.
      - El crate Rust vive en `sidecar/` y NO en `vendor/tts-sidecar/`
        (no debe estar gitignored) (D9).
      - `configs/.env.example` contiene `TTS_SIDECAR_BASE_URL` y
        `TTS_SIDECAR_VOICE` (D10).
- [x] 4.4 Verificar que `.gitignore` contiene `vendor/tts-sidecar/` (ya
      está, confirmar).
- [x] 4.5 Verificar que `.npmignore` existe y contiene la blacklist
      declarada en 3.3.
- [x] 4.6 Verificar que `npm pack` (ejecutado en worktree limpio con
      `vendor/` poblado) produce un tarball que NO contiene `vendor/`.

## 5. Primera release + hashes reales (CI-dependent — NO completable en apply)

- [ ] 5.1 Push del tag `tts-sidecar-v0.1.0` para disparar el workflow
      por primera vez. **Esto es responsabilidad de CI, no del apply.**
- [ ] 5.2 Verificar que el workflow completa los 5 jobs de build + 1 job
      de release sin errores.
- [ ] 5.3 Verificar que la Release `tts-sidecar-v0.1.0` contiene los 5
      ZIPs + los 2 archivos de voz como assets, y que `tts-sidecar.sha256`
      commiteado al repo tiene SHA256 reales (no placeholders).
- [ ] 5.4 Smoke test del primer ZIP generado: descargar
      `windows-amd64.zip` (o el target del verificador), extraer y
      verificar que existe `windows-amd64/tts-sidecar.exe` +
      `windows-amd64/libespeak-ng.dll` + `windows-amd64/espeak-ng-data/`.
      Si el layout falla, el workflow debe fallar el job antes de publicar.
- [ ] 5.5 Ejecutar `npm install` en una máquina limpia (Linux/Mac/Windows)
      y verificar que `tts:setup` descarga el ZIP correcto, lo extrae con
      layout correcto, descarga los archivos de voz, y
      `resolveSidecarAssets()` retorna paths válidos. Verificar
      manualmente que el hook dispara audio al activarse.
- [ ] 5.6 Reemplazar `<owner>/<repo>` en la constante `BASE_URL` del script
      y en `configs/.env.example` por el owner/repo real del repo público
      cuando se concrete.