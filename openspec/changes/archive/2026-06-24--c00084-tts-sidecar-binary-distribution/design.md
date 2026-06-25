# Design — Tts Sidecar Binary Distribution

> Delta: `c00084-tts-sidecar-binary-distribution`. Corrige inconsistencias
> materiales detectadas en la auditoría de coherencia entre los artefactos
> del delta y el código real del repo. Las decisiones D5–D8 se añadieron en
> la primera revisión de auditoría; D9–D11 se añaden en la segunda revisión
> (colisión del crate con `.gitignore`, entrega de `TTS_SIDECAR_BASE_URL`, y
> empaquetado del postinstall sin `tsx`). D1–D4 se conservan del diseño
> original.

## Contexto del problema (resumen)

El delta archivado `c00076-replace-gemini-tts-with-sidecar` implementó el
lado TypeScript del sidecar (`PiperSidecarService`, `sidecar-resolver`,
`ITtsSidecarService`, cableado en `composition-root`) y sus pruebas, pero
dejó sin hacer la mitad de distribución binaria. Por eso hoy no se escucha
audio TTS en eventos hook: `resolveSidecarAssets()` lanza
`SidecarNotInstalledError`, el handler lo absorbe con
`[TTS-SIDE] reason: sidecar-missing` y omite la reproducción (degradación
elegante por diseño).

**Evidencia verificada del gap:**

- Cero código Rust en el repo: no hay `*.rs` ni `Cargo.toml`.
- `vendor/tts-sidecar/` no existe.
- `tts-sidecar.sha256` tiene hashes placeholder (`0000…`, `version: 0.0.0-placeholder`).
- `package.json#postinstall` solo apunta a `scripting/openspec/patch-openspec-change-metadata.ts`;
  no hay script `tts:setup` declarado en `scripts` (el archivo `scripts/postinstall-tts.ts`
  sí existe pero no está encadenado).
- `TTS_SIDECAR_BASE_URL` es un placeholder (`https://tts-sidecar.example.com/v1/`).
- Voz por defecto hardcodeada como `es_MX-claude-voice-medium` en
  `src/2-services/tts/sidecar-resolver.ts:48`, `src/2-services/tts/piper-sidecar.service.ts:62`
  y `scripts/postinstall-tts.ts:24`.
- `tts-sidecar.sha256` también referencia la voz incorrecta en su entrada
  `voices.es_MX-claude-voice-medium`.
- `package.json` no tiene campo `files`: cualquier cosa no ignorada por
  `.gitignore` entra al tarball de NPM por defecto.

**Contrato que el código TS ya espera** (verificado en
`src/2-services/tts/sidecar-resolver.ts:36-67`):

- Binario: `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]`
- Voz:    `vendor/tts-sidecar/voices/<voice>/<voice>.onnx`
- Config: `vendor/tts-sidecar/voices/<voice>/<voice>.onnx.json`
- `<targetId>` ∈ `{windows-amd64, linux-amd64, linux-aarch64, macos-amd64, macos-aarch64}`

El resolver lanza `SidecarNotInstalledError` con mensaje accionable si
cualquier archivo falta. El handler en `piper-sidecar.service.ts:66-77`
absorbe ese error y registra `[TTS-SIDE] reason: sidecar-missing` — esta
es la degradación elegante que produce el silencio auditivo.

---

## Goals / Non-Goals

**Goals:**

- Crear el crate Rust en `sidecar/` (fuente **versionado**, ya que el
  directorio runtime `vendor/tts-sidecar/` está gitignored y solo aloja los
  binarios y la voz descargados por el postinstall) con sherpa-onnx + CPAL
  para reproducción de audio.
- Generar el workflow de CI (GitHub Actions matrix, 5 jobs) que compila el
  binario para los 5 targets, bundlea `libespeak-ng` + `espeak-ng-data/`
  dentro del ZIP por plataforma, descarga la voz y la publica como asset
  separado en la misma Release, y emite `tts-sidecar.sha256` con SHA256
  reales tanto del ZIP como de los archivos de voz.
- Crear `scripts/postinstall-tts.ts` (reescrito) que descarga el ZIP
  correspondiente a la plataforma del usuario desde la Release, verifica
  SHA256, extrae el layout interno (con la dependencia de runtime `adm-zip`)
  a `vendor/tts-sidecar/<targetId>/`, y luego descarga por separado los
  archivos de la voz verificando SHA256. El postinstall del paquete publicado
  se ejecuta con `node` sobre el script compilado (NO con `tsx`, que es
  devDependency y no está disponible en un install del consumidor).
- Agregar `tts:setup` en `package.json#scripts` ejecutando el postinstall con
  `node` (sin `tsx`, ver D11) y encadenarlo en `postinstall` con el script de
  openspec existente usando `;` como operador de chaining (degradación
  elegante: si el `tts:setup` falla, el `npm install` no aborta).
