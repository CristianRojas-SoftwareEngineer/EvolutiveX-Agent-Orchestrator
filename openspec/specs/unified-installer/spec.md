# Spec: unified-installer

## Purpose

CLI unificado (`setup`) para instalar, configurar y desinstalar las características de Smart Code Proxy (statusline, notificaciones, voz) sobre `~/.claude/settings.json` en Windows, Linux y macOS.

---

## Requirements

### Requirement: Selección de features mediante flags explícitos

El sistema SHALL proporcionar un script CLI (`setup`) con flags `--statusline`, `--notifications` y `--voice` que determinen qué features participan en la operación. Cuando no se pasa ningún flag de feature, la operación SHALL aplicarse sobre las tres features. Cuando se pasan uno o más flags, la operación SHALL aplicarse únicamente sobre las features seleccionadas.

#### Scenario: Sin flags de feature instala todo

- **WHEN** el usuario ejecuta `npm run setup` sin flags de feature
- **THEN** el script SHALL instalar statusline, notificaciones y voz en `~/.claude/settings.json`

#### Scenario: Flag único restringe la operación

- **WHEN** el usuario ejecuta `npm run setup -- --notifications`
- **THEN** el script SHALL instalar únicamente las notificaciones
- **AND** SHALL no modificar `statusLine` ni claves `voice*` existentes en `settings.json`

#### Scenario: Combinación de flags opera solo sobre los seleccionados

- **WHEN** el usuario ejecuta `npm run setup -- --statusline --voice`
- **THEN** el script SHALL instalar statusline y voz
- **AND** SHALL no modificar hooks de notificación existentes en `settings.json`

---

### Requirement: Modo uninstall mediante flag `--uninstall`

El script SHALL admitir `--uninstall` como modificador de dirección: en lugar de instalar las features seleccionadas, las desinstala. La selección de features (flags presentes o ausentes) funciona igual que en modo install.

#### Scenario: Uninstall total sin flags de feature

- **WHEN** el usuario ejecuta `npm run setup -- --uninstall`
- **THEN** el script SHALL desinstalar statusline, notificaciones y voz de `~/.claude/settings.json`

#### Scenario: Uninstall selectivo con flag de feature

- **WHEN** el usuario ejecuta `npm run setup -- --uninstall --voice`
- **THEN** el script SHALL eliminar `voiceEnabled` y `voice` de `settings.json`
- **AND** SHALL conservar `statusLine` y hooks de notificación existentes

#### Scenario: Uninstall de statusline y notificaciones, conserva voz

- **WHEN** el usuario ejecuta `npm run setup -- --uninstall --statusline --notifications`
- **THEN** el script SHALL desinstalar statusline y notificaciones
- **AND** SHALL conservar `voiceEnabled` y `voice` en `settings.json`

---

### Requirement: Instalación y desinstalación de la característica de voz

El script SHALL gestionar las claves `voiceEnabled` y `voice` en `~/.claude/settings.json` mediante funciones `applyVoiceInstall` y `applyVoiceUninstall` exportadas desde `scripting/install-voice.ts`. La instalación no requiere validación de archivos en disco.

#### Scenario: Instalación de voz con modo hold (default)

- **WHEN** el usuario ejecuta `npm run setup -- --voice` sin `--voice-mode`
- **THEN** `settings.voiceEnabled` SHALL ser `true`
- **AND** `settings.voice.enabled` SHALL ser `true`
- **AND** `settings.voice.mode` SHALL ser `"hold"`
- **AND** `settings.voice.autoSubmit` SHALL ser `true`

#### Scenario: Instalación de voz con modo tap

- **WHEN** el usuario ejecuta `npm run setup -- --voice --voice-mode tap`
- **THEN** `settings.voice.mode` SHALL ser `"tap"`
- **AND** `settings.voice.autoSubmit` SHALL ser `true`

#### Scenario: Instalación de voz sin autoSubmit

- **WHEN** el usuario ejecuta `npm run setup -- --voice --no-voice-auto-submit`
- **THEN** `settings.voice.autoSubmit` SHALL ser `false`

#### Scenario: Desinstalación de voz elimina ambas claves

- **WHEN** el usuario ejecuta `npm run setup -- --uninstall --voice`
- **THEN** `settings.voiceEnabled` SHALL eliminarse de `settings.json`
- **AND** `settings.voice` SHALL eliminarse de `settings.json`

---

### Requirement: Lectura y escritura única de settings.json

El script SHALL leer `~/.claude/settings.json` una sola vez al inicio, aplicar todas las transformaciones de features en cadena sobre el mismo objeto en memoria, y persistir el resultado con una sola escritura al final. Las funciones `applyStatuslineInstall/Uninstall`, `applyNotificationsInstall/Uninstall` y `applyVoiceInstall/Uninstall` SHALL recibir el objeto settings y devolver uno nuevo sin efectos de escritura propios cuando son invocadas desde `setup.ts`.

#### Scenario: Instalación de dos features produce una sola escritura

