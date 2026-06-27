# Proposal: c00094 — tts-sidecar unified voice bundle

## Problema

El pipeline CircleCI actual produce un ZIP por plataforma que contiene el binario `tts-sidecar` + `libespeak-ng` + `espeak-ng-data/`. Sin embargo, el modelo de voz `es_MX-claude-high` (`.onnx` + `.onnx.json`) se publica como asset separado.

El postinstall NPM (`scripts/postinstall-tts.ts`) debe hacer dos descargas independientes:
1. Descargar y extraer el ZIP del binario
2. Descargar el modelo de voz desde `voices/es_MX-claude-high/`

Esto crea fricción: un usuario que quiere probar el sidecar necesita dos pasos de descarga y más superficie de error.

## Objetivo

Incluir el modelo de voz dentro del ZIP de cada plataforma. Un usuario descarga un solo `<platform>.zip`, lo extrae, y tiene todo lo necesario para que el sidecar funcione.

## Solución seleccionada: Job separado + CircleCI Workspace + Cache

El modelo de voz se descarga una vez en un job `download-model`, se guarda en caché CircleCI para pipelines futuros, y se comparte con los 3 jobs de compilación via workspace.

```
download-model  ──→  linux-amd64
                ──→  windows-amd64
                ──→  macos-amd64
```

Cada job de compilación copia el modelo al staging antes de comprimir el ZIP.

## Resultados esperados

| Métrica | Antes | Después |
|---------|-------|---------|
| Descargas para instalar | 2 (binario + voz) | 1 (ZIP único) |
| Tamaño ZIP por plataforma | ~10-15 MB | ~50-80 MB |
| postinstall-tts.ts | 2 descargas + verificación doble | 1 descarga + verificación simple |
| Pasos para usuario final | 2 descargas + extracción | 1 descarga + extracción |

## Decisiones tomadas

1. **Job separado + Workspace**: descarga la voz una vez, no 3 veces
2. **Caché versionada**: clave `voice-model-es-MX-claude-high-v1`; cambiar a `v2` fuerza re-descarga
3. **Path del modelo en ZIP**: `voices/es_MX-claude-high/` dentro del `<targetId>/`
4. **postinstall-tts.ts**: se simplifica eliminando toda la lógica de descarga de voz
5. **tts-sidecar.sha256**: sección `voices` se elimina; la verificación de SHA es solo del ZIP

## Scope

### Dentro del scope
- `.circleci/config.yml` — job `download-model`, workflow fan-out, attach_workspace, copia al staging
- `scripts/postinstall-tts.ts` — eliminar lógica de descarga de voz
- `openspec/specs/tts-sidecar-binary-distribution/spec.md` — actualizar layout y manifiesto
- `docs/tts-sidecar-build.md` — reflejar nueva arquitectura
- `tts-sidecar.sha256` — eliminar sección `voices`

### Fuera del scope
- `.gitlab-ci.yml` — pipeline de GitLab, independiente de CircleCI
- Agregar más voces — solo `es_MX-claude-high` por ahora
- Cambiar el motor TTS (sherpa-onnx se mantiene)
