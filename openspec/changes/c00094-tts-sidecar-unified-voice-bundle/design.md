# Design: c00094 — tts-sidecar unified voice bundle

## Contexto

El pipeline CircleCI actual produce `<platform>.zip` con:
- `tts-sidecar[.exe]`
- `libespeak-ng.{dll,so,dylib}`
- `espeak-ng-data/`

El modelo de voz `es_MX-claude-high.onnx` + `.onnx.json` se publica como asset separado. El postinstall NPM hace 2 descargas: ZIP del binario + ZIP de la voz.

**Decisión del usuario**: el modelo de voz debe ir dentro del ZIP — una sola descarga, todo autocontenido.

## Goals

- Bundle del modelo de voz dentro de cada ZIP por plataforma
- Eliminar la descarga separada de la voz en postinstall
- No cambiar el layout del ZIP dentro del targetId (tts-sidecar + libs + data + voices/)

## Decisiones

### D1: Job `download-model` + CircleCI Workspace

```
download-model  ──→  linux-amd64
                ──→  windows-amd64
                ──→  macos-amd64
```

**Detalles del job**:
```yaml
download-model:
  docker:
    - image: cimg/base:stable
  working_directory: ~/EvolutiveX-Agent-Orchestrator
  steps:
    - restore_cache:
        keys:
          - voice-model-es-MX-claude-high-v1
    - run:
        name: "Descargar modelo de voz (si no está en caché)"
        command: |
          MODEL_DIR="vendor/tts-sidecar/voices/es_MX-claude-high"
          mkdir -p "$MODEL_DIR"
          curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx" \
            -o "$MODEL_DIR/es_MX-claude-high.onnx"
          curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json" \
            -o "$MODEL_DIR/es_MX-claude-high.onnx.json"
    - save_cache:
        key: voice-model-es-MX-claude-high-v1
        paths:
          - vendor/tts-sidecar/voices/es_MX-claude-high
    - persist_to_workspace:
        root: .
        paths:
          - vendor/tts-sidecar/voices/es_MX-claude-high
```

**Clave de caché versionada** (`v1`): para forzar re-descarga, cambiar a `v2`.

### D2: Cada job de compilación adjunta el workspace

En cada job, primer paso:
```yaml
- attach_workspace:
    at: ~/EvolutiveX-Agent-Orchestrator
```

Y en el paso de empaquetado, antes del `zip`:

**Linux**:
```bash
mkdir -p staging/linux-amd64/vendor/tts-sidecar/voices
cp -r vendor/tts-sidecar/voices/es_MX-claude-high \
  staging/linux-amd64/vendor/tts-sidecar/voices/
```

**Windows** (PowerShell):
```powershell
New-Item -ItemType Directory -Force -Path "staging\windows-amd64\vendor\tts-sidecar\voices" | Out-Null
Copy-Item -Recurse "vendor\tts-sidecar\voices\es_MX-claude-high" `
  "staging\windows-amd64\vendor\tts-sidecar\voices\"
```

**macOS**:
```bash
mkdir -p staging/macos-amd64/vendor/tts-sidecar/voices
cp -r vendor/tts-sidecar/voices/es_MX-claude-high \
  staging/macos-amd64/vendor/tts-sidecar/voices/
```

### D3: Workflow actualizado

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

Fan-out: `download-model` termina → 3 jobs arrancan en paralelo.

### D4: postinstall-tts.ts — eliminar descarga de voz

Eliminar de `scripts/postinstall-tts.ts`:
- La sección que descarga `modelUrl` y `configUrl` (líneas 211-242)
- El campo `voiceEntry` del manifiesto en el chequeo de idempotencia
- Las variables `modelDest`, `configDest`, `modelUrl`, `configUrl`

El manifiesto `tts-sidecar.sha256` ya no tiene sección `voices`:
```json
{
  "version": "0.1.0",
  "binaries": {
    "windows-amd64": { "file": "windows-amd64.zip", "sha256": "..." }
  }
}
```

El postinstall solo descarga el ZIP y lo extrae. La voz queda en `vendor/tts-sidecar/<targetId>/voices/es_MX-claude-high/`.

## Resumen del layout final

```
windows-amd64.zip
└── windows-amd64/
    ├── tts-sidecar.exe
    ├── libespeak-ng.dll
    ├── espeak-ng-data/
    │   └── ...
    └── voices/
        └── es_MX-claude-high/
            ├── es_MX-claude-high.onnx
            └── es_MX-claude-high.onnx.json
```

## No изменяется

- `.gitlab-ci.yml`: pipeline de GitLab, independiente. El job `release` descarga la voz para publicarla como asset de GitLab Release — se mantiene igual.
- `tts-sidecar.sha256` placeholder: se actualiza en CircleCI tras el build (la sección `voices` simplemente se elimina)
