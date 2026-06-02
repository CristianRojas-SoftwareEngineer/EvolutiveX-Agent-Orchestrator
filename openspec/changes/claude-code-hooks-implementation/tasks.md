<!-- Checklist de GOBERNANZA. Cada tarea tiene criterio de aceptación explícito.
     Para implementación de código, abrir el change de segundo nivel correspondiente. -->

## 1. H1 — Registrar hooks faltantes en `.claude/settings.json`

> Fase entry. Sin dependencias del DAG.

- [x] 1.1 Verificar dependencias del DAG: ninguna (entry)
  - _Criterio: no aplica; puede iniciarse en cualquier momento_
- [x] 1.2 Crear change de segundo nivel `claude-h1-register-missing-hooks` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/claude-code-hooks-implementation/phases/claude-h1-register-missing-hooks/` con `.openspec.yaml` creado_
- [x] 1.3 Verificar back-reference en `proposal.md` del L2
  - _Criterio: línea `> **Orquestador:** \`claude-code-hooks-implementation\` | **Fase:** h1 (H)` presente en las primeras 5 líneas del archivo_
- [x] 1.4 Actualizar estado de H1 a `en curso` en el phase registry del orquestador (`design.md`)
  - _Criterio: columna "Estado" de H1 = `en curso`_
- [x] 1.5 Implementar el L2 (`openspec-apply`) — registrar las 8 entradas del lifecycle en `.claude/settings.json` del proyecto (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`), cada una con al menos un comando invocando `POST /hooks` (resuelto vía `$ANTHROPIC_BASE_URL` o equivalente); los 5 hooks que tenían notificación en user-level (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`) conservan el comando apuntando a `C:\AI\claude-code-notifications.ts`; los matchers de `PreToolUse` y `PostToolUse` se establecen en `*`
  - _Criterio: `.claude/settings.json` contiene las 8 entradas con la estructura JSON correcta_
  - _Criterio: cada entrada tiene al menos un comando `POST /hooks` con la URL resuelta vía variable de entorno_
  - _Criterio: las 5 entradas con doble comando incluyen la ruta a `C:\AI\claude-code-notifications.ts` para el comando de notificación_
  - _Criterio: `PreToolUse` y `PostToolUse` tienen `"matcher": "*"`_
- [x] 1.6 Gate superado: smoke test de sesión + tests E2E del `AuditHookEventHandler` para los 8 eventos
  - _Criterio: durante una sesión de prueba con Claude Code que dispare al menos 1 `SubagentStart`, 1 `SubagentStop`, 1 `PostToolUseFailure`, 1 `PreToolUse` y 1 `PostToolUse`, `server/logs.jsonl` no contiene el warning `[audit] No se encontró workflow padre para continuation`_
  - _Criterio: el handler recibe los 8 eventos del lifecycle cuando se invocan desde Claude Code_
- [x] 1.7 Documentación actualizada: `README.md` §setup, `docs/gateway-architecture.md` §18 (si documenta config de hooks)
  - _Criterio: `README.md` §setup menciona el registro de las 8 entradas del lifecycle en `.claude/settings.json`_
  - _Criterio: si `docs/gateway-architecture.md` §18 documenta config, queda actualizada para reflejar las 8 entradas (no solo las 3 que estaban ausentes)_
- [x] 1.8 Legacy retirado: no aplica (cambio aditivo en `settings.json`; las entradas de user-level quedan sobrescritas por las del proyecto sin eliminación de archivos)
  - _Criterio: ningún archivo retirado o deprecado en esta fase_
- [x] 1.9 Sync de specs si H1 introduce deltas en `hooks-lifecycle-correlation` (`openspec-sync`)
  - _Criterio: ejecutado si la fase añade requirements al contrato de hooks; no ejecutado si no hay delta_
- [x] 1.10 Marcar H1 como `validada` en el phase registry y archivar el L2 (`openspec-archive`)
  - _Criterio: columna "Estado" de H1 = `archivada`_
  - _Criterio: L2 movido a `openspec/changes/archive/<fecha>-claude-code-hooks-implementation/phases/...`_

---

## 2. N1 — Migrar el servicio de notificaciones al repositorio

> Fase entry. Sin dependencias del DAG; puede correr en paralelo con H1.

- [ ] 2.1 Verificar dependencias del DAG: ninguna (entry)
  - _Criterio: no aplica; puede iniciarse en cualquier momento_
- [ ] 2.2 Crear change de segundo nivel `claude-n1-migrate-notifications-service` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/claude-code-hooks-implementation/phases/claude-n1-migrate-notifications-service/` con `.openspec.yaml` creado_
- [ ] 2.3 Verificar back-reference en `proposal.md` del L2
  - _Criterio: línea `> **Orquestador:** \`claude-code-hooks-implementation\` | **Fase:** n1 (N)` presente en las primeras 5 líneas del archivo_
