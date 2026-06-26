## 1. Fix CI template para linux-amd64

- [x] 1.1 Agregar `libasound2-dev` al apt-get install en la seccion `script` del `.build_template` de linux (lineas 47-54 del .gitlab-ci.yml) ~done

## 2. Fix CI template para linux-aarch64

- [x] 2.1 Agregar `export PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu` en el bloque `if [ "$CROSS" = "true" ]` del `.build_template` (lineas 56-63 del .gitlab-ci.yml) ~done
- [x] 2.2 Agregar `export PKG_CONFIG_PATH="/usr/aarch64-linux-gnu/lib/pkgconfig:${PKG_CONFIG_PATH:-}"` en el mismo bloque ~done

## 3. Adaptar codigo main.rs a sherpa-onnx 1.13.3

- [x] 3.1 Reemplazar `OfflineTtsConfig` por `OfflineTtsModelConfig` en `sidecar/src/main.rs` (linea 135) ~done
- [x] 3.2 Eliminar los campos `config` y `espeak_data` de la configuracion (lineas 137-138) ~done
- [x] 3.3 Cambiar `OfflineTts::new(&config)` por `OfflineTts::create(&model_config)` (linea 143) ~done
- [x] 3.4 Verificar que `cli.config` y `cli.espeak_data` ya no se usan y eliminar las variables si corresponde ~done

## 4. Fix CI template para windows-amd64

- [x] 4.1 Cambiar `rustup default stable` por `.cargo\bin\rustup default stable` en el `before_script` de `build:windows-amd64` (linea 106 del .gitlab-ci.yml) ~done

## 5. Verificacion

- [ ] 5.1 Hacer push de los cambios y verificar que el pipeline CI se dispara automaticamente ~todo
- [ ] 5.2 Confirmar que los 5 jobs (linux-amd64, linux-aarch64, macos-amd64, macos-aarch64, windows-amd64) pasan sin errores ~todo