- Corregir el nombre de voz a `es_MX-claude-high` en
  `src/2-services/tts/sidecar-resolver.ts:48`,
  `src/2-services/tts/piper-sidecar.service.ts:62`,
  `scripts/postinstall-tts.ts:24` y `tts-sidecar.sha256` (entry
  `voices.es_MX-claude-high`).
- Pinear `TTS_SIDECAR_BASE_URL` con placeholder `<owner>/<repo>` en
  `configs/.env.example` (convención real del repo), formato
  `https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v<version>/`,
  y fijar ese mismo valor como **default real** de la constante `BASE_URL` del
  script (reemplazando el placeholder `https://tts-sidecar.example.com/v1/`),
  porque nada carga `.env*` en el proceso del postinstall.
- Agregar whitelist explícita en `package.json#files` para controlar qué se
  incluye en el tarball de NPM y prevenir inclusión accidental de
  `vendor/tts-sidecar/` (binarios ~100 MB) si el worktree del CI lo tiene
  poblado al publicar.
- Documentar el mapping `triple Rust (job CI) ↔ targetId (postinstall)`,
  que es la causa raíz de la inconsistencia material #1 detectada en la
  auditoría de coherencia.

**Non-Goals:**

- Este delta NO compila localmente los 5 binarios en el turno apply. Los
  binarios reales y los SHA256 vienen del primer run del workflow CI
  posterior al merge.
- Este delta NO modifica la **lógica ni el contrato** del código TypeScript
  del sidecar (`PiperSidecarService`, `ITtsSidecarService`, `ITtsSidecarAssets`,
  `resolveSidecarAssets`). La única edición sobre ese código es el **nombre de
  voz por defecto** (`es_MX-claude-voice-medium` → `es_MX-claude-high`) en
  `sidecar-resolver.ts:48` y `piper-sidecar.service.ts:62`; ningún flujo ni
  firma cambia. El resto ya existe y funciona; solo falta poblar
  `vendor/tts-sidecar/` para que se ejecute.
- Este delta NO crea un nuevo provider TTS ni cambia el flujo de fallback
  de texto (eso pertenece a c00076).
- Este delta NO incluye la voz `es_MX-claude-high` dentro del ZIP del
  binario. La voz se publica como asset separado en la misma Release.

---

## Decisiones arquitectónicas

### D1: Motor TTS — sherpa-onnx (Rust) + CPAL, NO piper-plus

**Decisión.** Usar `sherpa-onnx` (Rust) con `CPAL` para salida de audio
directa. Protocolo STDIN/JSON:
`{"cmd":"speak","text":"...","voice":"..."}\n` →
STDOUT `{"status":"ok"}` o `{"status":"error", ...}`.
Args CLI: `--model <path.onnx> --config <path.onnx.json>`.

**Rationale.** `piper-plus` fue rechazado porque su núcleo Rust rechaza el
phonemizer de espeak (`UnsupportedLanguage` en `voice.rs`) y no puede
cargar ningún modelo de `rhasspy/piper-voices`. La evidencia directa de
audio (4 clips explorados) confirmó que el modelo multilingüe de
piper-plus (es channel=3, dataset CSS10 colombiano dentro de un modelo
japonés) suena ~2x demasiado rápido con acento no-mexicano. `sherpa-onnx`
no tiene esa restricción.

**Alternatives considered:**

- piper-plus: descartado por incompatibilidad de phonemizer + calidad de
  audio deficiente para es-MX.
- espeak-ng directo: descartado por calidad de voz muy baja comparada con
  modelos piper.
- Otros motores TTS en Rust: descartados porque `sherpa-onnx` es el único
  con soporte onnxruntime para modelos piper-esMX sin modificación.

### D2: Voz — `es_MX-claude-high` (rhasspy/piper-voices)

**Decisión.** Usar `es_MX-claude-high` (rhasspy/piper-voices, Apache-2.0,
quality=high, FP32, 22.05 kHz, ~61 MB) como voz por defecto en todos los
archivos.

**Rationale.** Es la única voz es-MX de calidad alta con cadencia natural
en el repositorio `rhasspy/piper-voices`. Reemplaza el valor incorrecto
`es_MX-claude-voice-medium` que estaba en `sidecar-resolver.ts:48`,
`piper-sidecar.service.ts:62`, `scripts/postinstall-tts.ts:24` y la entrada
`voices.es_MX-claude-voice-medium` de `tts-sidecar.sha256`.

**URLs del modelo (descargadas por el workflow CI, NO bundleadas en el
ZIP del binario — ver D4):**

- `https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx`
- `https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json`

**Alternatives considered:**

- `es_MX-claude-medium`: descartado por calidad medium inferior.
- Otros modelos es-MX de menor calidad: descartados porque únicamente
  `claude-high` ofrece calidad high para es-MX.

