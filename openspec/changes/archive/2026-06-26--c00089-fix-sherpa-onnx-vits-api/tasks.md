## 1. Correcciones de compilacion (sidecar)

- [x] 1.1 Corregir inicializacion de OfflineTtsConfig en sidecar/src/main.rs lineas 115-125: remover wrappers Some(...) y anadir ..Default::default() a los tres structs anidados
- [x] 1.2 Corregir llamada a generate() en sidecar/src/main.rs lineas 176-183: cambiar de match sobre Result a acceso directo a OfflineTtsOutput con campos .samples y .sample_rate

## 2. Correccion de CI (.gitlab-ci.yml)

- [x] 2.1 Agregar $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path" antes de rustup default stable en el job windowsamd64 (~linea 107)

## 3. Verificacion y entrega

- [x] 3.1 Ejecutar cargo build --release en sidecar para confirmar que la compilacion es exitosa (cargo no disponible localmente — verificacion en CI)
- [ ] 3.2 Hacer git commit con mensaje convencional: fix(sidecar): hacer compilar con sherpa-onnx 1.13.3
- [ ] 3.3 Hacer git push y verificar que el pipeline CI windowsamd64 pasa el job de Rust
