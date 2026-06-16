## 1. Retiro de módulo y tipos zombie (capa 1-domain)

- [x] 1.1 Eliminar `src/1-domain/constants/audit-paths.ts`
- [x] 1.2 Retirar de `audit.types.ts`: `StepMeta`, `PendingWebSearchToolUse`, `PendingWebFetchToolUse`, `ResolvedInternalTool`
- [x] 1.3 Retirar `inferredByOrder` de `SubagentSummary` en `audit.types.ts`
- [x] 1.4 Retirar campos `sseRawBytesWritten`, `sseRawTruncatedByLimit`, `sseRawWriteError` de `SseReconstructOptions`
- [x] 1.5 Actualizar comentario de cabecera en `src/2-services/session-routing.ts` (audit-paths retirado, no «reemplaza» un módulo vivo)

## 2. Renderer y tests

- [x] 2.1 Quitar rama `(inferido por orden - legacy)` en `markdown-renderer.service.ts`
- [x] 2.2 Actualizar fixtures en `tests/1-domain/markdown-renderer.test.ts` (sin `inferredByOrder`)
- [x] 2.3 Actualizar llamadas en `tests/2-services/sse-reconstruct.test.ts` (sin campos `sseRaw*` en opts)

## 3. Documentación

- [x] 3.1 Reescribir `docs/session-audit-model.md` §7: tipos activos vs retirados; eliminar mención de `StepMeta` como activo
- [x] 3.2 Verificar que no queden referencias rotas a `audit-paths` en `docs/` (grep `audit-paths`, `StepMeta`)

## 4. Verificación

- [x] 4.1 `rg "StepMeta|audit-paths|inferredByOrder|PendingWebSearchToolUse|PendingWebFetchToolUse|ResolvedInternalTool" src/` → cero coincidencias en producción
- [x] 4.2 `npm run test:quick` sin errores