### D3: espeak-ng bundleado dentro del ZIP por plataforma

**Decisión.** El ZIP por plataforma DEBERÁ contener
`libespeak-ng.{dll,so,dylib}` y `espeak-ng-data/` (~6 MB) junto al binario,
bajo el directorio `<targetId>/` en la raíz del ZIP. La estructura exacta:

```
<targetId>.zip
└── <targetId>/
    ├── tts-sidecar[.exe]
    ├── libespeak-ng.{dll,so,dylib}
    └── espeak-ng-data/...
```

Al extraer el ZIP sobre `vendor/tts-sidecar/`, el árbol resultante es:

```
vendor/tts-sidecar/
└── <targetId>/
    ├── tts-sidecar[.exe]
    ├── libespeak-ng.{dll,so,dylib}
    └── espeak-ng-data/...
```

Esto satisface el contrato del resolver (`sidecar-resolver.ts:47`):
`binaryPath = vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]`. El binario
queda ejecutable directamente sin DLLs sueltas en el `PATH` del usuario.

**Rationale.** `sherpa-onnx` NO incluye espeak-ng internamente; requiere
que el phonemizer esté disponible en el sistema. El precedente es el ZIP
oficial de piper, que bundlea espeak-ng de la misma manera. Bundlear dentro
del ZIP (en lugar de descargar `libespeak-ng` por separado) simplifica el
postinstall: una sola descarga por plataforma para todo lo nativo (binario
+ FFI + datos del phonemizer), un solo SHA256 a verificar.

**Alternatives considered:**

- Compilar espeak-ng estático dentro del binario: descartado por
  complejidad de cross-compilation excesiva para 5 targets.
- Descargar espeak-ng por separado vía apt/Homebrew: descartado porque
  rompe la promesa de binario standalone sin runtime externo.

### D4: Voz descargada por separado del ZIP del binario

**Decisión.** La voz `es_MX-claude-high` (`.onnx` + `.onnx.json`) NO se
bundlea dentro del ZIP del binario. Se publica como **dos assets separados**
en la misma GitHub Release:

```
tts-sidecar-v0.1.0
├── windows-amd64.zip
├── linux-amd64.zip
├── linux-aarch64.zip
├── macos-amd64.zip
├── macos-aarch64.zip
├── voices/es_MX-claude-high/es_MX-claude-high.onnx
└── voices/es_MX-claude-high/es_MX-claude-high.onnx.json
```

El `postinstall-tts.ts` (reescrito) primero descarga y extrae el ZIP de su
target, luego descarga los dos archivos de la voz por separado y los
coloca bajo `vendor/tts-sidecar/voices/es_MX-claude-high/`.

**Rationale.** Tres razones:

1. **El script actual `scripts/postinstall-tts.ts:153,163` ya está
   implementado para descargar la voz por separado.** Reusar ese patrón
   evita romper el contrato ya testeado.
2. **La voz se actualiza con mucha menos frecuencia que el binario.** Si
   la voz vive en el ZIP, bumpear la voz obliga a re-compilar los 5
   binarios. Separarla permite bumpear voz sin tocar el sidecar.
3. **Bundlear la voz en el ZIP multiplica almacenamiento innecesariamente.**
   5 targets × 61 MB de voz = 305 MB duplicados en la Release si va
   bundleada; 61 MB una sola vez si va separada.

**Estructura de `tts-sidecar.sha256` post-CI:**

```json
{
  "version": "0.1.0",
  "binaries": {
    "windows-amd64": { "file": "windows-amd64.zip",   "sha256": "<real-sha>" },
    "linux-amd64":   { "file": "linux-amd64.zip",     "sha256": "<real-sha>" },
    "linux-aarch64": { "file": "linux-aarch64.zip",   "sha256": "<real-sha>" },
    "macos-amd64":   { "file": "macos-amd64.zip",     "sha256": "<real-sha>" },
    "macos-aarch64": { "file": "macos-aarch64.zip",   "sha256": "<real-sha>" }
  },
  "voices": {
    "es_MX-claude-high": {
      "model":  "voices/es_MX-claude-high/es_MX-claude-high.onnx",
      "config": "voices/es_MX-claude-high/es_MX-claude-high.onnx.json",
      "sha256": {
        "model":  "<real-sha>",
        "config": "<real-sha>"
      }
    }
  }
}
```

El campo `binaries.<targetId>.file` apunta al **archivo ZIP** (no al
binario extraído). El SHA256 del manifiesto es el del ZIP. El
`postinstall-tts.ts` verifica el ZIP completo antes de extraerlo; una vez
extraído, no verifica el SHA del binario interno (confía en la integridad
del ZIP).

### D5: Chaining del `postinstall` con `;` (NO `&&`)

**Decisión.** Reescribir `package.json#postinstall` de:

```json
"postinstall": "tsx scripting/openspec/patch-openspec-change-metadata.ts"
```

