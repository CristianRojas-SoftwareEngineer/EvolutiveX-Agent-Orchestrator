# Spec: unified-installer

## Purpose

CLI unificado (`setup:install` / `setup:uninstall`) para instalar, configurar y desinstalar las características de Smart Code Proxy (statusline, voz, hooks) sobre `~/.claude/settings.json` en Windows, Linux y macOS mediante el orquestador `scripting/setup.ts`.

---
## Requirements
### Requirement: Selección de features mediante flags explícitos

El sistema SHALL proporcionar un script CLI con flags `--statusline`, `--voice` y `--hooks` que determinen qué features participan en la operación. Cuando no se pasa ningún flag de feature, la operación SHALL aplicarse sobre las tres features. Cuando se pasan uno o más flags, la operación SHALL aplicarse únicamente sobre las features seleccionadas. El flag `--notifications` NO SHALL existir: las notificaciones viven dentro del conjunto indivisible de los 14 hooks de SCP (gateway + stop UX + notificaciones) y no pueden instalarse por separado.

#### Scenario: Sin flags de feature instala todo

- **WHEN** el usuario ejecuta `npm run setup:install` sin flags de feature
- **THEN** el script SHALL instalar statusline, voz y hooks en `~/.claude/settings.json`

#### Scenario: Flag único restringe la operación

- **WHEN** el usuario ejecuta `npm run setup:install -- --statusline`
- **THEN** el script SHALL instalar únicamente statusline
- **AND** SHALL no modificar `voice*` ni `hooks` existentes en `settings.json`

#### Scenario: Combinación de flags opera solo sobre los seleccionados

- **WHEN** el usuario ejecuta `npm run setup:install -- --statusline --voice`
- **THEN** el script SHALL instalar statusline y voz
- **AND** SHALL no modificar hooks existentes en `settings.json`

#### Scenario: Flag --hooks instala el conjunto indivisible de 14 claves

- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** el script SHALL instalar el conjunto de hooks definido en `configs/hooks.json` (14 claves: gateway, relays stdin único, notificaciones CLI y relay task-in-progress-hook-ux)
- **AND** SHALL no modificar `statusLine` ni `voice*` existentes en `settings.json`

---

### Requirement: Modo uninstall mediante flag `--uninstall`

El script SHALL admitir `--uninstall` como modificador de dirección: en lugar de instalar las features seleccionadas, las desinstala. La selección de features (flags presentes o ausentes) funciona igual que en modo install. Sin `--uninstall`, el default SHALL ser la dirección de instalación.

#### Scenario: Default install sin flag de dirección

- **WHEN** el usuario ejecuta `npm run setup:install` sin `--uninstall`
- **THEN** el script SHALL aplicar la operación en dirección install

#### Scenario: Uninstall total sin flags de feature

- **WHEN** el usuario ejecuta `npm run setup:uninstall`
- **THEN** el script SHALL desinstalar statusline, voz y hooks de `~/.claude/settings.json`

#### Scenario: Uninstall selectivo con flag de feature

- **WHEN** el usuario ejecuta `npm run setup:uninstall -- --voice`
- **THEN** el script SHALL eliminar `voiceEnabled` y `voice` de `settings.json`
- **AND** SHALL conservar `statusLine` y hooks existentes

#### Scenario: Uninstall de statusline y voz, conserva hooks

- **WHEN** el usuario ejecuta `npm run setup:uninstall -- --statusline --voice`
- **THEN** el script SHALL desinstalar statusline y voz
- **AND** SHALL conservar `hooks` en `settings.json`

---

### Requirement: Instalación y desinstalación de la característica de voz

El script SHALL gestionar las claves `voiceEnabled` y `voice` en `~/.claude/settings.json` mediante funciones `applyVoiceInstall` y `applyVoiceUninstall` exportadas desde `scripting/features/voice.ts`. La instalación no requiere validación de archivos en disco.

#### Scenario: Instalación de voz con modo hold (default)

- **WHEN** el usuario ejecuta `npm run setup:install -- --voice` sin `--voice-mode`
- **THEN** `settings.voiceEnabled` SHALL ser `true`
- **AND** `settings.voice.enabled` SHALL ser `true`
- **AND** `settings.voice.mode` SHALL ser `"hold"`
- **AND** `settings.voice.autoSubmit` SHALL ser `true`

#### Scenario: Instalación de voz con modo tap

- **WHEN** el usuario ejecuta `npm run setup:install -- --voice --voice-mode tap`
- **THEN** `settings.voice.mode` SHALL ser `"tap"`
- **AND** `settings.voice.autoSubmit` SHALL ser `true`

