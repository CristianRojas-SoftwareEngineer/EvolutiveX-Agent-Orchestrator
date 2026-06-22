## Context

El instalador universal (`scripting/setup.ts`) es el único punto de escritura en
`~/.claude/settings.json`. Introduce tres defectos de normalización de rutas que, en
Windows, producen comandos con backslashes y un hook `Stop` que falla fuera del repo SCP:

1. **P1 — `${CLAUDE_PROJECT_DIR}` en el hook `Stop`**: variable que Claude Code expande
   al directorio del proyecto activo en runtime. En instalación global apunta a proyectos
   ajenos donde `stop-hook-ux.ts` no existe.
2. **P2 — Comandos de hooks con backslashes**: `setup.ts` pasa `resolve(options.root)` a
   `readCanonicalHooks`, que sustituye literalmente `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` con la
   ruta Windows → `C:\Users\...` en los 14 comandos.
3. **P3 — `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` con backslashes (statusline)**: `statusline.ts`
   usa `resolve(proxyRoot)` para escribir la env var, no la utilidad POSIX ya existente.

La garantía S5 del instalador universal (`buildNpxTsxCommand` → POSIX) cubre el comando
del statusline pero no las otras dos rutas escritas.

## Goals / Non-Goals

**Goals:**
- El hook `Stop` en `settings.json` apunta a SCP con ruta POSIX resuelta en install-time.
- `scripting/stop-hook-ux.ts` deriva la raíz de SCP de su propia ubicación; el archivo
  `.last-continuity-message.txt` siempre se escribe en `<SCP>/sessions/`.
- Todos los valores de ruta escritos en `settings.json` (hook commands, statusLine,
  `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`) usan forward slashes en todas las plataformas.
- Sin utilidades nuevas: reutilizar `resolvePosixAbsolutePath` ya presente en
  `scripting/shared/npx-tsx-command.ts`.

**Non-Goals:**
- No se cambia el protocolo de comunicación con el proxy ni ninguna ruta bajo `src/`.
- No se migra automáticamente el `settings.json` de usuarios con instalación previa.
- No se añade soporte para Cursor u otros harnesses.

## Decisions

### D1: Reemplazar `${CLAUDE_PROJECT_DIR}` por `${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}` en `configs/hooks.json`

**Decisión**: cambiar los dos usos de `${CLAUDE_PROJECT_DIR}` en el bloque `Stop` por
`${EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT}`, que el instalador ya sustituye por ruta POSIX literal.

**Alternativa descartada**: dejar `${CLAUDE_PROJECT_DIR}` y añadir lógica en el
instalador para resolverlo. Requeriría que el instalador conozca la semántica de todas
las variables de runtime de Claude Code → acoplamiento innecesario.

**Rationale**: el script `stop-hook-ux.ts` vive en el repo SCP, no en el proyecto del
usuario. Su comando de invocación debe apuntar a SCP siempre. Usar el mismo placeholder
que el resto de hooks es la solución más simple y coherente.

---

### D2: Derivar la raíz de SCP de `import.meta.url` en `stop-hook-ux.ts`

**Decisión**: en lugar de leer `process.env.CLAUDE_PROJECT_DIR`, calcular:
```ts
const scpRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
```
`scripting/stop-hook-ux.ts` está en `<SCP>/scripting/`, un nivel por debajo de la raíz.

**Alternativa descartada**: leer `process.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` (la env var que el
instalador escribe). Requiere que el instalador ya se haya ejecutado y que Claude Code
propague esa env var al subproceso del hook. Más frágil y crea una dependencia circular
entre runtime y bootstrap.

**Rationale**: `import.meta.url` es una fuente de verdad auto-contenida e independiente
de Claude Code, del shell y de cualquier env var. Cero dependencias externas.

---

### D3: Normalizar `proxyRoot` en `setup.ts` antes de propagarlo a features

**Decisión**: en `setup.ts:48`, cambiar `resolve(options.root)` por
`resolvePosixAbsolutePath(options.root)`. Un único punto de normalización hace que
`mergeHooks`, `readCanonicalHooks` y `applyStatuslineInstall` reciban siempre POSIX.

**Alternativa descartada**: normalizar en cada función de feature por separado.
Duplicación defensiva; cada llamadora debería recordar hacerlo.

**Rationale**: `proxyRoot` se construye una sola vez en el orquestador. Normalizarlo ahí
evita que ninguna feature escriba rutas con backslashes, sin tocar la API de las funciones
puras de features.

---

### D4: `env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` en `statusline.ts`

**Decisión**: cambiar `const root = resolve(proxyRoot)` por
`const root = resolvePosixAbsolutePath(proxyRoot)`. Si D3 ya garantiza que `proxyRoot`
llega normalizado, este cambio es redundante-pero-defensivo y hace la función pura
auto-consistente independientemente de su llamador.

**Rationale**: `applyStatuslineInstall` se exporta y puede ser llamada directamente por
tests u otros orquestadores futuros con `proxyRoot` no normalizado. Defensivo y de costo
mínimo.

## Risks / Trade-offs

- **Usuarios con instalación previa**: el hook `Stop` existente en su `settings.json`
  sigue usando `${CLAUDE_PROJECT_DIR}` hasta que re-ejecuten `npm run setup:install`.
  No es urgente: el hook falla silenciosamente (exit 0 por el catch en stop-hook-ux).
  Mitigación: documentar en `docs/notifications.md` que hay que reinstalar.

- **`.last-continuity-message.txt` siempre en SCP**: consumidores que leían desde el
  proyecto activo (p. ej. una futura feature TTS) necesitarán ajustar su ruta.
  Mitigación: la spec actualizada define claramente la nueva ubicación.

- **`resolve()` tolera forward slashes en Windows**: `resolveProjectRoot` en
  `router-status.ts` ya hace `resolve(fromSettings)`, que normaliza ambos estilos. El
  cambio a POSIX no rompe la lectura; solo añade consistencia.