a:

```json
"postinstall": "tsx scripting/openspec/patch-openspec-change-metadata.ts; node dist/scripts/postinstall-tts.js"
```

(El postinstall de TTS se ejecuta con `node` sobre el script compilado, no con
`tsx` — ver D11.)

**Rationale.** La spec `tts-sidecar-installer/spec.md` exige degradación
elegante: si `tts:setup` falla (red caída, plataforma no soportada, SHA
inválido), el `npm install` no debe abortar — solo se registra el warning
y el sidecar queda indisponible hasta el próximo `npm run tts:setup`. Con
`&&`, un fallo del openspec-postinstall (no relacionado con TTS) impediría
la ejecución del `tts:setup`. Con `;`, ambos corren siempre; el orden
lo da NPM según la declaración del script.

**Semántica real de `;` (corregida tras la auditoría).** Con `;`, ambos
comandos se ejecutan **siempre**, sin importar el código de salida del
primero, y el código de salida del `postinstall` es el del **último** comando
(`tts:setup`) — esto es exactamente lo opuesto a `&&`. Por tanto:

- Si el openspec-postinstall falla (código ≠ 0): el `tts:setup` **igual se
  ejecuta** (a diferencia de `&&`). El install no aborta por ese fallo
  mientras `tts:setup` retorne 0.
- El único determinante del aborto del `npm install` es el código de salida
  de `tts:setup` (el último en la cadena). Como `scripts/postinstall-tts.ts`
  (reescrito) DEBERÁ retornar 0 en todo path controlado (red caída, SHA
  inválido, plataforma no soportada), el `npm install` **no aborta** por TTS.
  Solo retorna ≠ 0 ante errores irrecuperables (p. ej. manifiesto JSON
  imparseable). Esto satisface la degradación elegante que pide la spec sin
  depender de la semántica de cortocircuito. Ver Riesgo #1 abajo.

### D6: Whitelist explícita en `package.json#files`

**Decisión.** Agregar el campo `files` a `package.json` con whitelist
explícita:

```json
"files": [
  "dist",
  "src",
  "scripts",
  "tts-sidecar.sha256",
  "configs",
  "README.md",
  "LICENSE"
]
```

`dist` se incluye porque `main` apunta a `dist/index.js` y porque el
`postinstall` del paquete publicado ejecuta el script **compilado** con
`node` (no `tsx`); sin `dist` el paquete publicado no tendría ni el entrypoint
ni el postinstall ejecutable. El template de entorno NO se lista como
`.env.example` de raíz: vive en `configs/.env.example` y entra al tarball vía
la entrada `configs` (convención del repo).

Y agregar `.npmignore` con:

```
vendor/
node_modules/
dist/
server/
sessions/
.agentkanban/
openspec/.workbench/
```

(Las últimas cinco también están en `.gitignore`, pero `.npmignore` las
re-declara para que el contrato sea explícito en el contexto de publicación.)

**Rationale.** Hoy `package.json` no tiene `files`, así que NPM incluye
todo lo no excluido por `.gitignore`. Riesgo concreto: si en algún momento
el CI publica el paquete desde un worktree donde `vendor/tts-sidecar/` se
pobló temporalmente (por error o por un experimento local), el tarball
incluiría 100+ MB de binarios, acercándose al límite de 500 MB del
registry público. Con whitelist explícita, ese riesgo se cierra
estructuralmente.

**Alternatives considered:**

- Dejar por defecto sin `files`: rechazado por el riesgo descrito.
- Solo `.npmignore` sin `files`: rechazado porque `.npmignore` no
  sobreescribe `files` en subdirectorios y porque deja menos explícito el
  contrato de qué se publica.

### D7: Mapping `triple Rust (job CI) ↔ targetId (postinstall)`

**Decisión.** El workflow CI compila usando los triples Rust estándar
(`x86_64-pc-windows-msvc`, etc.) como targets de compilación. El binario
resultante se publica en la Release con un **nombre derivado del
`targetId` npm, NO del triple Rust**. El mapping es fijo y se documenta
en el workflow como tabla de verdad única:

| Job CI (triple Rust)                    | Runner GitHub Actions              | Nombre del asset publicado (targetId) |
|-----------------------------------------|------------------------------------|---------------------------------------|
| `x86_64-pc-windows-msvc`                | `windows-latest`                   | `windows-amd64.zip`                   |
| `x86_64-unknown-linux-gnu`              | `ubuntu-latest`                    | `linux-amd64.zip`                     |
| `aarch64-unknown-linux-gnu`             | `ubuntu-latest` (con cross-toolchain) | `linux-aarch64.zip`                 |
| `x86_64-apple-darwin`                   | `macos-13`                         | `macos-amd64.zip`                     |
| `aarch64-apple-darwin`                  | `macos-14-arm64`                   | `macos-aarch64.zip`                   |

