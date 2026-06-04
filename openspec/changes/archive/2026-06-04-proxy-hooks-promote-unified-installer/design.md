# Design: proxy-hooks-promote-unified-installer

## Arquitectura objetivo

```
scripting/
├── setup.ts                        # CLI unificado: única entrada para configurar ~/.claude/settings.json
├── shared/                         # acceso a settings, buildNpxTsxCommand (sin cambios)
└── features/                       # lógica pura, testeable, sin I/O directo
    ├── statusline.ts               # buildStatusLineCommand, applyStatuslineInstall/Uninstall, shouldOverwriteStatusLine
    ├── voice.ts                    # applyVoiceInstall/Uninstall
    └── hooks.ts                    # isScpManagedCommand, classifyKey, mergeHooks, unmergeHooks, validateScpRoot, readCanonicalHooks
```

`scripting/install-notifications.ts`, `scripting/install-statusline.ts`, `scripting/install-voice.ts` y `scripting/setup-hooks.ts` se eliminan.

## Las 5 garantías del patrón seguro (S1-S5)

El orquestador `scripting/setup.ts` cumple las 5 garantías para todas las features, no solo para hooks:

| # | Garantía | Implementación |
|---|---|---|
| S1 | Validar archivos del repo antes de tocar `settings.json` | Al inicio, por cada feature activa, se validan los archivos necesarios. `validateProxyRoot` (statusline), `validateScpRoot` (hooks). Voice no requiere validación. |
| S2 | Backup timestamped antes de la primera escritura | Una sola vez al inicio de la fase de escritura, en el orquestador. Cubre las 3 features. |
| S3 | Una sola lectura y una sola escritura de `settings.json` | `readClaudeSettings()` al inicio, transformaciones en memoria, `writeClaudeSettings(next)` al final. |
| S4 | Preservación de configuración ajena del usuario | Install: cada feature respeta ajeno; el merge selectivo de hooks clasifica `scp-only / user-only / mixed` y rechaza solo con `--force`. Uninstall: cada feature solo borra lo que es suyo; `--force` permite borrar ajeno. |
| S5 | Detección Windows-safe y quoting multiplataforma | `buildNpxTsxCommand` de `scripting/shared/`, normalización de backslashes en `isScpManagedCommand` y `isSmartCodeStatusLine`. |

## Flujo del orquestador

```
1. Parsear flags: --install | --uninstall (mutuamente excluyentes, default --install)
                 --statusline --voice --hooks (sin flag = las 3)
                 --voice-mode --dry-run --force --root

2. Validar exclusividad: --install y --uninstall no pueden ir juntos. Abortar exit 1 si pasa.

3. S1: Validar archivos del repo por cada feature activa.
   - statusline: validateProxyRoot(root) → scripting/router-status.ts + routing/providers/
   - voice: sin validación
   - hooks: validateScpRoot(root) → configs/hooks.json + scripting/post-hook-event.ts + scripting/stop-hook-ux.ts + src/2-services/notifications/cli.ts

4. S3: settings = readClaudeSettings() (una sola vez)

5. Aplicar transformaciones en cadena sobre `settings`:
   - INSTALL: applyStatuslineInstall → applyVoiceInstall → mergeHooks (clasificación S4)
   - UNINSTALL: applyStatuslineUninstall(force) → applyVoiceUninstall → unmergeHooks

6. --dry-run: imprimir diff y retornar 0. NO escribir en disco.

7. S2: backup = backupSettings(settings) (una sola vez)

8. S3: writeClaudeSettings(next) (una sola vez)

9. Log: "Instalado: statusline, voz, hooks." o "Desinstalado: ..."
```

## Cambios en `applyStatuslineUninstall`

**Antes** (firma antigua):
```typescript
export function applyStatuslineUninstall(settings: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  delete next.statusLine;  // borra sin verificar
  if (next.env) {
    delete next.env[SMART_CODE_PROXY_ROOT_KEY];
    if (Object.keys(next.env).length === 0) delete next.env;
  }
  return next;
}
```