- [ ] 2.4 Actualizar estado de N1 a `en curso` en el phase registry del orquestador
  - _Criterio: columna "Estado" de N1 = `en curso`_
- [ ] 2.5 Implementar el L2 (`openspec-apply`) — crear `src/2-services/notifications/` con la estructura simplificada de v1: `INotificationService.ts` (capa 1), `DesktopNotificationAdapter.ts` (capa 2), `types.ts`, `index.ts`, entry point CLI. **Sin** `config.ts`, **sin** `builders.ts`, **sin** `sound/`, **sin** `windows-toast.ts`, **sin** JSON externo, **sin** registro SnoreToast/AUMID
  - _Criterio: el directorio `src/2-services/notifications/` existe con los 4 archivos acordados + entry point CLI_
  - _Criterio: `package.json` lista `node-notifier` como dependencia (`commander` opcional si el CLI implementa parsing de argv manualmente)_
  - _Criterio: `INotificationService` exporta el contrato con un único método `notify(event)`_
  - _Criterio: `DesktopNotificationAdapter` implementa `INotificationService` y delega en `node-notifier.notify()`_
- [ ] 2.6 Implementar respetando orden PKA: capa 1 → capa 2 → capa 4
  - _Criterio: `INotificationService` no depende de infraestructura (ni `node-notifier`, ni `fs`)_
  - _Criterio: `DesktopNotificationAdapter` depende solo de `INotificationService` y de `node-notifier`_
  - _Criterio: el composition root (capa 4) cablea la inyección del adaptador_
- [ ] 2.7 Gate superado: `npm run test:quick` verde + tests unitarios de `DesktopNotificationAdapter` con `node-notifier` mockeado + smoke test del CLI entry point
  - _Criterio: `npm run test:quick` (lint + typecheck + unit) sin errores_
  - _Criterio: tests unitarios del adaptador pasan con `node-notifier` mockeado_
  - _Criterio: invocar el CLI entry point con un payload válido produce un toast nativo del SO con el título y mensaje del payload (sin imagen, sin icono custom, sin branding)_
  - _Criterio: el adaptador no llama a `node-notifier` con `icon`, no accede a `.lnk`, no invoca `SnoreToast`_
- [ ] 2.8 Documentación actualizada: `README.md` (nueva sección "Notifications"), `docs/notifications.md` (nueva doc con API, entry point CLI, contrato del puerto, y nota explícita de que la primera versión no soporta personalización de imagen/icono/título ni características Windows-specific)
  - _Criterio: `docs/notifications.md` existe y documenta el servicio, su entry point CLI, el contrato de `INotificationService` y las exclusiones intencionales de v1_
  - _Criterio: `docs/notifications.md` declara explícitamente que la migración descarta la lógica de personalización y las dependencias Windows-specific_
- [ ] 2.9 Legacy retirado: no aplica en esta fase (`C:\AI\claude-code-notifications.ts` queda intacto como fallback)
  - _Criterio: ningún archivo retirado o deprecado en esta fase_
- [ ] 2.10 Sync de specs si N1 introduce deltas (p. ej. nueva spec `desktop-notifications-service`) (`openspec-sync`)
  - _Criterio: ejecutado si la fase crea o modifica specs canónicas; no ejecutado si no hay delta_
- [ ] 2.11 Marcar N1 como `validada` en el phase registry y archivar el L2 (`openspec-archive`)
  - _Criterio: columna "Estado" de N1 = `archivada`_
  - _Criterio: L2 movido a `openspec/changes/archive/<fecha>-claude-code-hooks-implementation/phases/...`_

---

## 3. N2 — Reapuntar los hooks al entry point del servicio interno

> Fase final. Depende de H1 y N1 ambas en estado `archivada`.

- [ ] 3.1 Verificar dependencias del DAG: H1 y N1 en estado `archivada`
  - _Criterio: columnas "Estado" de H1 y N1 = `archivada` en el phase registry del orquestador_
- [ ] 3.2 Crear change de segundo nivel `claude-n2-repoint-hooks-to-internal-notifications` (skill `openspec-propose`)
  - _Criterio: directorio `openspec/changes/claude-code-hooks-implementation/phases/claude-n2-repoint-hooks-to-internal-notifications/` con `.openspec.yaml` creado_
- [ ] 3.3 Verificar back-reference en `proposal.md` del L2
  - _Criterio: línea `> **Orquestador:** \`claude-code-hooks-implementation\` | **Fase:** n2 (N)` presente en las primeras 5 líneas del archivo_