**Rationale.** El resolver y el `postinstall-tts.ts` ya están
implementados con el `targetId` npm (`windows-amd64`, `linux-amd64`, etc.,
verificado en `sidecar-resolver.ts:11-21` y `postinstall-tts.ts:34-43`).
Si el ZIP publicado usara el triple Rust como nombre (p. ej.
`aarch64-apple-darwin.zip`), el postinstall construiría una URL que no
resuelve a ningún asset, fallaría la descarga, y `resolveSidecarAssets()`
seguiría lanzando `SidecarNotInstalledError` — exactamente el bug que
estamos cerrando. El mapping es la única fuente de verdad que reconcilia
los dos vocabularios.

**Crítico:** el workflow debe garantizar que el archivo ZIP subido a la
Release se llame EXACTAMENTE `<targetId>.zip` (sin prefijo, sin
extensión adicional, en minúsculas, con guiones). El nombre es parte del
contrato con `postinstall-tts.ts`.

### D8: Scope del build = recipe + wiring, NO compilación local

**Decisión.** El delta es propietario de la recipe para producir el
binario reproduciblemente (Rust crate + CI workflow). NO compila localmente
los 5 binarios en el turno apply. Los binarios reales y los SHA256 hashes
vienen del primer run del workflow CI posterior al merge.

**Rationale.** Justificaciones acumuladas:

1. El mantenedor trabaja en Windows. Producir binarios `aarch64-apple-darwin`
   y `x86_64-apple-darwin` desde Windows requiere osxcross sobre Linux, lo
   cual no es viable mantener como setup permanente.
2. Producir binarios `aarch64-unknown-linux-gnu` desde Windows requiere
   cross-toolchain GNU para aarch64 (linker `aarch64-linux-gnu-gcc` o
   equivalente), setup pesado no justificado para una receta que se
   ejecuta una vez por bump.
3. El CI provee runners nativos para Windows (`windows-latest`), Linux x64
   (`ubuntu-latest`) con cross a aarch64, macOS x64 (`macos-13`) y macOS
   arm64 (`macos-14-arm64`), cubriendo los 5 targets sin toolchains
   locales.

**Verify limit:** el gate `verify` del delta verifica deterministamente:
(a) el esqueleto del crate Rust + `cargo check`; (b) el YAML del workflow
de CI con su matrix correcta; (c) el cableado TS (postinstall con `;`,
nombre de voz correcto, layout del ZIP documentado); (d) la estructura
de `tts-sidecar.sha256` (placeholders aceptables hasta el primer run);
(e) `package.json#files` con whitelist (incluye `dist`); (f)
`TTS_SIDECAR_BASE_URL` pineado en `configs/.env.example` y como default real
de la constante del script. **NO verifica binarios reales ni hashes
finales**, porque esos dependen del primer run del workflow. Esto se
documenta explícitamente en `tasks.md` sección 5.

### D9: Fuente del crate Rust en `sidecar/`, runtime en `vendor/tts-sidecar/`

**Decisión.** El fuente del crate Rust (`Cargo.toml`, `src/main.rs`) vive en
`sidecar/` (versionado en git). El directorio `vendor/tts-sidecar/` queda
**exclusivamente** como destino de instalación en runtime (binarios + voz
descargados por el postinstall) y permanece gitignored (`.gitignore:27`). El
workflow CI compila desde `sidecar/` (`cargo build --release --target
<triple>` con `--manifest-path sidecar/Cargo.toml` o `working-directory:
sidecar`).

**Rationale.** Verificado con `git check-ignore`: `vendor/tts-sidecar/Cargo.toml`
y `vendor/tts-sidecar/src/main.rs` están **ignorados**. Colocar el fuente del
crate bajo `vendor/tts-sidecar/` haría que git no lo versionara y el workflow
CI no tendría nada que compilar — reproduciendo el bug que el delta cierra.
Separar el fuente (`sidecar/`) del dir de instalación (`vendor/tts-sidecar/`)
elimina la colisión sin tocar `.gitignore`.

**Alternatives considered:**

- Estrechar `.gitignore` para ignorar solo subpaths de runtime y mantener el
  crate en `vendor/tts-sidecar/`: descartado por frágil (crate y binarios
  extraídos conviven en el mismo árbol; fácil de romper con un patrón nuevo o
  un `git clean`).
- Crate en `crates/tts-sidecar/`: descartado por introducir jerarquía de
  workspace multi-crate sin beneficio para un único crate.

### D10: `TTS_SIDECAR_BASE_URL` — default real en el script + pin en `configs/.env.example`

**Decisión.** La constante `BASE_URL` de `scripts/postinstall-tts.ts` deja de
ser `https://tts-sidecar.example.com/v1/` y pasa a
`https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v<version>/`.
El override se documenta en `configs/.env.example` (convención del repo;
verificado que `configs/.env.example` existe y `.env.example` de raíz NO).

