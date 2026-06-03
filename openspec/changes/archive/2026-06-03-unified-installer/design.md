## Context

El proyecto tiene dos instaladores independientes (`install-statusline.ts`, `install-notifications.ts`) que comparten la misma infraestructura (`readClaudeSettings`, `writeClaudeSettings`, funciones `apply*` exportadas y componibles). La voz de Claude Code no tiene instalador y requiere edición manual de `~/.claude/settings.json`.

El instalador unificado (`setup.ts`) orquesta las tres características con una interfaz de flags coherente, reutilizando las funciones `apply*` existentes sin modificarlas.

## Goals / Non-Goals

**Goals:**
- Un único comando (`npm run setup`) para instalar o desinstalar statusline, notificaciones y voz
- Selección explícita por feature mediante flags; sin flags → opera sobre todas
- `--uninstall` cambia la dirección; los feature flags cambian el alcance
- Una sola lectura y escritura de `~/.claude/settings.json` por ejecución
- Soporte a `--dry-run`, `--force`, `--root` consistente con los instaladores individuales
- Función `applyVoiceInstall` / `applyVoiceUninstall` exportable y testeable de forma aislada

**Non-Goals:**
- Reemplazar los instaladores individuales (`install:statusline`, `install:notifications`)
- Configuración interactiva (eso es responsabilidad de `configure-provider`)
- Instalar dependencias npm ni compilar el proyecto

## Decisions

### 1. Modelo de flags: selección explícita + modificador de dirección

Feature flags (`--statusline`, `--notifications`, `--voice`) siempre significan "incluir esta feature en la operación actual". Sin feature flags, la operación aplica sobre las tres. El flag `--uninstall` cambia el modo de install a uninstall.

```
npm run setup                                   → instala statusline + notifications + voice
npm run setup -- --voice                        → instala solo voice
npm run setup -- --uninstall                    → desinstala statusline + notifications + voice
npm run setup -- --uninstall --voice            → desinstala solo voice
npm run setup -- --uninstall --statusline       → desinstala solo statusline
npm run setup -- --notifications --dry-run      → muestra qué instalaría en notifications
```

**Alternativa descartada:** `--no-feature` para excluir del default. Descartada porque al combinarse con `--uninstall` resulta ambigua: `--uninstall --no-voice` significa "no desinstales voice", lo cual usa la negación de una negación implícita.

### 2. `applyVoice*` en archivo propio (`scripting/install-voice.ts`)

Se crea `scripting/install-voice.ts` exportando `applyVoiceInstall` y `applyVoiceUninstall`, siguiendo el mismo patrón que los instaladores existentes. Esto lo hace testeable de forma aislada (igual que `install-statusline` e `install-notifications`).

**Alternativa descartada:** inline en `setup.ts`. Descartada porque rompe la simetría del patrón y dificulta tests unitarios de la lógica de voz.

### 3. Nombre del script: `setup`

Se usa `setup` en `package.json` porque describe el propósito (configuración de entorno de primera vez) mejor que `install:all`. `npm run install` está reservado por npm y no puede usarse como script name.

**Alternativa considerada:** `install:all` (coherente con el prefijo `install:*`). Válida, pero `setup` es más autodescriptivo para onboarding.

### 4. Composición de `apply*` con una sola lectura/escritura

```
readClaudeSettings()          ← una sola vez
  → applyStatuslineInstall/Uninstall()   si --statusline (o default)
  → applyNotificationsInstall/Uninstall() si --notifications (o default)
  → applyVoiceInstall/Uninstall()        si --voice (o default)
writeClaudeSettings(result)   ← una sola vez
```

Las funciones `apply*` ya tienen firma `(settings, ...) → settings | { error }`, lo que las hace directamente componibles. No se modifican.

### 5. Validación por feature

Solo se validan las features seleccionadas para install. Uninstall no requiere validación de archivos.

| Feature       | Validación en install                          |
|---------------|------------------------------------------------|
| statusline    | `validateProxyRoot()` (verifica router-status.ts) |
| notifications | `validateProxyRootForNotifications()` (verifica cli.ts) |
| voice         | ninguna (solo escribe claves en settings.json) |

### 6. Flags de voz

```
--voice-mode hold|tap        (default: hold)
--no-voice-auto-submit       deshabilita autoSubmit (default: true)
```

`autoSubmit` solo es relevante en modo `hold`. En modo `tap` se ignora (el submit es el segundo toque). El instalador lo escribe en `settings.json` de todas formas para que el valor persista si el usuario cambia de modo posteriormente.

Claves escritas en `~/.claude/settings.json`:
```json
{
  "voiceEnabled": true,
  "voice": {
    "enabled": true,
    "mode": "hold",
    "autoSubmit": true
  }
}
```

En uninstall, se eliminan `voiceEnabled` y `voice` del objeto settings.

## Risks / Trade-offs

- **Settings de voz sin validación externa** → Si Claude Code cambia el schema de `voice.*`, el instalador escribirá claves inválidas sin error. Mitigación: las claves son simples strings/booleans; el riesgo es bajo y detectable visualmente con `--dry-run`.
- **`npm run setup` sin flags instala todo** → Un usuario que solo quiere instalar voz y olvida los flags instalará también statusline y notificaciones. Mitigación: el output del comando lista claramente qué se instaló; `--dry-run` permite verificar antes de aplicar.
- **Los instaladores individuales siguen existiendo** → Dos formas de hacer lo mismo. Trade-off aceptado: los individuales son más precisos para re-instalación post-reubicación del repo; `setup` es para onboarding y operaciones combinadas.

## Open Questions

_(ninguna — diseño acordado en exploración previa)_
