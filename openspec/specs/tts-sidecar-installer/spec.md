# Especificación: tts-sidecar-installer

## Propósito
Definir los requisitos de instalación, verificación de integridad y resolución de paths del sidecar local de TTS (`tts-sidecar`) y de su modelo de voz, de forma que el gateway pueda localizar y hablar con el binario sin depender de red en tiempo de ejecución.

---

## Requirements

### Requirement: Resolución y verificación del sidecar local de TTS
El sistema SHALL distribuir el binario `tts-sidecar` y su modelo de voz por plataforma (Windows x64, Linux x64, Linux arm64, macOS x64, macOS arm64) y SHALL verificar su integridad antes del primer uso mediante un manifiesto `tts-sidecar.sha256` versionado en el repo.

**Distribución del binario:** UN ZIP por plataforma, descargado desde la GitHub Release del repo. El nombre del ZIP SHALL ser `<targetId>.zip` (p. ej. `windows-amd64.zip`), donde `<targetId>` ∈ `{windows-amd64, linux-amd64, linux-aarch64, macos-amd64, macos-aarch64}`. El layout interno del ZIP SHALL ser exactamente:

```
<targetId>.zip
└── <targetId>/
    ├── tts-sidecar[.exe]
    ├── libespeak-ng.{dll,so,dylib}
    └── espeak-ng-data/...
```

Al extraer el ZIP sobre `vendor/tts-sidecar/`, SHALL quedar:

- `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]`
- `vendor/tts-sidecar/<targetId>/libespeak-ng.{dll,so,dylib}`
- `vendor/tts-sidecar/<targetId>/espeak-ng-data/...`

El campo `binaries.<targetId>.file` del manifiesto apunta al archivo ZIP, no al binario extraído. El SHA256 del manifiesto es el del ZIP.

**Distribución de la voz:** los archivos `.onnx` y `.onnx.json` de `es_MX-claude-high` se publican como assets separados en la misma Release, bajo el path `voices/es_MX-claude-high/`. Se descargan después del ZIP, también con verificación SHA256 contra `tts-sidecar.sha256`.

El path final de instalación SHALL ser `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]` para el binario y `vendor/tts-sidecar/voices/es_MX-claude-high/` para los archivos de voz. El directorio `vendor/tts-sidecar/` SHALL estar listado en `.gitignore`. El binario SHALL ser ejecutable directamente (sin runtime externo: ni Node, ni Python, ni DLLs sueltas en el PATH del usuario; libespeak-ng se carga desde el directorio del binario, no del sistema).

La descarga SHALL ocurrir en `npm install` (vía hook `postinstall`, encadenado con el openspec-postinstall existente usando `;` como operador de chaining) y SHALL ser repetible manualmente con `npm run tts:setup`. En el paquete publicado el `postinstall` SHALL ejecutar el script **compilado** con `node` (p. ej. `node dist/scripts/postinstall-tts.js`), NO con `tsx` (devDependency ausente en un install del consumidor). El `postinstall-tts.ts` SHALL:
- Detectar plataforma y arquitectura con `process.platform` y `process.arch` y construir el `targetId` (uno de los 5 listados arriba).
- Leer `TTS_SIDECAR_BASE_URL` del entorno; si no está definida, usar el default real de la constante `BASE_URL` del script (`https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v<version>/`). El template `configs/.env.example` documenta el override, pero NO se carga automáticamente en el proceso del postinstall.
- Construir la URL del ZIP desde `TTS_SIDECAR_BASE_URL`: `<BASE_URL>/<targetId>.zip`.
- Descargar el ZIP, verificar SHA256 contra `tts-sidecar.sha256`, extraer sobre `vendor/tts-sidecar/` usando la dependencia de runtime `adm-zip` (Node no trae descompresión de ZIP nativa).
- Descargar los archivos de la voz desde `<BASE_URL>/voices/es_MX-claude-high/...`, verificar SHA256, colocar en `vendor/tts-sidecar/voices/es_MX-claude-high/`.
- Si la descarga o verificación falla, SHALL imprimir un mensaje de error accionable indicando que la síntesis de voz no estará disponible hasta ejecutar `npm run tts:setup` con conexión a Internet.
- Si todo se completa (éxito o fallo controlado), SHALL salir con código 0 (degradación elegante: el `npm install` NO aborta). El script solo retorna código ≠ 0 ante errores irrecuperables que justifican abortar (p. ej. el manifiesto no se puede parsear como JSON válido).

