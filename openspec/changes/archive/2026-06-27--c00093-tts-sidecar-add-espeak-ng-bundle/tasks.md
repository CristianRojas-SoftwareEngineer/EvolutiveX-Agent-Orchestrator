## 1. Modificar job de Windows para bundlear espeak-ng

- [x] 1.1 Agregar paso de descarga de libespeak-ng.dll desde GitHub releases al job `tts-sidecar-windows-x86_64`
- [x] 1.2 Agregar paso de descarga y extracción de espeak-ng-data/ al job de Windows
- [x] 1.3 Modificar paso de empaquetado para incluir libespeak-ng.dll y espeak-ng-data/ en el ZIP
- [x] 1.4 Actualizar el nombre del archivo de .zip a `windows-amd64.zip` para consistencia con el spec

## 2. Modificar job de macOS para bundlear espeak-ng

- [x] 2.1 Agregar instalación de espeak-ng vía Homebrew al job `tts-sidecar-macos-universal`
- [x] 2.2 Modificar paso de empaquetado para copiar libespeak-ng.dylib al directorio de staging
- [x] 2.3 Modificar paso de empaquetado para copiar espeak-ng-data/ al directorio de staging
- [x] 2.4 Cambiar formato de .tar.gz a .zip para consistencia con el spec
- [x] 2.5 Actualizar el nombre del archivo a `macos-amd64.zip` (Universal Binary)

## 3. Verificar Linux bundling existente

- [x] 3.1 Verificar que el job Linux ya copia libespeak-ng.so (líneas 48-49 del config.yml)
- [x] 3.2 Verificar que el job Linux ya copia espeak-ng-data/ (líneas 50-54)
- [x] 3.3 Actualizar el nombre del archivo a `linux-amd64.zip` para consistencia con naming

## 4. Actualizar documentación

- [x] 4.1 Buscar y corregir documentación que menciona espeak-ng como "Fallback TTS"
- [x] 4.2 Actualizar descripción para reflejar que espeak-ng es el phonemizer de sherpa-onnx