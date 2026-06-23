# Especificación: tts-sidecar-installer

## Propósito
Definir los requisitos de instalación, verificación de integridad y resolución de paths del sidecar local de TTS (`tts-sidecar`) y de su modelo de voz, de forma que el gateway pueda localizar y hablar con el binario sin depender de red en tiempo de ejecución.

---

## Requirements

### Requirement: Resolución y verificación del sidecar local de TTS
El sistema SHALL distribuir el binario `tts-sidecar` y su modelo de voz por plataforma (Windows x64, Linux x64, Linux arm64, macOS x64, macOS arm64) y SHALL verificar su integridad antes del primer uso mediante un manifiesto `tts-sidecar.sha256` versionado en el repo.

El path de instalación SHALL ser `vendor/tts-sidecar/<platform>-<arch>/tts-sidecar[.exe]` para el binario y `vendor/tts-sidecar/voices/es_MX/` para el modelo. El directorio `vendor/tts-sidecar/` SHALL estar listado en `.gitignore`. El binario SHALL ser ejecutable directamente (sin runtime externo: ni Node, ni Python, ni DLLs sueltas en el path del usuario).

La descarga SHALL ocurrir en `npm install` (vía hook `postinstall`) y SHALL ser repetible manualmente con `npm run tts:setup`. Si la descarga o verificación falla, el script SHALL imprimir un mensaje de error accionable indicando que la síntesis de voz no estará disponible hasta ejecutar `npm run tts:setup` con conexión a Internet, y SHALL salir con código no-cero **sin abortar** el `npm install` (postinstall no debe romper el flujo de instalación principal).

#### Scenario: Postinstall descarga binario y modelo con SHA256 válido
- **GIVEN** que `vendor/tts-sidecar/` no existe o está vacío
- **AND** la plataforma y arquitectura actuales están soportadas
- **WHEN** se ejecuta `npm install` (o `npm run tts:setup`)
- **THEN** SHALL descargar el binario correspondiente a la plataforma desde una URL versionada
- **AND** SHALL verificar su SHA256 contra `tts-sidecar.sha256`
- **AND** SHALL descargar el modelo `es_MX` (archivos `.onnx` y `.onnx.json`)
- **AND** SHALL dejar el árbol listo para que `PiperSidecarService` lo encuentre sin volver a descargar

#### Scenario: Sidecar ya instalado es idempotente
- **GIVEN** que `vendor/tts-sidecar/<platform>-<arch>/tts-sidecar[.exe]` existe
- **AND** su SHA256 coincide con el manifiesto
- **WHEN** se ejecuta `npm run tts:setup`
- **THEN** SHALL salir con código cero sin volver a descargar el binario
- **AND** SHALL imprimir un mensaje informativo indicando que la instalación ya estaba completa

#### Scenario: SHA256 inválido aborta la instalación con error accionable
- **GIVEN** que el binario descargado no pasa la verificación SHA256
- **WHEN** el script de instalación procesa el archivo
- **THEN** SHALL eliminar el archivo descargado
- **AND** SHALL imprimir un mensaje de error que incluya el SHA256 esperado y el calculado
- **AND** SHALL salir con código no-cero

#### Scenario: Plataforma no soportada falla con mensaje claro
- **GIVEN** que `process.platform` y `process.arch` no están en la lista de targets soportados
- **WHEN** se ejecuta `npm run tts:setup`
- **THEN** SHALL imprimir un mensaje indicando la plataforma detectada y la lista de targets soportados
- **AND** SHALL salir con código no-cero
- **AND** SHALL **NO** abortar el `npm install` (postinstall degradado, no bloqueante)

#### Scenario: Resolución de path no requiere red
- **GIVEN** que el sidecar está correctamente instalado
- **WHEN** `PiperSidecarService` invoca `resolveSidecarAssets()`
- **THEN** SHALL retornar paths absolutos al binario y al modelo sin hacer ninguna llamada de red
- **AND** SHALL lanzar un error explícito si el binario o el modelo no existen en disco

#### Scenario: `vendor/tts-sidecar/` no se versiona
- **GIVEN** que `vendor/tts-sidecar/` contiene binarios y modelos descargados
- **WHEN** se ejecuta `git status`
- **THEN** SHALL listar `vendor/tts-sidecar/` como ignorado
- **AND** SHALL **NO** aparecer en `git diff` ni en commits
