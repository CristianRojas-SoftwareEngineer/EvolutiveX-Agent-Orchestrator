## Why

El delta archivado `c00076-replace-gemini-tts-with-sidecar` implemento el codigo TypeScript del sidecar (PiperSidecarService, sidecar-resolver, ITtsSidecarService, cableado en composition-root) y sus pruebas, pero dejo **sin hacer** la mitad de distribucion binaria. Por eso hoy no se escucha audio TTS en eventos hook: `resolveSidecarAssets()` lanza `SidecarNotInstalledError`, el handler lo absorbe con `[TTS-SIDE] reason: sidecar-missing` y omite la reproduccion (degradacion elegante por diseno).

## What Changes

- **Rust crate del sidecar**: Crear el crate Rust en `sidecar/` (fuente versionado; `vendor/tts-sidecar/` está gitignored y solo aloja la instalación de runtime) que usa sherpa-onnx + CPAL para salida de audio. Protocolo STDIN/JSON `{"cmd":"speak","text":"...","voice":"..."}\n` -> STDOUT `{"status":"ok"}` o `{"status":"error",...}`. Args CLI `--model <path.onnx> --config <path.onnx.json>`. Bundles espeak-ng junto al binario.
- **Workflow de CI (GitHub Actions matrix)**: 5 targets — x86_64-pc-windows-msvc, x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu, x86_64-apple-darwin, aarch64-apple-darwin. Compilacion cruzada, bundle espeak-ng + descarga de voz, publicacion a Releases, emision de SHA256 real.
- **Cableado en el repo**: `package.json` script `tts:setup` (ejecutado con `node`, no `tsx`) encadenado en `postinstall` con `;` SIN romper el postinstall existente de openspec; corregir el nombre de voz en sidecar-resolver.ts, piper-sidecar.service.ts, scripts/postinstall-tts.ts (const VOICE) y tts-sidecar.sha256; estructura del manifiesto tts-sidecar.sha256; pin `TTS_SIDECAR_BASE_URL` a URL real de GitHub Releases.
- **Correccion de voz**: Reemplazar el nombre incorrecto `es_MX-claude-voice-medium` por `es_MX-claude-high` en todos los archivos mencionados.

## Capabilities

### New Capabilities

- `tts-sidecar-binary-distribution`: Pipeline de CI que produce binarios sherpa-onnx para 5 plataformas, los publica en GitHub Releases y genera SHA256 real. Incluye el script de postinstall `tts:setup` que descarga y verifica los assets del sidecar.

### Modified Capabilities

- `tts-sidecar-installer`: El spec.md existente debe sincronizarse para reflejar que el installer ahora usa el script `tts:setup` (postinstall) en lugar del flujo manual, y que el nombre de voz por defecto es `es_MX-claude-high`.
- `tts-hooks`: El spec.md existente debe actualizarse para registrar que `resolveSidecarAssets()` puede resolver exitosamente el sidecar una vez que los assets binarios esten publicados en GitHub Releases.

### Non-canonical change

Ninguna. Todos los items de What Changes tienen contraparte canonica en los specs de tts-sidecar-installer y tts-hooks.

## Impact

- **Archivos creados**: `sidecar/` (Rust crate, fuente versionado; NO en `vendor/tts-sidecar/` que está gitignored), `.github/workflows/tts-sidecar-release.yml` (CI), `.npmignore`
- **Archivos modificados**: `scripts/postinstall-tts.ts` (reescrito: flujo ZIP + voz-separada, `adm-zip`, default real de `BASE_URL`), `package.json` (script tts:setup y postinstall con `node`, encadenado con `;`, `files` con `dist`, `adm-zip` en dependencies), `src/2-services/tts/sidecar-resolver.ts` (nombre de voz), `src/2-services/tts/piper-sidecar.service.ts` (nombre de voz), `tts-sidecar.sha256` (hashes reales y estructura), `configs/.env.example` (TTS_SIDECAR_BASE_URL)
- **Specs sincronizados**: `openspec/specs/tts-sidecar-installer/spec.md`, `openspec/specs/tts-hooks/spec.md`
- **Dependencias nuevas**: sherpa-onnx, cpal (Rust), espeak-ng bundling; `adm-zip` (Node, descompresión del ZIP en el postinstall)