**Rationale.** Nada carga `.env.example` ni `configs/.env` en el proceso del
postinstall: npm no pasa `--env-file` y el script no importa dotenv. La
afirmación previa de la spec («`.env.example` provee el valor por defecto»)
era falsa. El default efectivo es la constante del script, así que ahí debe
vivir la URL correcta. `configs/.env.example` solo documenta el override para
quien exporte la variable manualmente.

**Alternatives considered:**

- Cargar `configs/.env` vía dotenv en el postinstall: descartado porque
  `configs/.env` está gitignored y no existe en un install limpio → igual
  haría falta un default real en el script; duplica el problema.
- Mantener `.env.example` en la raíz: descartado por contradecir la
  convención `configs/.env.example` y no resolver la entrega al proceso.

### D11: Postinstall del paquete publicado sin `tsx`, descompresión vía `adm-zip`

**Decisión.** (a) Agregar `adm-zip` a `dependencies` (NO devDependencies)
para extraer el ZIP; las `dependencies` se instalan antes del `postinstall`
del consumidor. (b) El `postinstall` y el script `tts:setup` del paquete
publicado ejecutan el postinstall **compilado** con `node`
(`node dist/scripts/postinstall-tts.js`), no `tsx scripts/postinstall-tts.ts`,
porque `tsx` es devDependency y no está presente en un install del consumidor.
(c) `dist` se incluye en `package.json#files` (ver D6).

**Rationale.** Node no trae descompresión de ZIP nativa; `adm-zip` ofrece una
API síncrona portable (Windows/Linux/macOS). El entrypoint del paquete
(`main: dist/index.js`) y el postinstall ejecutable solo existen tras `build`,
de modo que el tarball debe incluir `dist`. Sin esto, un `npm install` del
paquete publicado fallaría al invocar `tsx` ausente, dejando el sidecar sin
instalar — el mismo silencio de audio que el delta busca eliminar.

**Alternatives considered:**

- Asumir consumo run-from-source (tsx presente): descartado porque contradice
  el objetivo declarado de publicar en NPM para Windows/Linux/macOS.
- Diferir como gap CI-dependent: descartado porque dejaría el postinstall
  publicado roto de facto.

---

## Resumen de la arquitectura de distribución

