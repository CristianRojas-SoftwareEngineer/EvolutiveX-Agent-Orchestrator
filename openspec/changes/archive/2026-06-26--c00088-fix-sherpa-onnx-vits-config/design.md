## Context

El pipeline CI de tts-sidecar tiene 5 jobs fallando. El archivo `sidecar/src/main.rs` usa incorrectamente la API de sherpa-onnx 1.13.3, y `.gitlab-ci.yml` tiene una ruta de rustup incorrecta para el runner Windows de GitLab CI. Ambos errores son estructurales: impiden que el codigo compile y que el pipeline CI se ejecute correctamente.

## Goals / Non-Goals

**Goals:**
- Corregir `OfflineTtsModelConfig` para usar el campo `vits: OfflineTtsVitsModelConfig` en lugar del campo inexistente `model`.
- Cambiar el retorno de `OfflineTts::create` de `Result` a `Option` (la API retorna `Option<OfflineTts>`, no `Result`).
- Derivar el path del archivo tokens del path del modelo mediante reemplazo de extension `.onnx` → `.onnx.json`.
- Corregir la ruta de rustup en Windows CI de `.cargo\bin\rustup` a la ruta real de Chocolatey `C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe`.
- Corregir la sintaxis de recarga de PATH en el `before_script` de Windows para que sea compatible con PowerShell en GitLab CI.

**Non-Goals:**
- No se modifica el protocolo STDIN/JSON del sidecar.
- No se cambia la logica de sintesis o reproduccion de audio.
- No se altera el pipeline de distribution (los demas jobs de build no requieren cambios).

## Decisions

### D1: Correccion de `OfflineTtsModelConfig` — uso del campo `vits` en lugar de `model`

**Opcion considerada:** Usar `OfflineTtsModelConfig { model: ..., ..Default::default() }` (codigo actual).

**Problema:** `OfflineTtsModelConfig` no tiene campo `model`. La configuracion para modelos VITS/Piper se realiza mediante el campo `vits: OfflineTtsVitsModelConfig`.

**Decision:** Usar `OfflineTtsVitsModelConfig` con los siguientes campos:
- `model`: ruta al archivo `.onnx` del modelo.
- `tokens`: ruta al archivo `.onnx.json` (derivada del path del modelo).

**Alternativa rechazada:** Usar `paraformer` o `transducer` — el modelo `es_MX-claude-high` es un modelo VITS, no un modelo Paraformer o Transducer.

### D2: Retorno de `OfflineTts::create` — `Option` en lugar de `Result`

**Opcion considerada:** `match OfflineTts::create(&config) { Ok(t) => ..., Err(e) => ... }` (codigo actual).

**Problema:** `OfflineTts::create` retorna `Option<OfflineTts>`, no `Result<OfflineTts, Box<dyn Error>>`. Usar `Ok`/`Err` en un `match` sobre un `Option` no compila.

**Decision:** Cambiar a `match OfflineTts::create(&config) { Some(t) => ..., None => ... }`.

### D3: Path del archivo tokens — derivacion mediante reemplazo de extension

**Decision:** El path del archivo tokens se deriva del path del modelo reemplazando la extension `.onnx` por `.onnx.json`.

**Justificacion:** Los modelos Piper/VITS en HuggingFace incluyen dos archivos: `<voice>.onnx` (modelo) y `<voice>.onnx.json` (configuracion de inferencia con parametros como `noise_scale`, `length_scale`, etc.). El archivo de tokens para sherpa-onnx es precisamente el `.onnx.json`. La convencion de nombre es siempre `<base>.onnx.json`, lo cual se confirma en la documentacion de sherpa-onnx para modelos Piper.

**Alternativa rechazada:** Especificar el archivo tokens por separado via CLI — se opto por la derivacion automatica para simplificar la interfaz.

### D4: Ruta de rustup en Windows CI

**Problema actual:** El `before_script` de `build:windows-amd64` usa `.cargo\bin\rustup default stable`. Sin embargo, Chocolatey instala `rust-ms` en `C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe`. Tras `choco install rust-ms`, rustup queda en el PATH del sistema, pero `.cargo\bin\rustup` no existe en esa maquina.

**Decision:** Usar la ruta directa `C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe` en lugar de `.cargo\bin\rustup`.

### D5: Sintaxis de recarga de PATH en PowerShell para GitLab CI

**Problema actual:** La linea `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")` usa sintaxis `$env:Path` que es valida en PowerShell interactivo, pero GitLab CI ejecuta los scripts via `powershell -File` o `bash -c` de forma que puede no expandir correctamente las variables dentro de un YAML `script:` multilinea.

**Decision:** Reemplazar la linea de recarga de PATH por una sintaxis que use el comando `refreshenv` de Chocolatey o, alternativamente, usar la sintaxis `$(${env:Path})` con parens dobles para garantizar la expansion. La solucion mas robusta es invocar rustup directamente desde su ruta completa sin depender de la recarga de PATH:

```
- C:\ProgramData\chocolatey\lib\rust-ms\tools\rustup.exe default stable
```

Esto elimina la dependencia de la recarga de PATH y es explicito sobre cual ejecutable se usa.

## Risks / Trade-offs

- **Riesgo:** Cambiar la configuracion de `OfflineTtsModelConfig` podria causar errores en tiempo de ejecucion si el modelo VITS no esta disponible o si los parametros de inferencia (`noise_scale=0.667`, `length_scale=1.0`) no son los esperados.
  - **Mitigacion:** El pipeline `release` descarga el modelo y su configuracion desde HuggingFace; si hay un problema, el job fallara en el paso de descarga, no en el sidecar.

- **Riesgo:** La derivacion automatica del path de tokens `.onnx → .onnx.json` asume que ambos archivos existen con ese convenio de nombres.
  - **Mitigacion:** El modelo `es_MX-claude-high` en HuggingFace sigue este convenio. Si en el futuro se usa otro modelo con diferente estructura, el cambio debera actualizarse.

## Migration Plan

1. Aplicar los cambios a `sidecar/src/main.rs` (campo `vits`, retorno `Option`, derivacion de tokens).
2. Aplicar los cambios a `.gitlab-ci.yml` (ruta directa de rustup, eliminacion de la recarga de PATH fallida).
3. Verificar que los cambios compilan localmente: `cargo build --release --manifest-path sidecar/Cargo.toml`.
4. Hacer push a la rama y verificar que el pipeline CI se ejecuta sin errores en los 5 jobs.

## Open Questions

Ninguna. Todas las decisiones de diseno fueron resueltas antes de escribir este documento.
