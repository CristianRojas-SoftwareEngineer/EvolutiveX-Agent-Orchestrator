## 1. Dominio y repositorio

- [x] 1.1 Añadir `ToolCompletionAuthority` (`'continuation' | 'hook'`) y campo `completionAuthority` en `IToolUse`
- [x] 1.2 Implementar resolución de autoridad en `registerToolUse` (`continuation`) y `registerPendingToolUse` (`continuation` para Agent, `hook` para web_search/web_fetch)
- [x] 1.3 Exponer lookup `getToolCompletionAuthority(workflowId, toolUseId)` en `IWorkflowRepository` / `WorkflowRepositoryService`
- [x] 1.4 Tests en `workflow-repository.test.ts`: autoridad asignada por canal de registro y nombre de tool

## 2. Handlers L3

- [x] 2.1 `AuditHookEventHandler.handlePostToolUse`: invocar `completeToolUse` solo si `completionAuthority === 'hook'`; no-op silencioso para `continuation`
- [x] 2.2 Actualizar comentario de `completeClientToolResultsFromContinuation`: vía canónica (no “fallback”)
- [x] 2.3 Tests `audit-hook-event.handler.test.ts`: PostToolUse ignorado para Bash; PostToolUse activo para WebFetch stub
- [x] 2.4 Tests `audit-workflow.handler.test.ts`: escenario carrera — hook PostToolUse llega primero sin completar + continuation con stdout → un solo `tool_result` con contenido real

## 3. Fixture golden sesión 8c440211

- [x] 3.1 Añadir test de integración o handler test con bodies de continuation extraídos de la sesión patrón (3 Bash, 1 error exit 128)
- [x] 3.2 Verificar criterio: `result.json` contendría stdout/stderr real, no `null` ni `PostToolUseFailure` genérico

## 4. Documentación

- [x] 4.1 Actualizar `docs/session-audit-model.md`: tabla EventBus → persistencia con precedencia `completionAuthority`; hook vs continuation
- [x] 4.2 Actualizar entrada en `.claude/memory/` si aplica (lección proxy-tool-result-continuation-fallback)

## 5. Verificación

- [x] 5.1 `npm run test:quick` verde
- [x] 5.2 Re-ejecutar análisis de sesión `8c440211` (o test equivalente) y confirmar cierre de hallazgos 1 y 2