```
┌─────────────────────────────────────────────────────────────────────┐
│  ACTOR 1 — Mantenedor del repo                                       │
│                                                                      │
│  1. Edita sidecar/src/main.rs (fuente versionado del crate)         │
│  2. git tag tts-sidecar-v0.1.0                                       │
│  3. git push origin tts-sidecar-v0.1.0                               │
│                                                                      │
│  No compila nada. No abre un Mac. No instala toolchains.             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ACTOR 2 — GitHub Actions (workflow)                                 │
│                                                                      │
│  Job 1 (windows-latest, triple x86_64-pc-windows-msvc)               │
│    └─ cargo build --release --target x86_64-pc-windows-msvc          │
│    └─ bundlea libespeak-ng.dll + espeak-ng-data/                    │
│    └─ crea ZIP: windows-amd64/                                       │
│    └─ ZIP → windows-amd64.zip                                       │
│                                                                      │
│  Job 2 (ubuntu-latest, triple x86_64-unknown-linux-gnu)              │
│    └─ cargo build --release --target x86_64-unknown-linux-gnu        │
│    └─ bundlea libespeak-ng.so + espeak-ng-data/                     │
│    └─ crea ZIP: linux-amd64/                                         │
│    └─ ZIP → linux-amd64.zip                                         │
│                                                                      │
│  Job 3 (ubuntu-latest, triple aarch64-unknown-linux-gnu, cross)      │
│    └─ rustup target add aarch64-unknown-linux-gnu                   │
│    └─ cargo build --release --target aarch64-unknown-linux-gnu      │
│    └─ bundlea libespeak-ng.so + espeak-ng-data/                     │
│    └─ crea ZIP: linux-aarch64/                                       │
│    └─ ZIP → linux-aarch64.zip                                       │
│                                                                      │
│  Job 4 (macos-13, triple x86_64-apple-darwin)                        │
│    └─ cargo build --release --target x86_64-apple-darwin            │
│    └─ bundlea libespeak-ng.dylib + espeak-ng-data/                  │
│    └─ crea ZIP: macos-amd64/                                         │
│    └─ ZIP → macos-amd64.zip                                         │
│                                                                      │
│  Job 5 (macos-14-arm64, triple aarch64-apple-darwin)                 │
│    └─ cargo build --release --target aarch64-apple-darwin           │
│    └─ bundlea libespeak-ng.dylib + espeak-ng-data/                  │
│    └─ crea ZIP: macos-aarch64/                                       │
│    └─ ZIP → macos-aarch64.zip                                       │
│                                                                      │
│  Job 6 (release)                                                     │
│    └─ Espera a los 5 jobs anteriores                                 │
│    └─ Descarga voices/es_MX-claude-high/{onnx, onnx.json}           │
│         desde huggingface.co/rhasspy/piper-voices                   │
│    └─ Calcula SHA256 de los 5 ZIPs y de los 2 archivos de voz       │
│    └─ Genera tts-sidecar.sha256 con valores reales                  │
│    └─ softprops/action-gh-release:                                  │
│       └─ crea Release "tts-sidecar-v0.1.0"                          │
│       └─ sube los 5 ZIPs + los 2 archivos de voz como assets       │
│    └─ git commit + push de tts-sidecar.sha256 al repo               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ACTOR 3 — Usuario final (npm install)                               │
│                                                                      │
│  1. npm install                                                      │
│  2. postinstall (paquete publicado, sin tsx):                        │
│       a) node dist/scripting/openspec/patch-openspec-change-metadata.js│
│       b) node dist/scripts/postinstall-tts.js                        │
│  3. postinstall-tts.ts:                                              │
│       - Detecta plataforma (process.platform + process.arch)        │
│       - Lee TTS_SIDECAR_BASE_URL (env, o default real del script)   │
│       - Construye URL del ZIP:                                       │
│           <BASE_URL>/<targetId>.zip                                  │
│       - Descarga ZIP                                                 │
│       - Verifica SHA256 contra tts-sidecar.sha256                   │
│       - Extrae ZIP sobre vendor/tts-sidecar/                        │
│       - chmod 755 al binario (si no Windows)                         │
│       - Construye URL de voz:                                        │
│           <BASE_URL>/voices/es_MX-claude-high/es_MX-claude-high.onnx│
│           <BASE_URL>/voices/es_MX-claude-high/es_MX-claude-high.onnx.json│
│       - Descarga archivos de voz                                    │
│       - Verifica SHA256 de cada uno                                  │
│       - Sale con código 0 (idempotente si ya estaba instalado)       │
│  4. vendor/tts-sidecar/<targetId>/tts-sidecar[.exe] queda ejecutable│
│     vendor/tts-sidecar/voices/es_MX-claude-high/{onnx, onnx.json}   │
│     listos para usar                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ACTOR 4 — Hook de Claude Code (cada evento)                         │
│                                                                      │
│  1. composition-root.ts:107-108 → instancia PiperSidecarService     │
│  2. Hook captura evento (SessionStart, Stop, etc.)                   │
│  3. piper-sidecar.service.ts:83 → resolveSidecarAssets()            │
│       → sidecar-resolver.ts:36-67                                    │
│       → paths OK porque vendor/tts-sidecar/ está poblado             │
│  4. piper-sidecar.service.ts:95                                     │
│       → spawn(binaryPath, ['--model', voz, '--config', config])      │
│  5. Binario Rust arranca, lee JSON de stdin, sintetiza con            │
│     sherpa-onnx + espeak-ng, reproduce por CPAL                      │
│  6. STDOUT {"status":"ok"} → proxy registra éxito                    │
│  7. Audio se escucha 🎵                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Riesgos / Trade-offs

**[Riesgo #1] `postinstall` con `;` aborta `npm install` si `tts:setup` falla**

El comportamiento documentado de NPM es: si un script de `postinstall`
retorna código ≠ 0, el `npm install` aborta. Usar `;` no evita esto — solo
asegura que el `tts:setup` se ejecute incluso si el openspec-postinstall
pasó. La spec `installer/spec.md:38-39` exige que el `npm install` NO
aborte cuando el `tts:setup` falla (degradación elegante).

**Mitigación:** `scripts/postinstall-tts.ts` (reescrito por este delta)
DEBERÁ retornar código 0 incluso en los paths de error de descarga,
verificación SHA, plataforma no soportada, etc. En su lugar, registra
mensajes accionables con `console.error` o el logger. El `tts:setup` solo
retorna código ≠ 0 cuando el usuario lo invoca explícitamente
(`npm run tts:setup`), no cuando se ejecuta desde el `postinstall`
automático. Esto se logra detectando el contexto de invocación o, más
simplemente, unificando la política: el script siempre retorna 0 si se
llega al final del flujo (éxito o fallo controlado), y solo retorna ≠ 0
ante errores irrecuperables que justifican abortar (p. ej. el manifiesto
no se puede parsear).

**[Riesgo #2] Cambio del `postinstall` puede romper el flujo de openspec**

Encadenar el postinstall de TTS (con `node`) al `postinstall` existente
requiere que el openspec-postinstall se ejecute primero sin errores. Si
falla por razones no relacionadas con TTS (p. ej. `package.json#files`
añade paths que rompen el patcher de openspec), el `tts:setup` no corre.

**Mitigación:** validar localmente con `npm install` antes de mergear;
verificar que el openspec-postinstall sigue produciendo el resultado
esperado. Si falla, debugear antes de mergear. Documentado en tasks.md
sección 4 como scenario explícito.