**Después** (firma nueva con preservación de ajeno):
```typescript
export function applyStatuslineUninstall(
  settings: ClaudeSettings,
  force: boolean,
): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const existing = next.statusLine?.command;
  if (existing && !isSmartCodeStatusLine(existing) && !force) {
    // Preservar ajeno: no tocar statusLine ni SMART_CODE_PROXY_ROOT
    return next;
  }
  delete next.statusLine;
  if (next.env) {
    delete next.env[SMART_CODE_PROXY_ROOT_KEY];
    if (Object.keys(next.env).length === 0) delete next.env;
  }
  return next;
}
```

Esto es **consistente con `unmergeHooks`** (preserva ajeno, `--force` borra) y **corrige la brecha de seguridad** detectada en la auditoría.

## Cambios en `applyStatuslineInstall`

Sin cambios de firma. La función ya recibe `force` y respeta ajeno sin `--force`. Compatible con el patrón S4.

## Cambios en `applyVoiceInstall` / `applyVoiceUninstall`

Sin cambios. Voice solo toca `voiceEnabled` y `voice`; no afecta otras claves.

## Cambios en `runSetupHooks` (de `scripting/setup-hooks.ts`)

`runSetupHooks` **se elimina como entry point**. La lógica pura (`mergeHooks`, `unmergeHooks`, `validateScpRoot`, `readCanonicalHooks`, `isScpManagedCommand`, `classifyKey`) se mueve a `scripting/features/hooks.ts`. El orquestador `setup.ts` la invoca directamente para la feature `--hooks`.

## npm scripts

**Antes**:
```jsonc
{
  "install:statusline": "tsx scripting/install-statusline.ts",
  "install:notifications": "tsx scripting/install-notifications.ts",
  "setup": "tsx scripting/setup.ts",
  "setup:hooks": "tsx scripting/setup-hooks.ts"
}
```

**Después**:
```jsonc
{
  "setup": "tsx scripting/setup.ts",                // default install
  "setup:install": "tsx scripting/setup.ts --install",
  "setup:uninstall": "tsx scripting/setup.ts --uninstall"
}
```

Sin aliases. `setup:hooks` se elimina.

## Comportamiento de los flags

| Flags | Resultado |
|---|---|
| `npm run setup` | Install de las 3 features (statusline, voz, hooks) |
| `npm run setup:install` | Idem (explícito) |
| `npm run setup:uninstall` | Uninstall de las 3 features |
| `setup -- --statusline` | Install solo statusline |
| `setup -- --hooks` | Install solo hooks |
| `setup -- --voice` | Install solo voice |
| `setup -- --statusline --voice` | Install de statusline y voice |
| `setup -- --uninstall --hooks` | Uninstall solo hooks |
| `setup -- --dry-run` | Previsualiza install de todo |
| `setup -- --force` | Install sobrescribiendo ajeno |
| `setup -- --root <path>` | Cambia la raíz del repo |
| `setup -- --install --uninstall` | **Error**: mutuamente excluyentes |

## Tests

- `tests/scripting/features/statusline.test.ts`: cobertura de las funciones puras, incluyendo la nueva política de uninstall.
- `tests/scripting/features/voice.test.ts`: cobertura de install/uninstall.
- `tests/scripting/features/hooks.test.ts`: cobertura de merge/unmerge/classify/validate.
- `tests/scripting/setup.test.ts`: cobertura del orquestador (S1-S5 + combinaciones de flags).
- Eliminar: `tests/scripting/install-*.test.ts` y `tests/scripting/setup-hooks.test.ts`.

## Compatibilidad hacia atrás

- `npm run setup` se mantiene como alias implícito de install de todo. Quien lo use hoy sigue funcionando.
- `npm run setup -- --uninstall` se mantiene.
- `npm run setup -- --hooks` se mantiene.
- **Roto intencionalmente**: `npm run install:statusline`, `npm run install:notifications`, `npm run setup:hooks`. Sin aliases (estrategia de corte).