#### Scenario: Instalación de voz sin autoSubmit

- **WHEN** el usuario ejecuta `npm run setup:install -- --voice --no-voice-auto-submit`
- **THEN** `settings.voice.autoSubmit` SHALL ser `false`

#### Scenario: Desinstalación de voz elimina ambas claves

- **WHEN** el usuario ejecuta `npm run setup:uninstall -- --voice`
- **THEN** `settings.voiceEnabled` SHALL eliminarse de `settings.json`
- **AND** `settings.voice` SHALL eliminarse de `settings.json`

---

### Requirement: Promoción del patrón seguro S1-S5 a todas las features

El script SHALL cumplir las 5 garantías del patrón seguro (establecido por el commit `66cc38e`) para **todas** las features, no solo para hooks:

- **S1**: Validar los archivos del repo necesarios para cada feature activa, antes de cualquier escritura en `settings.json`.
- **S2**: Crear un backup timestamped en `~/.claude/settings-backup-<ISO>.json` **una sola vez** al inicio de la fase de escritura, cubriendo todas las features en bloque.
- **S3**: Realizar una única lectura y una única escritura de `settings.json` por invocación.
- **S4**: Preservar la configuración ajena del usuario en install y uninstall. En install, el merge selectivo de hooks clasifica cada clave como `scp-only`, `user-only` o `mixed`; las claves `user-only` se preservan intactas salvo con `--force`. En uninstall, cada feature solo borra lo que es suyo; `--force` permite borrar ajeno.
- **S5**: Usar `buildNpxTsxCommand` (de `scripting/shared/`) para garantizar quoting multiplataforma y normalizar backslashes antes de comparar rutas.

#### Scenario: S1 aborta antes de tocar settings.json

- **GIVEN** `--root` no contiene `scripting/post-hook-event.ts`
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** el script SHALL abortar con exit code 1 sin escribir en `settings.json`

#### Scenario: S2 crea backup antes de la primera escritura

- **WHEN** el usuario ejecuta `npm run setup:install`
- **THEN** el script SHALL crear `~/.claude/settings-backup-<ISO>.json` antes de invocar `writeClaudeSettings`
- **AND** SHALL existir exactamente un backup por invocación (no uno por feature)

#### Scenario: S3 realiza una sola escritura por invocación

- **WHEN** el usuario ejecuta `npm run setup:uninstall`
- **THEN** `settings.json` SHALL escribirse exactamente una vez tras aplicar las tres features
- **AND** SHALL no haber escrituras intermedias por feature

#### Scenario: S4 install preserva ajeno sin --force

- **GIVEN** `settings.hooks.UserPromptSubmit` contiene un comando ajeno a SCP
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks` sin `--force`
- **THEN** el comando ajeno SHALL preservarse en `UserPromptSubmit`
- **AND** los comandos canónicos de SCP SHALL agregarse al final del bloque

#### Scenario: S4 install sobrescribe ajeno con --force

- **GIVEN** `settings.hooks.UserPromptSubmit` contiene un comando ajeno a SCP
- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks --force`
- **THEN** el comando ajeno SHALL reemplazarse por los canónicos de SCP

#### Scenario: S4 uninstall preserva statusLine ajeno sin --force

- **GIVEN** `settings.statusLine.command` no es de Smart Code Proxy
- **WHEN** el usuario ejecuta `npm run setup:uninstall -- --statusline` sin `--force`
- **THEN** `statusLine` SHALL preservarse intacto

#### Scenario: S4 uninstall borra statusLine ajeno con --force

- **GIVEN** `settings.statusLine.command` no es de Smart Code Proxy
- **WHEN** el usuario ejecuta `npm run setup:uninstall -- --statusline --force`
- **THEN** `statusLine` SHALL eliminarse

---

### Requirement: Lectura y escritura única de settings.json

El script SHALL leer `~/.claude/settings.json` una sola vez al inicio, aplicar todas las transformaciones de features en cadena sobre el mismo objeto en memoria, y persistir el resultado con una sola escritura al final. Las funciones `applyStatuslineInstall/Uninstall`, `applyVoiceInstall/Uninstall` y las funciones de `scripting/features/hooks.ts` SHALL recibir el objeto settings y devolver uno nuevo sin efectos de escritura propios cuando son invocadas desde `setup.ts`.

#### Scenario: Instalación de tres features produce una sola escritura

- **WHEN** el usuario ejecuta `npm run setup:install`
- **THEN** `~/.claude/settings.json` SHALL leerse exactamente una vez
- **AND** SHALL escribirse exactamente una vez con las tres features aplicadas

---

