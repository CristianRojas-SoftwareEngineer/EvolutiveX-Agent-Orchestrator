## Context

Hoy el evento `Stop` dispara dos rutas paralelas:

```
Claude Code (Stop)
  └─► stop-hook-ux.ts (proceso hijo)
        ├─► postHookEvent(body) ──► POST /hooks ──► gateway: speakAsync(Stop,'summary') ──► VOZ  (fetch + capturedToken, OK con cualquier provider)
        └─► runContinuityNotification() ──► SDK @anthropic-ai/sdk con ANTHROPIC_AUTH_TOKEN ──► TOAST  (FALLA con Minimax → fallback)
```

La voz ya se corrigió en `fix-tts-generic-fallback` (commit `bcad16c`): `AuditHookEventHandler.generateSpeechText()` invoca al LLM vía `fetch()` a `http://127.0.0.1:<PORT>/v1/messages` con `this.capturedToken` (token del provider activo capturado en `preHandler`). El toast quedó atrás en el script y por eso es inconsistente.

Restricciones relevantes:
- `AuditHookEventHandler` vive en capa 3; puede depender de puertos de capa 1/2 (`INotificationService`, `IContextExtractor`), no de capa 4/5.
- `parseHookEvent` ya mapea `transcript_path` → `transcriptPath`; el evento `Stop` ya llega al gateway hoy (vía `postHookEvent`). No se requiere extender el dominio.
- El proceso del proxy se lanza desde una terminal del usuario (misma sesión interactiva), condición necesaria para que `node-notifier`/SnoreToast renderice el toast.

## Goals / Non-Goals

**Goals:**
- El toast del `Stop` se genera en el gateway desde el **mismo texto** que la voz, con el token del provider activo (consistencia voz↔toast y fin del bug Minimax para este toast).
- Una sola llamada al LLM por evento `Stop` (no duplicar generación para voz y toast).
- Degradación con gracia: el fallo del toast no afecta voz, auditoría ni la respuesta HTTP del hook.
- Reducir superficie: eliminar `stop-work-summary-notification.ts`, `stop-hook-ux.ts` y su persistencia muerta.

**Non-Goals:**
- No migrar otros scripts de notificación (`notifications/cli.ts`, `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts`).
- No introducir la tabla `EVENT_EFFECTS` ni extender `ClaudeHookEvent` con `toolName`/`toolInput` (eso es el change B dependiente).
- No añadir toast a `SubagentStop`/`StopFailure` (su voz ya funciona; sus toasts no usan el SDK).
- No cambiar el prompt de continuidad de la voz ni los parámetros del modelo.

## Decisions

### D1: Generar el texto una vez y emitir por dos canales

Se refactoriza el manejo del `Stop` para que extraiga contexto y genere texto **una sola vez**, y luego emita voz y toast a partir de ese texto.

Estructura propuesta en `AuditHookEventHandler`:

```
case 'Stop': { ...auditoría existente...; void this.announceStop(event); break; }

private async announceStop(event): Promise<void> {
  const messages = await this.extractContext(event.transcriptPath);
  const text = await this.generateSpeechText('Stop', messages, 'summary');  // ya existe (fetch + capturedToken)
  await Promise.allSettled([
    this.tts?.speak(text),
    this.emitToast('Stop', text),
  ]);
}

private async emitToast(title: string, text: string): Promise<void> {
  if (!this.notifier) return;
  const message = truncate(normalizeWhitespace(text), 250);
  try {
    await this.notifier.notify({ title, message, ...this.toastBranding });
  } catch (err) { this.logger?.error({ err }, '[Toast] fallo al emitir'); }
}
```

`speakAsync(event,'summary')` deja de invocarse para `Stop`; su lógica (extraer + generar + hablar) se absorbe en `announceStop` para compartir el texto. `speakAsync` se conserva para `UserPromptSubmit`, `SubagentStop` y `StopFailure` (no cambian).

**Alternativa descartada — generar dos veces (una por canal):** duplica coste de LLM y puede producir textos distintos entre voz y toast (reintroduce la inconsistencia). Rechazada.

### D2: Inyectar `INotificationService` en el handler (puerto, no adaptador)

