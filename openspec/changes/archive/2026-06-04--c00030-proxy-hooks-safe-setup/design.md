# Design: proxy-hooks-safe-setup

## Context

El proyecto tiene un drift en `.claude/settings.json` del repo: la configuración de hooks está incompleta respecto al contrato de `hooks-lifecycle-correlation` (14 entradas). Además, no existe un mecanismo automatizado para instalar los hooks en `~/.claude/settings.json` (user-level) de forma que todos los proyectos del usuario hereden los hooks de SCP sin copia manual.

El instalador existente `install-notifications.ts` solo cubre 11 entradas de notificación y escribe directamente sin merge selectivo. La visión de producto requiere:
1. Instalación en user-level (`~/.claude/settings.json`), no project-level.
2. Merge selectivo que preserve hooks ajenos a SCP.
3. Plantilla canónica versionada en el repo (`configs/hooks.json`).
4. Flags familiares: `--dry-run`, `--uninstall`, `--force`.

## Goals / Non-Goals

**Goals:**
- Instalar las 14 entradas de hooks de SCP en `~/.claude/settings.json` con merge selectivo seguro.
- Nunca borrar ni reemplazar configs del usuario ajenas a SCP.
- Backup automático antes de escribir.
- `--dry-run` para previsualizar sin escribir.
- `--uninstall` selectivo (solo comandos SCP, preserva ajenos).
- `--force` para sobreescribir hooks ajenos con confirmación de backup.
- Plantilla canónica versionada en `configs/hooks.json`.

**Non-Goals:**
- No modificar `.claude/settings.json` del proyecto (project-level sigue siendo manual si el usuario lo quiere).
- No orquestar hooks de otros plugins ni integrar con ellos.
- No soportar symlinks (solo generator + merge).
- No automatizar re-enlace si el repo SCP se mueve (usuario ejecuta `setup --hooks` otra vez).

## Decisions

### 1. Ubicación del archivo de hooks: `configs/hooks.json`

**Decisión:** El archivo de plantilla se llama `configs/hooks.json` y vive en el repo SCP.

**Alternativas consideradas:**
- `scripting/hooks.json` → ubicaría la plantilla junto al código, pero no deja claro que es un asset de distribución, no lógica.
- `.claude/hooks.json` → no se versiona (`.claude/` está en `.gitignore`).
- `hooks/distribution.json` → más largo, sin beneficio.

**Justificación:** `configs/` es el directorio para archivos de configuración assets (ya existe `configs/.env.example`, `configs/tsconfig.json`). `hooks.json` es suficientemente descriptivo sin "canonical" ni "team".

---

### 2. Detección de comandos "de SCP"

**Decisión:** Un comando se considera "de SCP" si su path contiene alguna de estas strings (normalizadas con `/`):

```
post-hook-event.ts
stop-hook-ux.ts
notifications/cli.ts
<EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT resolved>  (e.g. C:/Proyectos/Smart-Code-Proxy)
```

**Alternativas consideradas:**
- Prefijo fija en cada comando (p. ej. `[SCP]` al inicio) → requiere cambiar todos los comandos existentes y no es backwards compatible.
- Registro en el settings.json con clave `__scp_managed: true` → intrusivo, requiere escribir metadata en la config del usuario.
- Hash de la ruta del repo → frágil si el repo se mueve.

**Justificación:** Las tres strings son únicas de SCP y cubren los tres puntos de entrada (`post-hook-event` para gateway, `stop-hook-ux` para Stop, `cli.ts` para notificaciones). La ruta resolved de `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` cubre el caso en que el usuario tiea un path hardcodeado pointing al repo SCP. Si el repo se mueve, el usuario ejecuta `setup --hooks` de nuevo (re-resolución automática).

---

### 3. Merge selectivo: estrategia para cada clave

**Decisión:** Para cada una de las 14 claves en `configs/hooks.json`:

```
1. Leer ~/.claude/settings.json → settings.hooks
2. Si la clave NO existe en settings.hooks:
     → crear entrada con la versión canónica de SCP
3. Si la clave existe:
     a. Clasificar comandos existentes:
        - "SCP-managed" (contiene alguno de los 4 marcadores)
        - "user-managed" (no contiene ninguno)
     b. Si TODOS son SCP-managed:
        → reemplazar con versión canónica de SCP
     c. Si TODOS son user-managed:
        → preservar intactos (SCP no toca esta clave)
     d. Si MIXTO (algunos SCP, algunos ajenos):
        → preservar los user-managed
        → agregar los comandos SCP faltantes
        (los comandos SCP de la plantilla se agregan al array)
```

**Alternativas consideradas:**
- Reemplazo total de claves mixtas → destruiría hooks ajenos.
- Ignorar claves mixtas (no agregar ni quitar) → el usuario no recibe los hooks de SCP.

**Justificación:** La opción c (preservar + agregar) es el middle ground: el usuario recibe los hooks de SCP sin perder los ajenos. Es la política "brownfield" estándar.