### Requirement: Soporte a dry-run

El script SHALL admitir `--dry-run` que muestre en stdout qué cambios se aplicarían en `settings.json` sin escribir en disco. El dry-run SHALL aplicarse sobre todas las features seleccionadas.

#### Scenario: Dry-run no modifica settings.json

- **GIVEN** un `settings.json` en estado conocido
- **WHEN** el usuario ejecuta `npm run setup:install -- --dry-run`
- **THEN** el script SHALL mostrar los valores que se escribirían
- **AND** `settings.json` SHALL permanecer sin cambios

---

### Requirement: Soporte a `--force` para features con política de sobrescritura

El script SHALL propagar `--force` a `applyStatuslineInstall` y a `mergeHooks`, permitiendo sobrescribir configuración ajena. La feature de voz no tiene política de sobrescritura y SHALL ignorar `--force`.

#### Scenario: Force permite instalar sobre statusLine ajeno

- **GIVEN** `settings.statusLine.command` referencia un comando que no es de Smart Code Proxy
- **WHEN** el usuario ejecuta `npm run setup:install -- --statusline --force`
- **THEN** `statusLine` SHALL actualizarse al comando del proxy

---

### Requirement: Validación previa selectiva por feature

En modo install, el script SHALL validar únicamente las features seleccionadas que requieren archivos en disco. Si la validación de alguna feature falla, el script SHALL terminar con código de salida distinto de cero sin escribir en `settings.json`.

| Feature       | Validación requerida                                    |
|---------------|---------------------------------------------------------|
| statusline    | `scripting/router-status.ts` y `routing/providers/` existen |
| voice         | ninguna                                                 |
| hooks         | `configs/hooks.json`, `scripting/post-hook-event.ts`, `scripting/stop-hook-ux.ts`, `scripting/gateway-hook-notify.ts`, `scripting/pre-tool-use-hook-ux.ts` y `src/2-services/notifications/cli.ts` existen |

#### Scenario: Raíz inválida aborta sin escribir

- **GIVEN** `--root` no contiene `scripting/router-status.ts`
- **WHEN** el usuario ejecuta `npm run setup:install -- --statusline`
- **THEN** el script SHALL terminar con código de salida distinto de cero
- **AND** SHALL no modificar `settings.json`

#### Scenario: Validación solo aplica a las features seleccionadas

- **GIVEN** `--root` no contiene `scripting/router-status.ts`
- **WHEN** el usuario ejecuta `npm run setup:install -- --voice`
- **THEN** el script SHALL instalar voz correctamente sin error de validación

---

### Requirement: Política de uninstall de statusline preserva ajeno

La función `applyStatuslineUninstall` SHALL aceptar un parámetro `force: boolean`. Si `settings.statusLine.command` no es de Smart Code Proxy y `force` es `false`, SHALL preservar `statusLine` intacto. Si `force` es `true`, SHALL eliminar `statusLine`. Si `statusLine` no existe, SHALL no hacer nada.

#### Scenario: Uninstall de statusline ajeno sin --force preserva

- **GIVEN** `settings.statusLine.command` referencia un comando que no es de Smart Code Proxy
- **WHEN** se invoca `applyStatuslineUninstall(settings, false)`
- **THEN** el `settings` resultante SHALL tener el mismo `statusLine` que el input

#### Scenario: Uninstall de statusline ajeno con --force borra

- **GIVEN** `settings.statusLine.command` referencia un comando que no es de Smart Code Proxy
- **WHEN** se invoca `applyStatuslineUninstall(settings, true)`
- **THEN** el `settings` resultante SHALL no tener `statusLine`

#### Scenario: Uninstall de statusline de SCP siempre borra

- **GIVEN** `settings.statusLine.command` es de Smart Code Proxy
- **WHEN** se invoca `applyStatuslineUninstall(settings, false)` o `(settings, true)`
- **THEN** el `settings` resultante SHALL no tener `statusLine`

---

### Requirement: Indivisibilidad de --hooks

El flag `--hooks` SHALL instalar el conjunto indivisible de las **14 claves** de hooks declaradas en `configs/hooks.json`. Este conjunto cubre:

- **Gateway** (`scripting/post-hook-event.ts` y relays que integran `POST /hooks`).
- **Relays stdin único** (`stop-hook-ux.ts`, `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`).
- **Notificaciones CLI** (`src/2-services/notifications/cli.ts`) para entradas que no usan relay compuesto.

Las entradas de `SubagentStart`, `SubagentStop` y `StopFailure` combinan gateway y notificación en la misma clave de `settings.json`, por lo que **no es posible instalar gateway, stop UX o notificaciones por separado**. El flag SHALL instalar siempre el conjunto completo.

