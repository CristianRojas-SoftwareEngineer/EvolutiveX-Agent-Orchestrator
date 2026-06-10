## Context

`AuditHookEventHandler` llama internamente al proxy (loopback `127.0.0.1:PORT/v1/messages`) para generar texto TTS. La llamada pasaba siempre el header `anthropic-version: 2023-06-01` y el token OAuth capturado (`capturedToken`), asumiendo que el upstream era siempre Anthropic. Cuando el usuario cambia el provider activo a OpenRouter, MiniMax, Ollama u otro bearer provider, el proxy reenvía esa llamada con headers incompatibles, el upstream devuelve `402` y el handler cae silenciosamente al mensaje genérico sin emitir ninguna señal de error visible.

El handler ya recibe la URL upstream a través del composition root (campo `UPSTREAM_ORIGIN` de la configuración). El fix consiste en inyectar ese valor al handler y bifurcar token y headers a partir de él.

## Goals / Non-Goals

**Goals:**
- TTS funciona con todos los providers del catálogo sin configuración adicional.
- Los fallbacks son detectables en logs (`[TTS-FALLBACK]` con `reason`).
- `SapiTTSService.speak()` espera a que termine el audio antes de retornar.
- Eliminar la lectura de bloques `thinking` como salida hablable (causa respuestas en inglés con MiniMax-M2.5).

**Non-Goals:**
- Cambiar el upstream donde se realiza la llamada TTS (sigue siendo el loopback del proxy).
- Soportar un backend TTS dedicado independiente del provider de sesión (change posterior).
- Modificar el sistema de routing ni la lógica de autenticación del proxy principal.
- Eliminar el thinking de los modelos razonadores; en su lugar se presupuesta `max_tokens` suficiente (512) para que el bloque `text` quepa después del razonamiento, y el caso residual sin `text` se trata honestamente como `empty-response`.

## Decisions

### D1: Inyectar `upstreamOrigin` vía constructor, no leído directamente desde `process.env`

**Decisión**: el composition root pasa `config.UPSTREAM_ORIGIN` al constructor de `AuditHookEventHandler`.

**Alternativa descartada**: leer `process.env.UPSTREAM_ORIGIN` directamente dentro del handler. Rompe la arquitectura PKA: la capa 3-operations no debe depender directamente del entorno; el composition root (4-api) es el punto de resolución de configuración.

---

### D2: Detección de provider por prefijo de URL, no por enum ni campo separado

**Decisión**: `isAnthropic = upstreamOrigin.includes('api.anthropic.com')`. Los providers no-Anthropic usan la rama bearer.

**Alternativa descartada**: introducir un enum de provider o un campo `authMethod`. Añade indirección innecesaria para un fix quirúrgico; la URL ya contiene la información suficiente. Una futura refactorización hacia `TtsInferenceProfile` podrá formalizarlo.

---

### D3: Selección de token con prioridad explícita

```
Anthropic  → capturedToken ?? ANTHROPIC_API_KEY
Bearer     → ANTHROPIC_AUTH_TOKEN ?? capturedToken
```

**Razón**: `capturedToken` es el OAuth dinámico interceptado del flujo de Claude Code; solo es válido para Anthropic. `ANTHROPIC_AUTH_TOKEN` es la clave bearer que el usuario configura para providers no-Anthropic. El orden de prioridad refleja la fuente más confiable para cada tipo.

---

### D4: Solo bloques `type === "text"` son salida hablable; nunca `thinking`

**Decisión**: si la respuesta del LLM no contiene bloques `text`, el handler emite `logTtsFallback("empty-response")` y retorna el mensaje genérico.

**Alternativa descartada**: usar bloques `thinking` cuando no hay `text`. Fue implementada temporalmente durante la sesión de depuración y eliminada al formalizar el change. Produce respuestas en inglés con MiniMax-M2.5, cuyo razonamiento interno no respeta el system prompt de idioma. Es un error silencioso: el harness reporta "mensaje dinámico" cuando en realidad el contenido es razonamiento interno. El fallback honesto es preferible a un "dinámico" incorrecto.

---

### D5: `SapiTTSService.speak()` awaitable con `child.on('close')`