#### Scenario: Postinstall descarga ZIP, extrae, descarga voz y verifica SHA256
- **GIVEN** que `vendor/tts-sidecar/` no existe o está vacío
- **AND** la plataforma y arquitectura actuales están soportadas
- **AND** `TTS_SIDECAR_BASE_URL` está disponible como default real en la constante `BASE_URL` del script (y documentado en `configs/.env.example` para override manual; ese template NO se carga solo en el postinstall)
- **WHEN** se ejecuta `npm install` (o `npm run tts:setup`)
- **THEN** SHALL construir el `targetId` basado en `process.platform` y `process.arch`
- **AND** SHALL descargar `<BASE_URL>/<targetId>.zip`
- **AND** SHALL verificar SHA256 del ZIP contra `tts-sidecar.sha256`
- **AND** SHALL extraer el ZIP sobre `vendor/tts-sidecar/`, produciendo `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]` + libespeak-ng + espeak-ng-data/
- **AND** SHALL descargar `<BASE_URL>/voices/es_MX-claude-high/es_MX-claude-high.onnx`
- **AND** SHALL verificar SHA256 del `.onnx` contra `tts-sidecar.sha256`
- **AND** SHALL descargar `<BASE_URL>/voices/es_MX-claude-high/es_MX-claude-high.onnx.json`
- **AND** SHALL verificar SHA256 del `.onnx.json` contra `tts-sidecar.sha256`
- **AND** SHALL dejar el árbol listo para que `PiperSidecarService` lo encuentre sin volver a descargar

#### Scenario: Sidecar ya instalado es idempotente
- **GIVEN** que `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]` existe
- **AND** los archivos de voz existen bajo `vendor/tts-sidecar/voices/es_MX-claude-high/`
- **AND** sus SHA256 coinciden con el manifiesto
- **WHEN** se ejecuta `npm run tts:setup`
- **THEN** SHALL salir con código 0 sin volver a descargar el ZIP ni los archivos de voz
- **AND** SHALL imprimir un mensaje informativo indicando que la instalación ya estaba completa

#### Scenario: SHA256 inválido aborta la descarga con error accionable
- **GIVEN** que el archivo descargado (ZIP o archivo de voz) no pasa la verificación SHA256 contra `tts-sidecar.sha256`
- **WHEN** el script de instalación procesa el archivo
- **THEN** SHALL eliminar el archivo descargado
- **AND** SHALL imprimir un mensaje de error que incluya el SHA256 esperado y el calculado
- **AND** SHALL continuar con los siguientes archivos (no abortar todo el flujo por un solo fallo)
- **AND** SHALL salir con código 0 al final del flujo (degradación elegante)

#### Scenario: Plataforma no soportada falla con mensaje claro
- **GIVEN** que `process.platform` y `process.arch` no están en la lista de targets soportados
- **WHEN** se ejecuta `npm run tts:setup`
- **THEN** SHALL imprimir un mensaje indicando la plataforma detectada y la lista de targets soportados (windows-amd64, linux-amd64, linux-aarch64, macos-amd64, macos-aarch64)
- **AND** SHALL salir con código 0 (degradación elegante)

#### Scenario: Resolución de path no requiere red
- **GIVEN** que el sidecar está correctamente instalado
- **WHEN** `PiperSidecarService` invoca `resolveSidecarAssets()`
- **THEN** SHALL retornar paths absolutos al binario y al modelo sin hacer ninguna llamada de red
- **AND** SHALL lanzar `SidecarNotInstalledError` si el binario o los archivos de voz no existen en disco

#### Scenario: `vendor/tts-sidecar/` no se versiona
- **GIVEN** que `vendor/tts-sidecar/` contiene binarios y modelos descargados
- **WHEN** se ejecuta `git status`
- **THEN** SHALL listar `vendor/tts-sidecar/` como ignorado
- **AND** SHALL NO aparecer en `git diff` ni en commits