El handler recibe un `INotificationService` opcional como 8.º parámetro del constructor (tras `contextN`), preservando compatibilidad con los tests que lo construyen con 3 argumentos. El composition root pasa `new DesktopNotificationAdapter()`.

```
new AuditHookEventHandler(
  workflowRepo, auditBaseDir, sessionMetrics, logger,
  ttsService, contextExtractor, config.TTS_CONTEXT_N ?? 3,
  notifier,        // ← nuevo: INotificationService | undefined
  toastBranding,   // ← nuevo: { appId?, icon? } | undefined
)
```

Inyectar el **puerto** (no el adaptador concreto) mantiene PKA y permite mockear el toast en tests sin tocar `node-notifier`.

**Alternativa descartada — importar `DesktopNotificationAdapter` directamente en el handler:** acopla capa 3 a capa 2 concreta y complica el testing. Rechazada.

### D3: Preservar el branding del toast

Para no regresar a toasts firmados como «SnoreToast», el composition root resuelve el branding una vez (`appId` por defecto + icono fallback, reutilizando los helpers existentes de `notifications/cli.ts`: `resolveBranding`/`resolveGlobalFallbackIconPath`) y lo pasa como `toastBranding` al handler. El handler solo lo adjunta al `NotificationEvent`; no conoce el catálogo.

**Alternativa descartada — el handler resuelve branding por sí mismo:** lo acopla a los internals del CLI. Rechazada; la resolución vive en composición.

### D4: Reutilizar `truncate`/`normalizeWhitespace` ya existentes

El cuerpo del toast se trunca a 250 caracteres usando `truncate` y `normalizeWhitespace` de `src/2-services/notifications/hook-payload-notification-message.js` (ya usados por el script que se elimina). Se conserva la convención de 250 del spec previo.

### D5: `configs/hooks.json` — `Stop` pasa al relay genérico

La entrada `Stop` cambia de `stop-hook-ux.ts` a `post-hook-event.ts` y se elimina el `timeout: 120` (el relay es fire-and-forget y responde en milisegundos; la generación ocurre async en el gateway).

## Risks / Trade-offs

- **[Riesgo] El toast emitido desde el gateway no renderiza si el proxy no corre en la sesión interactiva del usuario** (p. ej. servicio de Windows, sesión 0). → **Mitigación**: el modo de arranque soportado es lanzar el proxy desde la terminal del usuario; se añade una verificación manual (tarea) que confirma que el toast aparece con el proxy en su modo de arranque real. Si no aparece, el change no es viable tal cual y se revierte (rollback = restaurar `stop-hook-ux.ts`).
- **[Riesgo] Latencia visible del toast**: pasa de «inmediato desde el hijo» a «async tras generación LLM en el gateway» (~1-2 s). → **Mitigación**: aceptable; la voz ya tenía esa latencia y el toast del `Stop` no es accionable en tiempo real.
- **[Trade-off] Pérdida del archivo `.last-continuity-message.txt`**: ningún consumidor lo lee hoy. → Se elimina; si en el futuro TTS-Fase-2 lo necesitara, se reintroduce con un lector real.
- **[Riesgo] Tests existentes construyen el handler con 3 args**: → **Mitigación**: los nuevos parámetros son opcionales y van al final; sin `notifier`, `emitToast` es no-op.
- **[Trade-off] El branding se resuelve en composición y no por evento**: el `Stop` usa el branding por defecto del catálogo; suficiente para este change.

## Migration Plan

1. Implementar D1–D4 en `AuditHookEventHandler` + composition root (toast operativo desde el gateway).
2. Cambiar `configs/hooks.json` (`Stop` → `post-hook-event.ts`).
3. Eliminar `stop-work-summary-notification.ts`, `stop-hook-ux.ts`, sus tests y la referencia en `validateScpRoot`.
4. Verificación manual del toast con el proxy en su modo de arranque real, con provider Minimax.

**Rollback**: revertir el commit restaura `stop-hook-ux.ts`, su entrada en `hooks.json` y el flujo anterior. Sin migración de datos; sin estado persistente nuevo.

## Open Questions

- ¿El usuario lanza el proxy siempre desde una terminal interactiva? (Asumido sí; la verificación manual lo confirma antes de cerrar.)