- **WHEN** el usuario ejecuta `npm run setup -- --statusline --notifications`
- **THEN** `~/.claude/settings.json` SHALL leerse exactamente una vez
- **AND** SHALL escribirse exactamente una vez con ambas features aplicadas

---

### Requirement: Soporte a dry-run

El script SHALL admitir `--dry-run` que muestre en stdout qué cambios se aplicarían en `settings.json` sin escribir en disco. El dry-run SHALL aplicarse sobre todas las features seleccionadas.

#### Scenario: Dry-run no modifica settings.json

- **GIVEN** un `settings.json` en estado conocido
- **WHEN** el usuario ejecuta `npm run setup -- --dry-run`
- **THEN** el script SHALL mostrar los valores que se escribirían
- **AND** `settings.json` SHALL permanecer sin cambios

---

### Requirement: Soporte a `--force` para features con política de sobrescritura

El script SHALL propagar `--force` a las funciones `applyStatuslineInstall` y `applyNotificationsInstall`, permitiendo sobrescribir configuración ajena. La feature de voz no tiene política de sobrescritura y SHALL ignorar `--force`.

#### Scenario: Force permite instalar sobre statusLine ajeno

- **GIVEN** `settings.statusLine.command` referencia un comando que no es de Smart Code Proxy
- **WHEN** el usuario ejecuta `npm run setup -- --statusline --force`
- **THEN** `statusLine` SHALL actualizarse al comando del proxy

---

### Requirement: Validación previa selectiva por feature

En modo install, el script SHALL validar únicamente las features seleccionadas que requieren archivos en disco. Si la validación de alguna feature falla, el script SHALL terminar con código de salida distinto de cero sin escribir en `settings.json`.

| Feature       | Validación requerida                                    |
|---------------|---------------------------------------------------------|
| statusline    | `scripting/router-status.ts` y `routing/providers/` existen |
| notifications | `src/2-services/notifications/cli.ts` existe           |
| voice         | ninguna                                                 |

#### Scenario: Raíz inválida aborta sin escribir

- **GIVEN** `--root` no contiene `scripting/router-status.ts`
- **WHEN** el usuario ejecuta `npm run setup -- --statusline`
- **THEN** el script SHALL terminar con código de salida distinto de cero
- **AND** SHALL no modificar `settings.json`

#### Scenario: Validación solo aplica a las features seleccionadas

- **GIVEN** `--root` no contiene `scripting/router-status.ts`
- **WHEN** el usuario ejecuta `npm run setup -- --voice`
- **THEN** el script SHALL instalar voz correctamente sin error de validación

---

### Requirement: Soporte multiplataforma

El script SHALL ejecutarse correctamente en Windows, Linux y macOS. Los comandos generados para `statusLine.command` y los hooks de notificación SHALL delegar en `buildNpxTsxCommand` (de `scripting/shared/`) para garantizar comillas y separadores de ruta correctos en cada plataforma. La configuración de voz no tiene dependencias de plataforma y SHALL comportarse de forma idéntica en los tres sistemas operativos.

#### Scenario: Instalación en Windows con ruta con espacios

- **GIVEN** la raíz del proxy contiene espacios en su ruta en Windows
- **WHEN** el usuario ejecuta `npm run setup`
- **THEN** los comandos generados para `statusLine` y hooks SHALL tener las rutas correctamente citadas para PowerShell/cmd
- **AND** las claves de voz SHALL escribirse en `settings.json` sin diferencias respecto a otras plataformas

#### Scenario: Instalación en Linux o macOS con ruta con espacios

- **GIVEN** la raíz del proxy contiene espacios en su ruta en Linux o macOS
- **WHEN** el usuario ejecuta `npm run setup`
- **THEN** los comandos generados SHALL tener las rutas correctamente citadas para shell POSIX

---

### Requirement: Visibilidad en el panel de ayuda

El script `setup` SHALL aparecer en la salida de `npm run help` dentro de la categoría `local`, con una descripción que indique su propósito como instalador unificado de las características de Smart Code Proxy.

#### Scenario: help lista el script setup

- **WHEN** el usuario ejecuta `npm run help`
- **THEN** la salida SHALL incluir `setup` en la sección de scripts locales
- **AND** SHALL mostrar una descripción que mencione que instala statusline, notificaciones y voz

---

### Requirement: Compatibilidad con instaladores individuales

El script `setup` SHALL coexistir con `install:statusline` e `install:notifications`. Ambos grupos de scripts operan sobre `~/.claude/settings.json` usando las mismas funciones `apply*`, por lo que son intercambiables en resultado. Los instaladores individuales NO SHALL modificarse como parte de este cambio.

#### Scenario: Resultado equivalente al encadenamiento de instaladores individuales

- **GIVEN** `settings.json` en estado limpio
- **WHEN** el usuario ejecuta `npm run setup`
- **THEN** el objeto settings resultante SHALL ser deep-equal (mismas claves y valores) al producido por `applyStatuslineInstall` + `applyNotificationsInstall` + `applyVoiceInstall` aplicados en cadena sobre el mismo settings inicial
- **AND** la comparación SHALL ser semántica (deep equality), no de orden de serialización JSON
