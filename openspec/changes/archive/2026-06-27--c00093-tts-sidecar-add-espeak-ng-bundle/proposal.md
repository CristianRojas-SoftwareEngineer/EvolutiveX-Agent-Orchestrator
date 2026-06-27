## Why

El spec `tts-sidecar-binary-distribution` (líneas 29-37) requiere que el pipeline de CI bundlee `libespeak-ng.{dll,so,dylib}` y el directorio `espeak-ng-data/` dentro del ZIP para las tres plataformas. Actualmente, el pipeline solo bundlea estos archivos en Linux (de forma parcial), pero **no** en Windows ni macOS. Además, la documentación actual describe a espeak-ng como "Fallback TTS" cuando en realidad es el **phonemizer de sherpa-onnx**, no un fallback de voz.

## What Changes

- **Modificar** el pipeline CircleCI para Windows (`build:windows-amd64`) para que copie `libespeak-ng.dll` y el directorio `espeak-ng-data/` dentro del ZIP
- **Modificar** el pipeline CircleCI para macOS (`build:macos-amd64`, `build:macos-aarch64`) para que copie `libespeak-ng.dylib` y el directorio `espeak-ng-data/` dentro del ZIP
- **Corregir** la documentación de `tts-sidecar` para reflejar que espeak-ng es el phonemizer requerido por sherpa-onnx, no un fallback TTS

## Capabilities

### Modified Capabilities

- `tts-sidecar-binary-distribution`: El requirement existente (líneas 29-37 del spec) declara que el pipeline DEBE bundlear libespeak-ng + espeak-ng-data/ en las 3 plataformas. Este cambio corrige la implementación del pipeline para cumplir el requirement en Windows y macOS, y corrige la documentación para refletir el rol correcto de espeak-ng.

## Impact

- Pipeline CircleCI: archivos `.circleci/config.yml` — jobs de build para windows-amd64, macos-amd64, macos-aarch64
- Documentación: archivos README.md o docs/ que mencionen espeak-ng como "Fallback TTS"