# Proposal: proxy-hooks-promote-unified-installer

## Contexto

El commit `66cc38e` (proxy-hooks-safe-setup) estableció un patrón seguro de modificación de `~/.claude/settings.json` para los 14 hooks de SCP: validación previa, backup timestamped, lectura/escritura única, merge selectivo que preserva configuración ajena, y soporte multiplataforma. Este patrón vive en `scripting/setup-hooks.ts`.

El orquestador `scripting/setup.ts` actual orquesta statusline, notifications, voice y hooks, pero **no aplica el patrón seguro de forma uniforme**:

- **S1 — Validación**: statusline y notifications se validan por separado; voice no se valida; hooks duplican su validación.
- **S2 — Backup**: `setup-hooks.ts` crea backup, pero `setup.ts` no. Statusline y voice nunca crean backup.
- **S3 — Lectura/escritura única**: `setup.ts` puede escribir dos veces en uninstall (una para hooks vía `runSetupHooks`, otra para las otras features).
- **S4 — Preservación de ajeno**: `applyStatuslineUninstall` borra `statusLine` sin verificar si es ajeno; `applyNotificationsInstall` rechaza ajeno con error en vez de preservar.
- **S5 — Multiplataforma**: ya está cubierto por `buildNpxTsxCommand` en las 3 features; el orquestador lo usa de forma desigual.

Esto es **inconsistente con el patrón seguro de 66cc38e** y deja al usuario expuesto a pérdida de configuración propia al desinstalar statusline con statusLine ajeno previo.

## Cambio

Promover la lógica de modificación segura de `setup-hooks.ts` a un **orquestador universal** `scripting/setup.ts` que aplique el patrón seguro a las 3 features de forma uniforme. Las features (statusline, voice, hooks) y la dirección (install/uninstall) son flags del mismo nivel, componibles entre sí.

### Resultado esperado

- `scripting/setup.ts` es el **único entry point** para configurar `~/.claude/settings.json`.
- Las 3 features (`--statusline`, `--voice`, `--hooks`) tienen **el mismo trato**: validación, backup, merge selectivo que preserva ajeno, uninstall simétrico.
- Las notificaciones de SCP se instalan **dentro de la feature `--hooks`** (junto con gateway y stop UX). El flag `--notifications` desaparece porque las notificaciones no se pueden instalar por separado: comparten entradas en `settings.json` con el gateway.
- npm scripts canónicos: `setup:install` y `setup:uninstall` (parametrizan el script con `--install` y `--uninstall`). `setup` se mantiene como retro-compat.
- Eliminación de los instaladores legacy: `install-statusline`, `install-notifications`, `setup-hooks`. No se mantienen aliases.

## No-objetivos

- No se introduce un sistema de plugins ni subcomandos dinámicos.
- No se cambia el formato de `configs/hooks.json`.
- No se mueve `scripting/shared/`.
- No se cambia el comportamiento de `configure-provider` ni de `statusline-router-details`.

## Decisiones de diseño clave

1. **Un solo entry point**: `scripting/setup.ts`. Los scripts `install-*.ts` y `setup-hooks.ts` se eliminan sin aliases.
2. **Lógica pura en `scripting/features/*.ts`**: las funciones `apply*` se mueven a `scripting/features/{statusline,voice,hooks}.ts` para que el orquestador las componga sin lógica de I/O mezclada.
3. **Flags de dirección explícitos**: `--install` y `--uninstall` son mutuamente excluyentes. El default es `--install` para mantener retro-compat.
4. **Patrón seguro S1-S5 promovido**: el orquestador cumple las 5 garantías para todas las features, no solo hooks.
5. **Backup único**: una sola vez al inicio de la escritura, en el orquestador. Cubre todas las features en bloque.
6. **Política de uninstall de statusline preserva ajeno**: usa `isSmartCodeStatusLine` y solo borra si es de SCP o con `--force`.

## Riesgos

- **Ruptura de invocaciones externas** que usan `install:statusline` o `install:notifications`. Mitigación: estrategia de corte solicitada explícitamente; no se mantienen aliases.
- **Cambio de firma de `applyStatuslineUninstall`** (añade `force`). Mitigación: tests actualizados en la misma fase.
- **Sincronización de spec** requiere editar `openspec/specs/unified-installer/spec.md` con los deltas.
