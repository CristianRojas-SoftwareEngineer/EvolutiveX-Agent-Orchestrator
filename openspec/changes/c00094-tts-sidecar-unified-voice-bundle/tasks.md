# Tasks: c00094 — tts-sidecar unified voice bundle

## Phase 1: Specification-delta (este documento)

- [x] Crear `openspec/changes/c00094-tts-sidecar-unified-voice-bundle/`
- [x] Crear `specs/tts-sidecar-binary-distribution/spec.md` (delta del spec canónico)
- [x] Crear `design.md` (decisiones de implementación)
- [ ] Crear `proposal.md` (contexto y objetivo)
- [ ] Crear `.openspec.yaml` (metadatos del change)
- [ ] Ejecutar `verify-stage-completion --through tasks`

## Phase 2: Aplicación

- [ ] Actualizar `openspec/specs/tts-sidecar-binary-distribution/spec.md` — aplicar los cambios de layout y eliminar sección `voices`
- [ ] Actualizar `.circleci/config.yml`:
  - [ ] Agregar job `download-model` con restore_cache + download + save_cache + persist_to_workspace
  - [ ] Modificar workflow `build-all` para usar fan-out con `requires: [download-model]`
  - [ ] Agregar `attach_workspace` al inicio de `linux-amd64`, `windows-amd64`, `macos-amd64`
  - [ ] Agregar copia del modelo al staging en cada job (antes del `zip`)
- [ ] Actualizar `scripts/postinstall-tts.ts`:
  - [ ] Eliminar la sección de descarga de voz (líneas 211-242)
  - [ ] Eliminar `voiceEntry` del manifiesto y del chequeo de idempotencia
  - [ ] Simplificar `loadManifest()` a solo `binaries` + `version`
  - [ ] Eliminar variables `modelDest`, `configDest`, `modelUrl`, `configUrl`
- [ ] Actualizar `docs/tts-sidecar-build.md` — reflejar nueva estructura del ZIP
- [ ] Actualizar `tts-sidecar.sha256` — eliminar sección `voices`

## Phase 3: Verificación

- [ ] Verificar que el pipeline CircleCI passe (localmente no可达 — verificar via code review)
- [ ] Verificar que `postinstall-tts.ts` compila sin errores de types
- [ ] Verificar que `openspec verify-stage-completion --change c00094` pasa