**[Riesgo #3] espeak-ng bundleado aumenta el tamaño del ZIP ~6 MB por target**

5 targets × ~6 MB = ~30 MB totales de espeak-ng en la Release.

**Mitigación:** aceptable dado que es necesario para el phonemizer; no
hay alternativa sin agregar dependencias externas. Compensado por el
beneficio de bundlear la voz por separado (D4), que evita ~305 MB
duplicados.

**[Riesgo #4] Plataforma no soportada en postinstall**

Si un usuario ejecuta en una plataforma no cubierta por la matrix
(p. ej. `linux-ia32`, `freebsd-amd64`), `tts:setup` falla con mensaje
claro y degradación elegante.

**Mitigación:** scenario dedicado en `tts-sidecar-installer/spec.md`
("Plataforma no soportada falla con mensaje claro"). El script debe
listar explícitamente los targets soportados.

**[Riesgo #5] Tag de la Release se borra o el repo se mueve de ownership**

Si el mantenedor borra la Release `tts-sidecar-v0.1.0` (limpieza, error,
repo rename), todos los installs con ese SHA pineado dejan de poder
descargar. El postinstall falla con código ≠ 0, lo cual (con la
mitigación del Riesgo #1) no aborta el install pero deja el sidecar
indisponible.

**Mitigación:** convención open source — Releases son inmutables. Si
hay un cambio, se publica `v0.2.0`. Documentar esta convención en
`README.md` (futuro delta, fuera de scope aquí).

**[Riesgo #6] ZIP layout incorrecto en el primer run del workflow**

Si el primer run del workflow genera un ZIP con layout distinto al
declarado en D3 (p. ej. pone el binario en la raíz del ZIP sin el
directorio `<targetId>/`), el `postinstall-tts.ts` extraerá archivos en
ubicaciones incorrectas y `resolveSidecarAssets()` seguirá lanzando
`SidecarNotInstalledError`.

**Mitigación:** el primer run del workflow (CI-dependent, fuera del
verify de apply) debe incluir un scenario de smoke test: extraer el ZIP
generado y verificar que el binario está en `<targetId>/tts-sidecar[.exe]`
y que `libespeak-ng` está presente. Si falla, el workflow falla el job y
la Release no se publica. Documentado en `tasks.md` sección 5.

---

## Migration Plan

1. **Apply del delta.** Se crean los archivos del Rust crate
   (`sidecar/Cargo.toml`, `sidecar/src/main.rs`), el workflow
   `.github/workflows/tts-sidecar-release.yml`, y se reescribe
   `scripts/postinstall-tts.ts` para manejar ZIPs (con `adm-zip` y default
   real de `BASE_URL`). Se modifican `package.json` (script `tts:setup` y
   `postinstall` ejecutando el script compilado con `node`, `postinstall`
   con `;`, campo `files` con `dist`, `adm-zip` en `dependencies`),
   `configs/.env.example` (pin de `TTS_SIDECAR_BASE_URL` con placeholders),
   `.npmignore`, `src/2-services/tts/sidecar-resolver.ts:48` (nombre de voz),
   `src/2-services/tts/piper-sidecar.service.ts:62` (nombre de voz),
   `tts-sidecar.sha256` (estructura con voz correcta, placeholders para SHA).

2. **Primer run del workflow (post-apply).** El workflow compila los 5
   targets, bundlea espeak-ng, descarga la voz, publica 5 ZIPs + 2
   archivos de voz como assets en la Release `tts-sidecar-v0.1.0`, y
   commitea `tts-sidecar.sha256` con SHA256 reales al repo.

3. **Post-apply `npm install` en una máquina del usuario.** El
   `postinstall` ejecuta `tts:setup`, que descarga el ZIP de la
   plataforma, lo extrae, descarga los archivos de voz, verifica SHA256,
   y deja `vendor/tts-sidecar/<targetId>/` y `vendor/tts-sidecar/voices/`
   poblados.

4. **Primer hook con TTS.** `resolveSidecarAssets()` retorna paths
   válidos, `PiperSidecarService` hace `spawn`, el audio se reproduce.

**Rollback.** Si el delta causa problemas, se revierte el commit. Los
archivos en `vendor/tts-sidecar/` no se commitean (gitignored), así que
la reversión es limpia. La Release `tts-sidecar-v0.1.0` puede
deshabilitarse eliminándola o marcándola como pre-release.

---

## Open Questions

Ninguna. Las once decisiones arquitectónicas (D1–D11) están resueltas por
el usuario y registradas arriba. La segunda auditoría de coherencia contra el
repo real fue ejecutada (incluyendo `git check-ignore` del crate y la
ubicación real de `configs/.env.example`); los gaps materiales detectados
están corregidos en este `design.md` y propagados a las specs y tasks
correspondientes.