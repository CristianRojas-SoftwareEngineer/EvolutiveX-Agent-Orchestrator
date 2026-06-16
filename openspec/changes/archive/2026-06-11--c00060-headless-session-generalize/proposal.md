## Why

El mecanismo de ejecución aislada (proxy de test en puerto dedicado + `claude -p` con env injection) está enterrado dentro de `scripting/headless-tts-gateway-test/` bajo un nombre TTS-específico. Los cuatro módulos genéricos (`proxy-lifecycle`, `run-claude-headless`, `provider-env`, `env-utils`) no tienen una API de primera clase, lo que impide reutilizarlos para casos de uso legítimos: agentes CI, tests de routing, smoke tests de hooks y sesiones multi-provider en paralelo.

## What Changes

- **Nuevo módulo `scripting/headless-session/`** con una función de alto nivel `runHeadlessSession(opts)` que encapsula el ciclo completo: arrancar proxy aislado → ejecutar `claude -p` → esperar resultado → detener proxy.
- **Mover los cuatro módulos genéricos** de `scripting/headless-tts-gateway-test/` al nuevo directorio, renombrando `run-claude-headless.ts` → `run-claude.ts` para consistencia.
- **Actualizar imports** en `scripting/headless-tts-gateway-test/` y `scripting/headless-tts-gateway-test.ts` para apuntar al nuevo módulo.
- **Reestructurar la skill `headless-cli-testing`**: el `SKILL.md` documenta el mecanismo genérico; todo el contenido TTS-específico se mueve a `references/tts-testing.md`.

## No objetivos

- No se cambia la lógica TTS ni sus módulos específicos (`log-analyzer`, `wait-for-tts`, `fallback-speech`, etc.).
- No se crea un nuevo comando `npm run` para la API genérica (la interfaz es programática, no CLI).
- No se modifican specs de comportamiento del proxy ni del gateway.

## Capabilities

### New Capabilities

- `headless-session`: API programática para lanzar una sesión aislada Smart Code Proxy + Claude Code de forma no interactiva, sin mutar configuración global.

### Modified Capabilities

<!-- No hay cambios a nivel de requisitos de specs existentes; este cambio es de scripting e infraestructura de testing. -->

## Impact

- `scripting/headless-session/` — directorio nuevo con 5 archivos (`index.ts` + 4 módulos movidos)
- `scripting/headless-tts-gateway-test/` — actualización de imports (sin cambios de lógica)
- `scripting/headless-tts-gateway-test.ts` — actualización de imports
- `.claude/skills/headless-cli-testing/SKILL.md` — reestructuración completa
- `.claude/skills/headless-cli-testing/references/tts-testing.md` — archivo nuevo con contenido TTS extraído
- Capas PKA afectadas: ninguna (`scripting/` vive fuera del dominio del proxy)
