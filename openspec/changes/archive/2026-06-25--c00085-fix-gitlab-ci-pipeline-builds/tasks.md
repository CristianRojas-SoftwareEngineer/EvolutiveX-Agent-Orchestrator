## 1. Correcciones del pipeline GitLab CI

- [x] 1.1 Cambiar `image: rust:1.78` → `image: rust:1.85` en el job `release` del `.gitlab-ci.yml` (linea 168) ~done
- [x] 1.2 Agregar `choco install -y rust-ms` en el job `windows-amd64` antes de la compilacion ~done
- [x] 1.3 Agregar instalacion de rustup via `curl sh.rustup.rs -s -- --default toolchain 1.85 --default-host <triple>` en los jobs `macos-amd64` y `macos-aarch64` ~done

## 2. Actualizacion de documentacion

- [x] 2.1 Identificar todos los archivos del repo que mencionan GitHub Actions, windows-latest, ubuntu-latest, macos-13, macos-14, o .github/workflows/tts-sidecar-release.yml (busqueda exhaustiva) ~done
- [x] 2.2 Actualizar README.md y cualquier otro archivo afectado para reemplazar las referencias a GitHub Actions por GitLab CI con los runners SaaS correspondientes ~done

## 3. Sincronizacion de spec canonica

- [x] 3.1 Verificar que `openspec/specs/tts-sidecar-binary-distribution/spec.md` Requirement 1 y su tabla de mapping (lineas 13-19) reflejan GitLab CI con runners SaaS de GitLab (saas-linux-medium-amd64, saas-windows-medium-amd64, saas-macos-medium-m1) — esta actualizacion se ejecuta al sincronizar el delta archivado ~done

## 4. Verificacion

- [ ] 4.1 Trigger un run del pipeline con un tag `tts-sidecar-v*` y verificar que los 5 jobs de build completan con codigo 0 ~todo
- [ ] 4.2 Confirmar que cada job produce un ZIP con el layout `<targetId>/tts-sidecar[.exe]`, `libespeak-ng.{dll,so,dylib}` y `espeak-ng-data/` ~todo