**Decisión**: `synthesize()` resuelve al evento `close` del proceso PowerShell; `speak()` hace `await synthesize()`.

**Razón**: el patrón anterior (`child.unref(); resolve()`) desacoplaba el proceso del ciclo de vida del gateway. Si el handler cerraba el proceso del proxy antes de que terminara la síntesis, el audio se cortaba. El fix garantiza que el audio complete antes de que el caller continúe.

---

### D6: Logging estructurado en lugar de `console.error` genérico

**Decisión**: `logTtsFallback(eventName, reason, fallbackText)` y `logTtsDynamic(eventName, textPreview)` escriben entradas JSONL con tags `[TTS-FALLBACK]` / `[TTS-SPEECH]` en el logger del handler.

**Razón**: permite al harness de pruebas detectar errores silenciosos correlacionando tags en `logs.jsonl`, sin depender solo del status HTTP. También facilita diagnóstico en producción sin cambiar el nivel de log global.

### D7: Presupuesto de `max_tokens` por provider para absorber el thinking

**Decisión**: la llamada TTS usa `max_tokens: 150` para Anthropic, `512` para providers no-Anthropic, y `150` para Ollama local (`upstreamOrigin` contiene `localhost:11434`). En la rama no-Anthropic se envía además `reasoning: { effort: 'none' }`.

**Razón**: los modelos thinking (MiniMax-M2.5, laguna-xs.2) consumen tokens en razonamiento antes de emitir bloques `text`; con 150 tokens devuelven `empty-response`. Con 512, ambos producen el bloque `text` de forma fiable (verificado vía REST directa y suite headless). Ollama cloud rechaza `max_tokens > 150` (404), por eso conserva el cap. `reasoning: { effort: 'none' }` reduce el thinking en OpenRouter pero no lo elimina de forma fiable; MiniMax y Ollama lo ignoran sin error.

**Alternativa descartada**: desactivar el thinking por completo (no existe mecanismo fiable en los modelos free de OpenRouter) o elegir solo modelos sin thinking (Gemma 4 falla en sesiones reales vía gateway).

---

### D8: Harness aislado de la sesión principal (env-injection, sin estado global)

**Decisión**: el harness levanta su propio proxy en el puerto 8788 (guard que aborta si coincide con el principal) y resuelve la configuración del provider en memoria (`provider-env.ts` sobre `scripting/shared/provider-config.ts`). La inyecta vía flag `--settings '<json>'` a `claude -p` (única vía que prevalece sobre el bloque `env` de `~/.claude/settings.json`) y vía variables de entorno al proxy de test: `UPSTREAM_ORIGIN`, credenciales, `LOG_FILE=server/logs-headless-tts.jsonl` y `AUDIT_BASE_DIR=server/headless-tts/sessions` (soportados por `src/index.ts`).

**Razón**: la suite se ejecuta desde sesiones de Claude Code que dependen del proxy principal (8787); matarlo, o mutar `settings.json`/`configs/.env`, rompe la sesión padre y mezcla logs de test con los de producción. El relay de hooks (`post-hook-event.ts`) resuelve su destino desde `ANTHROPIC_BASE_URL`, por lo que los hooks del subproceso disparan automáticamente contra el proxy de test.

**Alternativa descartada**: reconfigurar el provider global con `configure-provider` por cada test (muta estado compartido y exige restaurarlo; fue la causa de interrupciones de la sesión principal durante la depuración).

## Risks / Trade-offs

- **Respuestas solo-thinking residuales** → Mitigado con presupuesto 512 (D7); si aun así no hay bloque `text`, el fallback honesto `empty-response` es el comportamiento correcto. El harness reporta el estado real.
- **`upstreamOrigin.includes('api.anthropic.com')` es frágil si hay subdominios nuevos** → Riesgo bajo: Anthropic no ha añadido dominios alternativos; la comprobación es suficiente para el catálogo actual.
- **`SapiTTSService.speak()` awaitable añade latencia al handler** → Acotado: la síntesis SAPI tarda entre 1–3 s; el hook TTS es fire-and-forget desde la perspectiva de Claude Code (responde 2xx antes de que hable la voz), así que no afecta la latencia del proxy.

## Open Questions

_(ninguna — el alcance del fix está completamente definido)_