- [ ] 3.4 Actualizar estado de N2 a `en curso` en el phase registry del orquestador
  - _Criterio: columna "Estado" de N2 = `en curso`_
- [ ] 3.5 Implementar el L2 (`openspec-apply`) — reemplazar las rutas absolutas a `C:\AI\...` en los 5 comandos de notificación de `.claude/settings.json` (los de `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`, introducidos por H1) por la ruta al entry point del servicio migrado en el repo
  - _Criterio: `grep -F 'C:\AI\' .claude/settings.json` retorna cero coincidencias tras el cambio_
  - _Criterio: los 5 comandos de notificación apuntan al entry point CLI bajo `src/2-services/notifications/`, resuelto relativo a la raíz del proyecto_
- [ ] 3.6 Gate superado: `npm run test:quick` verde + verificación manual de toasts
  - _Criterio: `npm run test:quick` (lint + typecheck + unit) sin errores_
  - _Criterio: al ejecutar Claude Code, los toasts aparecen para los 5 hooks con doble comando (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`)_
  - _Criterio: `node-notifier` carga el icono desde la ruta interna del repo_
- [ ] 3.7 Documentación actualizada: `docs/notifications.md` (ruta final del entry point), `README.md` §setup (cualquier mención residual a `C:\AI/...`)
  - _Criterio: `docs/notifications.md` indica la ruta final del entry point CLI dentro del repo_
  - _Criterio: `docs/notifications.md` marca `C:\AI\claude-code-notifications.ts` como `@deprecated` con fecha de retirada prevista_
- [ ] 3.8 Legacy retirado: documentar `C:\AI\claude-code-notifications.ts` como `@deprecated` con fecha (no se elimina en este roadmap; la eliminación efectiva queda fuera de scope por vivir fuera del repo)
  - _Criterio: la deprecación queda documentada en `docs/notifications.md`_
- [ ] 3.9 Sync de specs si N2 introduce deltas (`openspec-sync`)
  - _Criterio: ejecutado si la fase modifica specs canónicas; no ejecutado si no hay delta_
- [ ] 3.10 Marcar N2 como `validada` en el phase registry y archivar el L2 (`openspec-archive`)
  - _Criterio: columna "Estado" de N2 = `archivada`_
  - _Criterio: L2 movido a `openspec/changes/archive/<fecha>-claude-code-hooks-implementation/phases/...`_

---

## 4. Cierre del roadmap (Roadmap close-out)

- [ ] 4.1 Verificar que las 3 fases (H1, N1, N2) tienen estado `archivada` en el phase registry
  - _Criterio: tabla del registro sin ningún estado `pendiente`, `en curso` o `validada`_
- [ ] 4.2 Verificación E2E global: 0 warnings `[audit] No se encontró workflow padre para continuation` en `server/logs.jsonl` durante una sesión de prueba completa
  - _Criterio: al ejecutar una sesión de Claude Code que dispare al menos 1 `SubagentStart`, 1 `SubagentStop` y 1 `PostToolUseFailure`, el log no contiene el warning_
- [ ] 4.3 Verificar ausencia de referencias activas a `C:\AI\claude-code-notifications.ts` desde `.claude/settings.json`
  - _Criterio: `grep -F 'C:\AI\' .claude/settings.json` retorna cero coincidencias_
- [ ] 4.4 Verificar que `README.md`, `docs/notifications.md` y `docs/gateway-architecture.md` §18 (si aplica) reflejan el estado final del sistema
  - _Criterio: no hay afirmaciones de "done" para trabajo no construido_
  - _Criterio: las rutas mencionadas en los docs coinciden con las rutas reales en el repo_
- [ ] 4.5 Verificación global con `openspec-verify` sobre el orquestador
  - _Criterio: Completeness / Correctness / Coherence checks pasan sin CRITICAL_
- [ ] 4.6 Confirmar ausencia de código y documentación zombie/legacy introducidos por el roadmap
  - _Criterio: `npm run lint` + `npm run typecheck` pasan; búsqueda de referencias a `C:\AI\claude-code-notifications.ts` en código del repo retorna cero resultados activos_
- [ ] 4.7 Archivar el propio change orquestador (`openspec-archive`)
  - _Criterio: `openspec/changes/claude-code-hooks-implementation/` movido a `openspec/changes/archive/<fecha>-claude-code-hooks-implementation/`_
- [ ] 4.8 Commit de cierre con mensaje en español describiendo el cierre del roadmap
  - _Criterio: commit con conventional-commits, mensaje en español, referencia al roadmap_
