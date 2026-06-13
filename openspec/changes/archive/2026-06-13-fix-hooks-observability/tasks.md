## 1. Nivel de log en `AuditHookEventHandler`

- [x] 1.1 En `src/3-operations/audit-hook-event.handler.ts`, cambiar `this.logger?.info` por `this.logger?.warn` en el caso `Stop` cuando no se encuentra workflow (línea ~97)
- [x] 1.2 En `src/3-operations/audit-hook-event.handler.ts`, cambiar `this.logger?.info` por `this.logger?.warn` en el caso `SubagentStop` cuando `agentId` no está en el índice wire (línea ~117)
- [x] 1.3 En `src/3-operations/audit-hook-event.handler.ts`, cambiar `this.logger?.info` por `this.logger?.error` en el caso `SubagentStop` cuando `agentId` existe en índice wire pero no en lifecycle (línea ~126)
- [x] 1.4 En `src/3-operations/audit-hook-event.handler.ts`, cambiar `this.logger?.info` por `this.logger?.warn` en el caso `StopFailure` cuando no se encuentra workflow (línea ~145)
- [x] 1.5 Verificar: `npm run test:quick`

## 2. Guarda de payload inválido en `HooksController`

- [x] 2.1 En `src/5-user-interfaces/http/hooks.controller.ts`, añadir guarda después de `parseHookEvent`: si `event.eventName === ''`, logear `request.log.warn` con los primeros 200 caracteres del body y retornar sin invocar `hookEventHandler.execute`
- [x] 2.2 Verificar: `npm run test:quick`

## 3. Exit codes en el relay `post-hook-event.ts`

- [x] 3.1 En `scripting/post-hook-event.ts`, cambiar el bloque catch de `fetch` para que escriba a `stderr` y llame `process.exit(1)` en lugar de `process.exit(0)`
- [x] 3.2 En `scripting/post-hook-event.ts`, añadir comprobación `if (!res.ok)` tras el `fetch`: escribir a `stderr` el mensaje `post-hook-event: HTTP <status> <url>` y llamar `process.exit(1)`
- [x] 3.3 Verificar que el camino exitoso sigue llamando `process.exit(0)`
- [x] 3.4 Verificar: `npm run test:quick`

## 4. Corrección del matcher de `SessionStart` en `configs/hooks.json`

- [x] 4.1 En `configs/hooks.json`, eliminar el campo `"matcher"` de la entrada `SessionStart`
- [x] 4.2 Verificar que el JSON resultante es válido (`node -e "JSON.parse(require('fs').readFileSync('configs/hooks.json','utf8'))"`)
- [x] 4.3 Verificar: `npm run test:quick`

## 5. Verificación final

- [x] 5.1 Ejecutar suite completa: `npm run test`
- [x] 5.2 Confirmar que los 4 cambios están presentes en el diff y no hay líneas adicionales modificadas