#### Scenario: --hooks instala los tres dominios en bloque

- **WHEN** el usuario ejecuta `npm run setup:install -- --hooks`
- **THEN** `settings.hooks` SHALL contener las 14 claves definidas en `configs/hooks.json`
- **AND** SHALL incluir `gateway-hook-notify`, `pre-tool-use-hook-ux`, `stop-hook-ux` y `notifications/cli.ts` según corresponda

#### Scenario: No existe flag para instalar solo notificaciones

- **WHEN** el usuario ejecuta `npm run setup:install -- --notifications`
- **THEN** el script SHALL abortar con un error de opción desconocida

---

### Requirement: Soporte multiplataforma

El script SHALL ejecutarse correctamente en Windows, Linux y macOS. Los comandos generados para `statusLine.command` y los hooks SHALL delegar en `buildNpxTsxCommand` (de `scripting/shared/`) para garantizar comillas y separadores de ruta correctos en cada plataforma. La configuración de voz no tiene dependencias de plataforma y SHALL comportarse de forma idéntica en los tres sistemas operativos.

#### Scenario: Instalación en Windows con ruta con espacios

- **GIVEN** la raíz del proxy contiene espacios en su ruta en Windows
- **WHEN** el usuario ejecuta `npm run setup:install`
- **THEN** los comandos generados para `statusLine` y hooks SHALL tener las rutas correctamente citadas para PowerShell/cmd
- **AND** las claves de voz SHALL escribirse en `settings.json` sin diferencias respecto a otras plataformas

---

### Requirement: Visibilidad en el panel de ayuda

Los scripts `setup:install` y `setup:uninstall` SHALL aparecer en la salida de `npm run help` dentro de la categoría `local`, con descripciones que indiquen su propósito como instalador/desinstalador unificado.

#### Scenario: help lista los scripts setup:install y setup:uninstall

- **WHEN** el usuario ejecuta `npm run help`
- **THEN** la salida SHALL incluir `setup:install` y `setup:uninstall` en la sección de scripts locales

---

### Requirement: Resultado equivalente al encadenamiento de funciones puras

El resultado de `npm run setup:install` SHALL ser deep-equal (mismas claves y valores) al producido por la composición de las funciones puras aplicadas en cadena sobre el mismo input inicial: `applyStatuslineInstall(settings, root, force)` + `applyVoiceInstall(settings, opts)` + `mergeHooks(settings, canonical, scpRoot, force)`. La comparación SHALL ser semántica (deep equality), no de orden de serialización JSON.

#### Scenario: Resultado equivalente al encadenamiento de funciones puras

- **GIVEN** `settings.json` en estado limpio
- **WHEN** el usuario ejecuta `npm run setup:install`
- **THEN** el objeto settings resultante SHALL ser deep-equal al producido por el encadenamiento de las funciones puras sobre el mismo input

---

### Requirement: Rutas POSIX-absolutas en todas las entradas de settings.json (S5-global)

El instalador universal SHALL garantizar que **todas** las rutas escritas en
`~/.claude/settings.json` sean absolutas y usen forward slashes (`/`) en todas las
plataformas (Windows, macOS, Linux). Esta garantía extiende S5 —hasta ahora aplicada
solo al comando del statusline— al resto de las entradas generadas:

- `statusLine.command`: rutas POSIX absolutas (ya garantizado por `buildNpxTsxCommand`).
- `hooks[*][*].command`: rutas POSIX absolutas resueltas en install-time (no variables
  de runtime de Claude Code).
- `env.SMART_CODE_PROXY_ROOT`: valor POSIX absoluto.

El orquestador `scripting/setup.ts` SHALL normalizar la raíz del proxy con
`resolvePosixAbsolutePath` antes de propagarla a cualquier función de feature.

#### Scenario: Install en Windows produce comandos con forward slashes

- **WHEN** el instalador se ejecuta en Windows con una raíz de proxy con backslashes
- **THEN** `settings.json` SHALL contener únicamente forward slashes en todos los valores de `command` y en `env.SMART_CODE_PROXY_ROOT`
- **AND** SHALL NOT contener backslashes en ninguna ruta generada por el instalador

#### Scenario: Los comandos de hooks no contienen variables de runtime de Claude Code

- **WHEN** el instalador escribe los hooks en `settings.json`
- **THEN** ningún valor `command` SHALL contener `${CLAUDE_PROJECT_DIR}` ni ninguna otra variable de runtime de Claude Code
- **AND** todas las rutas SHALL estar resueltas a valores literales POSIX absolutos