#### Scenario: Postinstall encadenado no rompe el flujo de openspec
- **GIVEN** el `postinstall` de `package.json` ejecuta primero `scripting/openspec/patch-openspec-change-metadata.ts`, luego (con `;`) el postinstall de TTS con `node` (script compilado, no `tsx`)
- **WHEN** se ejecuta `npm install`
- **THEN** el postinstall de openspec SHALL ejecutarse primero
- **AND** luego el postinstall de TTS (`node`) SHALL ejecutarse
- **AND** si `tts:setup` falla por cualquier razón controlada (red, SHA inválido, plataforma no soportada), SHALL retornar código 0 y NO SHALL abortar el `npm install` (degradación elegante)
- **AND** el usuario SHALL ver un mensaje claro indicando cómo resolver el problema (ej. "ejecuta `npm run tts:setup` con conexión a Internet")

#### Scenario: ZIP con layout incorrecto falla el postinstall
- **GIVEN** que el ZIP descargado no contiene el directorio `<targetId>/` en su raíz (layout incorrecto)
- **WHEN** el `postinstall-tts.ts` lo extrae sobre `vendor/tts-sidecar/`
- **THEN** SHALL existir `vendor/tts-sidecar/<targetId>/tts-sidecar[.exe]` (requisito del resolver)
- **AND** si no existe (porque el layout era incorrecto), el siguiente `resolveSidecarAssets()` SHALL lanzar `SidecarNotInstalledError`
- **AND** SHALL NO propagar el error al hook (degradación elegante ya implementada en `piper-sidecar.service.ts`)

---

### Requirement: Whitelist explícita de archivos publicados a NPM
El sistema SHALL incluir en `package.json` un campo `files` con whitelist explícita que controle qué se incluye en el tarball publicado a NPM. La lista SHALL incluir:

- `dist`
- `src`
- `scripts`
- `tts-sidecar.sha256`
- `configs`
- `README.md`
- `LICENSE`

`dist` se incluye porque `main` apunta a `dist/index.js` y porque el `postinstall` del paquete publicado ejecuta el script compilado con `node`. El template de entorno NO se lista por separado: vive en `configs/.env.example` y entra al tarball vía la entrada `configs`.

El sistema SHALL NOT incluir `vendor/tts-sidecar/` en el tarball publicado, aunque por algún motivo el worktree del CI lo tenga poblado al momento de `npm publish`.

Adicionalmente, SHALL existir `.npmignore` en la raíz del repo con blacklist explícita de `vendor/`, `node_modules/`, `dist/`, `server/`, `sessions/`, `.agentkanban/`, `openspec/.workbench/` (las últimas cinco ya están en `.gitignore` pero se re-declaran aquí para hacer el contrato explícito en el contexto de publicación).

#### Scenario: Tarball publicado excluye `vendor/`
- **WHEN** se ejecuta `npm pack` con el `package.json` actualizado
- **THEN** el tarball SHALL NOT contener `vendor/tts-sidecar/` ni ningún archivo bajo `vendor/`
- **AND** SHALL contener `scripts/postinstall-tts.ts` y `tts-sidecar.sha256` (necesarios para el postinstall del usuario)

#### Scenario: Worktree con vendor poblado produce tarball sin vendor
- **GIVEN** que `vendor/tts-sidecar/` está poblado en el worktree
- **WHEN** se ejecuta `npm pack`
- **THEN** SHALL aplicarse la whitelist de `files`
- **AND** SHALL NOT incluirse `vendor/` en el tarball

---

### Requirement: `TTS_SIDECAR_BASE_URL` con default real en el script y pin en `configs/.env.example`
El sistema SHALL fijar `TTS_SIDECAR_BASE_URL` como **default real** en la constante `BASE_URL` de `scripts/postinstall-tts.ts` (reemplazando el placeholder `https://tts-sidecar.example.com/v1/`) y SHALL documentar el override en `configs/.env.example` (convención del repo; `.env.example` de raíz NO se usa). Ambos con el formato:

```
TTS_SIDECAR_BASE_URL=https://github.com/<owner>/<repo>/releases/download/tts-sidecar-v<version>/
```

El default DEBE vivir en la constante del script porque nada carga `configs/.env.example` ni `configs/.env` en el proceso del postinstall (npm no pasa `--env-file` y el script no importa dotenv); el template solo aplica si el usuario exporta la variable manualmente.

Donde:
- `<owner>` y `<repo>` son placeholders hasta que se concrete el nombre del repo público en GitHub. Al publicar el proyecto, estos placeholders SHALL sustituirse por el owner/repo real.
- `<version>` es la versión actual del crate Rust (p. ej. `0.1.0`). Cuando se bumpea la versión, este valor SHALL actualizarse tanto en la constante `BASE_URL` del script como en `configs/.env.example` (parte del flujo de release).
- La URL SHALL terminar en `/` (slash final). El script `postinstall-tts.ts` usa `new URL(path, BASE_URL)`, que normaliza la concatenación: con `/` final, `path` se anexa; sin `/` final, el último segmento de `BASE_URL` se reemplaza.

#### Scenario: URL construida correctamente
- **GIVEN** `TTS_SIDECAR_BASE_URL=https://github.com/foo/bar/releases/download/tts-sidecar-v0.1.0/`
- **WHEN** el `postinstall-tts.ts` construye la URL del ZIP para `macos-aarch64`
- **THEN** SHALL ser `https://github.com/foo/bar/releases/download/tts-sidecar-v0.1.0/macos-aarch64.zip`

#### Scenario: URL construida para voz
- **GIVEN** el mismo `TTS_SIDECAR_BASE_URL`
- **WHEN** el `postinstall-tts.ts` construye la URL del `.onnx` de la voz `es_MX-claude-high`
- **THEN** SHALL ser `https://github.com/foo/bar/releases/download/tts-sidecar-v0.1.0/voices/es_MX-claude-high/es_MX-claude-high.onnx`

#### Scenario: Slash final faltante produce URL rota
- **GIVEN** `TTS_SIDECAR_BASE_URL=https://github.com/foo/bar/releases/download/tts-sidecar-v0.1.0` (sin `/` final)
- **WHEN** el `postinstall-tts.ts` construye la URL para `linux-amd64`
- **THEN** SHALL ser `https://github.com/foo/bar/releases/download/linux-amd64.zip` (el segmento `tts-sidecar-v0.1.0` se reemplaza, NO se anexa)
- **AND** SHALL fallar el download con HTTP 404

---

### Requirement: Nombre de voz corregido a `es_MX-claude-high`
El nombre de voz por defecto SHALL ser `es_MX-claude-high` en todos los archivos que lo referencian:

- `src/2-services/tts/sidecar-resolver.ts` — constante por defecto en `resolveSidecarAssets`
- `src/2-services/tts/piper-sidecar.service.ts` — fallback cuando no se pasa `voice` a `speak()`
- `scripts/postinstall-tts.ts` — constante `VOICE` que selecciona el entry del manifiesto a descargar
- `tts-sidecar.sha256` — entry `voices.es_MX-claude-high`

El valor incorrecto `es_MX-claude-voice-medium` SHALL ser eliminado de todos estos archivos.

#### Scenario: Resolver usa el nombre correcto
- **WHEN** `PiperSidecarService` resuelve los assets del sidecar
- **THEN** el path de la voz resuelto SHALL ser `vendor/tts-sidecar/voices/es_MX-claude-high/es_MX-claude-high.onnx`
- **AND** el nombre pasado al spawn SHALL ser `es_MX-claude-high`

#### Scenario: postinstall-tts.ts usa el nombre correcto al descargar
- **WHEN** `scripts/postinstall-tts.ts` descarga los archivos del modelo
- **THEN** SHALL seleccionar el entry `voices.es_MX-claude-high` del manifiesto
- **AND** SHALL construir las URLs con `es_MX-claude-high` en el path
- **AND** SHALL colocar los archivos bajo `vendor/tts-sidecar/voices/es_MX-claude-high/`
