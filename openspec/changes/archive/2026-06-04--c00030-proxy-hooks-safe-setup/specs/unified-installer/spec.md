# Delta: unified-installer (proxy-hooks-safe-setup)

## ADDED Requirements

### Requirement: `--hooks` como fourth feature flag en setup

El script `setup` SHALL admitir `--hooks` como feature flag adicional junto a `--statusline`, `--notifications` y `--voice`. Cuando `--hooks` está presente, SHALL invocar el script `setup-hooks.ts` que gestiona la instalación de las 14 entradas de hooks en `~/.claude/settings.json` con merge selectivo.

El flag `--hooks` opera igual que los demás flags de feature:
- Sin `--hooks` ni otros flags → opera sobre las 4 features (statusline, notifications, voice, hooks)
- Con `--hooks` únicamente → opera solo sobre hooks
- Con `--hooks` combinado con otros flags → opera solo sobre los seleccionados

Los flags `--dry-run`, `--force`, `--uninstall` y `--root` SHAL propagarse a `setup-hooks.ts`.

#### Scenario: setup --hooks sin otros flags opera solo sobre hooks

- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el script SHALL invocar únicamente `setup-hooks.ts` con los flags por defecto
- **AND** statusline, notifications y voice NO SHALL modificarse

#### Scenario: setup sin flags opera sobre las 4 features

- **WHEN** el usuario ejecuta `npm run setup` sin flags de feature
- **THEN** el script SHALL invocar statusline, notifications, voice y hooks

#### Scenario: setup --hooks --uninstall desinstala solo hooks

- **WHEN** el usuario ejecuta `npm run setup -- --hooks --uninstall`
- **THEN** `setup-hooks.ts` SHALL ejecutar uninstall selectivo (solo comandos SCP)
- **AND** statusline, notifications y voice SHALL permanecer sin cambios

#### Scenario: setup --hooks --dry-run previsualiza sin escribir

- **WHEN** el usuario ejecuta `npm run setup -- --hooks --dry-run`
- **THEN** `setup-hooks.ts` SHALL mostrar diff de cambios sin escribir en disco

---

### Requirement: Validación de archivos SCP antes de invocar setup-hooks.ts

Antes de invocar `setup-hooks.ts`, el script `setup` SHALL validar que los siguientes archivos existan en el repo SCP (indicado por `--root` o `SMART_CODE_PROXY_ROOT`):

- `configs/hooks.json` — plantilla canónica
- `scripting/post-hook-event.ts` — gateway hook relay
- `scripting/stop-hook-ux.ts` — stop hook unificado
- `src/2-services/notifications/cli.ts` — CLI de notificaciones

Si alguna validación falla, el script SHALL terminar con código de salida 1 y un mensaje de error claro indicando cuál archivo falta. `settings.json` NO SHALL modificarse en caso de fallo.

#### Scenario: Validación falla si falta configs/hooks.json

- **GIVEN** la raíz del proxy no contiene `configs/hooks.json`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** el script SHALL terminar con exit code 1
- **AND** SHALL mostrar mensaje: "No se encontró configs/hooks.json en la raíz del proxy"

#### Scenario: Validación pasa si todos los archivos existen

- **GIVEN** existen `configs/hooks.json`, `scripting/post-hook-event.ts`, `scripting/stop-hook-ux.ts` y `src/2-services/notifications/cli.ts`
- **WHEN** el usuario ejecuta `npm run setup -- --hooks`
- **THEN** la validación SHALL pasar
- **AND** `setup-hooks.ts` SHALL invocarse normalmente

---

### Requirement: Coexistencia de --hooks con --statusline, --notifications, --voice

El flag `--hooks` SHALL coexistir con los flags de feature existentes sin conflicto. La selección de features funciona igual que antes: flags presentes = features seleccionadas; ningún flag = todas las 4 features.

#### Scenario: setup --hooks --statusline opera solo sobre esas dos features

- **WHEN** el usuario ejecuta `npm run setup -- --hooks --statusline`
- **THEN** el script SHALL invocar `setup-hooks.ts` y `applyStatuslineInstall`
- **AND** notifications y voice NO SHALL modificarse

#### Scenario: setup --hooks --force se propaga a setup-hooks.ts

- **GIVEN** `~/.claude/settings.json` tiene hooks ajenos en algunas claves
- **WHEN** el usuario ejecuta `npm run setup -- --hooks --force`
- **THEN** `setup-hooks.ts` SHALL recibir `--force`
- **AND** SHALL reemplazar hooks ajenos tras crear backup