---

### 4. Uninstall selectivo

**Decisión:** Uninstall elimina solo los comandos de SCP de cada clave:

```
1. Para cada clave managed by SCP (las 14):
     a. Si la entrada tiene SOLO comandos SCP → eliminar la entrada completa
     b. Si la entrada tiene MIXTO → eliminar solo los comandos SCP,
        preservar los user-managed
2. Si después de eliminar comandos SCP la entrada queda vacía → eliminar la entrada
3. Las claves que el usuario tenga y NO están en las 14 de SCP → se preservan intactas
```

**Justificación:** Uninstall refleja install: así como install nunca destruye configs ajenas, uninstall nunca deja la entrada en estado inválido. Si el usuario tiene una clave con mix, después del uninstall le quedan sus comandos ajenos.

---

### 5. Backup automático

**Decisión:** Antes de cualquier escritura a `~/.claude/settings.json`:

```
backupPath = ~/.claude/settings-backup-<YYYY-MM-DD>T<HH-MM-SS>.json
writeFileSync(backupPath, JSON.stringify(settings, null, 2))
```

**Alternativas consideradas:**
- Backup solo con `--force` → si algo falla sin `--force`, no hay recuperación.
- Backup overwrite → si el usuario ejecuta varias veces, cada ejecución pisa el backup anterior.

**Justificación:** Backup en cada escritura es la política más segura. El nombre con timestamp garantiza que múltiples ejecuciones no se pisan entre sí. El directorio `~/.claude/` ya existe si el usuario tiene Claude Code instalado.

---

### 6. Integración con `setup.ts`

**Decisión:** `setup.ts` se refactoriza para integrar `--hooks` como fourth feature flag.

```
Flags existentes: --statusline, --notifications, --voice, --uninstall, --dry-run, --force, --root
Nuevo flag:        --hooks

Lógica:
  anyFeature = statusline || notifications || voice || hooks
  doStatusline  = anyFeature ? statusline  : true   (default all)
  doNotifications = anyFeature ? notifications : true
  doVoice = anyFeature ? voice : true
  doHooks = hooks                           (explicit only, no default)

  if doHooks:
    validate SCP files (configs/hooks.json, post-hook-event, stop-hook-ux, cli.ts)
    if validation fails: exit 1 (no write)
    invoke setupHooks(options)
```

**Alternativas consideradas:**
- Script separado `setup-hooks.ts` invoked directamente → duplica la lógica de setup.ts (flags, validación, root resolution).
- Mantener `install-notifications.ts` y agregar `install-hooks.ts` paralelo → más scripts, misma lógica duplicada.

**Justificación:** Refactorizar `setup.ts` para añadir `--hooks` es coherente con el diseño existente: un solo entry point para las 4 features, validación centralizada, root resolution compartida.

---

### 7. Resolución de `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` en la plantilla

**Decisión:** La plantilla `configs/hooks.json` usa `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` como placeholder. `setup-hooks.ts` resuelve este placeholder buscando la variable de entorno `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` en `settings.env` del settings.json, o usando `--root` pasado a `setup.ts`.

```
Resolver EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT:
  1. Si process.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT existe → usar esa
  2. Si settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT existe → usar esa
  3. Si --root fue pasado → usar resolve(--root)
  4. Si no hay nada → error con mensaje "No se encontró EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT"

Reemplazar en cada comando de la plantilla:
  command.replace('${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}', resolvedRoot)
```

**Justificación:** `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` ya existe como convención (definido en `claude-settings.ts`). Resolverlo desde settings.env permite que el install funcione aunque el usuario no tenga la variable de entorno exportada en su shell.

---

## Risks / Trade-offs

**[Risk] Repo SCP movido después de install**
→ Mitigation: cada ejecución de `setup --hooks` re-resuelve `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` desde `--root` o `settings.env`. Los paths se actualizan automáticamente. El usuario debe re-ejecutar `setup --hooks` tras mover el repo.

**[Risk] Windows con unidad diferente (`C:` vs `D:`)**
→ Mitigation: `buildNpxTsxCommand` ya maneja paths con comillas y normalización `/`. El generator mode (en lugar de symlink) evita problemas de cross-unit symlinks.

**[Risk] Hooks de otra versión de SCP instalada**
→ Mitigation: el detector "SCP-managed" usa strings únicas (`post-hook-event`, `stop-hook-ux`, `notifications/cli.ts`). Si el usuario tiene otra instalación de SCP en otra carpeta, ambos都会被 detectan como SCP-managed (comportamiento correcto: se actualiza a la versión del repo actual).

**[Risk] Usuario ejecuta setup --hooks sin entender que installa hooks globally**
→ Mitigation: `--dry-run` muestra exactamente qué cambiaría. El mensaje final indica cuántas claves se actualizaron y cuántas se preservaron.

---

## Open Questions

Ninguna. Las decisiones fueron tomadas en la sesión de exploración con el usuario.