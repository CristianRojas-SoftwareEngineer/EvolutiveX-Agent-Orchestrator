## 1. Gateway: emitir voz + toast del Stop desde un único texto

- [x] 1.1 En `src/3-operations/audit-hook-event.handler.ts`, añadir dos campos opcionales al constructor **al final** de la lista de parámetros (tras `contextN`): `notifier?: INotificationService` y `toastBranding?: { appId?: string; icon?: string }`. Importar `INotificationService` desde `../2-services/notifications/INotificationService.js` y `NotificationEvent` desde `../2-services/notifications/types.js`. No alterar el orden de los parámetros existentes (los tests construyen el handler con 3 args).
- [x] 1.2 Añadir el método privado `announceStop(event: ClaudeHookEvent): Promise<void>` que: (a) extrae contexto con `this.extractContext(event.transcriptPath)`, (b) genera el texto una sola vez con `this.generateSpeechText('Stop', messages, 'summary')`, (c) emite voz y toast en paralelo con `Promise.allSettled([this.tts?.speak(text), this.emitToast('Stop', text)])`. Nunca propaga errores.
- [x] 1.3 Añadir el método privado `emitToast(title: string, text: string): Promise<void>`: si `this.notifier` es `undefined`, retorna sin hacer nada; si no, construye un `NotificationEvent` con `title`, `message = truncate(normalizeWhitespace(text), 250)` y el spread de `this.toastBranding` (si existe), y llama `await this.notifier.notify(...)` dentro de try/catch que registra el error con `this.logger?.error` sin relanzar. Importar `truncate` y `normalizeWhitespace` desde `../2-services/notifications/hook-payload-notification-message.js`.
- [x] 1.4 En el `case 'Stop'` de `executeAsync`, reemplazar la llamada `void this.speakAsync(event, 'summary')` por `void this.announceStop(event)`. **No** modificar los casos `UserPromptSubmit`, `SubagentStop` ni `StopFailure` (siguen usando `speakAsync`).

## 2. Composition root: inyectar notifier y branding

- [x] 2.1 En `src/4-api/composition-root.ts`, importar `DesktopNotificationAdapter` y los helpers de branding de `notifications/cli.ts` (`resolveBranding` y/o `resolveGlobalFallbackIconPath`). Resolver el branding por defecto una sola vez (p. ej. `const toastBranding = resolveBranding({})`).
- [x] 2.2 Pasar `new DesktopNotificationAdapter()` y `toastBranding` como los dos nuevos argumentos finales de `new AuditHookEventHandler(...)` (posiciones 8 y 9), tras `config.TTS_CONTEXT_N ?? 3`.

## 3. hooks.json: Stop usa el relay genérico

- [x] 3.1 En `configs/hooks.json`, cambiar el comando de la entrada `Stop` de `scripting/stop-hook-ux.ts` a `scripting/post-hook-event.ts` y eliminar el campo `"timeout": 120` de esa entrada.

## 4. Eliminar el flujo basado en script

- [x] 4.1 Borrar `scripting/stop-work-summary-notification.ts` y `scripting/stop-hook-ux.ts`.
- [x] 4.2 Borrar sus tests: `tests/scripting/stop-work-summary-notification.test.ts` y `tests/scripting/stop-hook-ux.test.ts` (y cualquier fixture exclusivo de estos, si existe).
- [x] 4.3 En `scripting/features/hooks.ts`, eliminar `STOP_HOOK_UX_SEGMENT` del array `files` de `validateScpRoot` y la constante si queda sin uso. **Conservar** el substring `'stop-hook-ux'` en `isScpManagedCommand` (permite que el instalador limpie entradas heredadas de instalaciones previas). Actualizar el comentario de cabecera del archivo que enumera las 14 entradas / scripts si menciona `stop-hook-ux` como archivo requerido.
- [x] 4.4 Verificar con `Grep` que no quedan imports ni referencias colgantes a los símbolos eliminados (`runContinuityNotification`, `extractWorkflowContext`, `generateContinuityMessage`, `writeContinuityMessage`, `notifyContinuityMessage`, `resolveAnthropicClient`, `stop-work-summary-notification`, `stop-hook-ux`) en `src/`, `scripting/` y `tests/`. Eliminar las que sean huérfanas a causa de este cambio.

## 5. Tests del gateway

- [x] 5.1 En `tests/3-operations/audit-hook-event.handler.test.ts`, añadir un mock de `INotificationService` (`notify: vi.fn()`) y un test: al procesar un evento `Stop` con `transcriptPath` y token capturado simulados, `notifier.notify` es llamado una vez con `title: 'Stop'` y un `message` no vacío.
- [x] 5.2 Añadir un test de robustez: si `notifier.notify` rechaza, el procesamiento del `Stop` no lanza y la voz (`tts.speak`) se sigue invocando.

## 6. Verificación

- [x] 6.1 Ejecutar `npm run test:quick` y confirmar que lint, typecheck y unit pasan sin errores.
- [x] 6.2 Ejecutar `npm run test` para confirmar que la suite completa (incluida integración) pasa tras eliminar los scripts.
- [ ] 6.3 Verificación manual con provider Minimax (`configure-provider minimax`) y el proxy lanzado en su **modo de arranque real**: provocar un evento `Stop` y confirmar que (a) aparece el toast de escritorio, (b) su texto es contextual (no el último mensaje crudo ni el fallback genérico) y (c) coincide en sentido con la locución de voz. Si el toast no aparece, detener y revisar el riesgo de sesión de escritorio (design D2/Risks) antes de cerrar el change.

## 7. Documentación

- [x] 7.1 Actualizar `docs/notifications.md` (y cualquier doc que describa el flujo del `Stop` o `.last-continuity-message.txt`) para reflejar que el toast del `Stop` se emite desde el gateway y que el archivo de persistencia se retiró.
