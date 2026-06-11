# TTS Testing con el método headless

Esta referencia documenta cómo aplicar el mecanismo de ejecución headless
(ver `../SKILL.md`) para validar el feature TTS de Smart Code Proxy.

---

## Suite automatizada

```bash
npm run test:headless-tts
```

Lanza la suite completa: un ciclo por provider (anthropic, minimax, openrouter,
ollama, default) más el escenario de fallback sin clave TTS.

Opciones relevantes:

| Flag | Descripción |
|---|---|
| `--providers <csv>` | Limitar a proveedores específicos |
| `--prompt <text>` | Prompt headless (default: `Hola, resume en una frase qué dices`) |
| `--port <n>` | Puerto del proxy de test (default: 8788) |
| `--no-voice-announce` | Sin anuncios de voz al inicio/fin de cada provider |
| `--skip-claude` | Solo lifecycle del proxy (smoke test) |
| `--json` | Salida JSON parseable |
| `--allow-partial` | Exit 0 aunque fallen algunos providers |

---

## Ciclo TTS (evento Stop)

`generateSpeechText` **siempre usa el provider TTS dedicado OpenRouter** —
independiente del provider de sesión. El flujo es:

```
Stop hook → POST /hooks → AuditHookEventHandler
  → generateSpeechText → fetch('https://openrouter.ai/api/v1/messages')
       model: poolside/laguna-xs.2:free
       auth:  routing/providers/openrouter/secrets.json ANTHROPIC_AUTH_TOKEN
       (NUNCA a través del proxy local)
  → [TTS-SPEECH] log entry (éxito) OR [TTS-FALLBACK] log entry (cualquier error)
  → speak(text) via SAPI (motor TTS local)
```

**Importante:** como la llamada TTS bypasea el proxy, **no aparece código HTTP de TTS
en `server/logs.jsonl`**. La detección depende exclusivamente de los log entries
`[TTS-SPEECH]` y `[TTS-FALLBACK]`.

### Dos estados de salida TTS

| Log tag | Significado | Campo `reason` |
|---|---|---|
| `[TTS-SPEECH]` | Resumen dinámico generado con éxito | — (solo `textPreview`) |
| `[TTS-FALLBACK]` | Fallback al mensaje genérico | `no-openrouter-key`, `no-messages`, `http-NNN`, `empty-response`, `exception` |

---

## Provider matrix

El provider de sesión solo afecta el flujo agéntico principal. El TTS siempre
usa OpenRouter (provider dedicado).

| Provider | Flujo de sesión | Flujo TTS |
|---|---|---|
| `anthropic` (default) | `https://api.anthropic.com` con Bearer OAuth | OpenRouter dedicado (`poolside/laguna-xs.2:free`) |
| `minimax` | Endpoint Minimax con Bearer API key | OpenRouter dedicado |
| `openrouter` | Endpoint OpenRouter | OpenRouter dedicado |
| `ollama` | Endpoint local Ollama | OpenRouter dedicado |
| `default` | `https://api.anthropic.com` con Bearer OAuth | OpenRouter dedicado |

**Prerequisito para tests TTS:** `routing/providers/openrouter/secrets.json` debe
contener un `ANTHROPIC_AUTH_TOKEN` válido. Sin él, todos los providers caen en
`[TTS-FALLBACK] reason: no-openrouter-key` — comportamiento válido pero la suite
lo considera fallo para la aserción de TTS dinámico.

---

## Observar resultados

### Logs del gateway

```bash
# Entradas [TTS-SPEECH] (TTS dinámico exitoso)
grep '\[TTS-SPEECH\]' server/logs-headless-tts.jsonl

# Entradas [TTS-FALLBACK] (fallback + razón)
grep '\[TTS-FALLBACK\]' server/logs-headless-tts.jsonl

# Últimas N líneas del log completo
tail -n 50 server/logs-headless-tts.jsonl
```

Campos de interés en cada entrada JSONL:

| Campo | Significado |
|---|---|
| `tag` | `[TTS-SPEECH]` éxito / `[TTS-FALLBACK]` fallback |
| `textPreview` | Primeros 120 chars del texto TTS (solo en `[TTS-SPEECH]`) |
| `reason` | Razón del fallback: `no-openrouter-key`, `no-messages`, `http-NNN`, `empty-response`, `exception` |
| `usedFallback` | `true` cuando se usó el mensaje genérico |
| `fallbackText` | Texto genérico reproducido (solo en `[TTS-FALLBACK]`) |
| `eventName` | Evento hook que disparó el TTS (`Stop`, `UserPromptSubmit`, etc.) |

### Auditoría de sesiones

Cada turno escribe artefactos bajo `sessions/headless-tts/<sessionId>/`.
Revisar los archivos de cierre del workflow para confirmar que el ciclo de hooks completó.

### Drain loop

La suite espera a que el gateway registre las llamadas TTS antes de detener el
proxy. El drain loop (`waitForGatewayTtsDrain`) hace polling de
`ttsSpeeches.length + ttsFallbacks.length` en el log; el contador sube en cuanto
el handler emite su log entry, independientemente del path TTS tomado.

---

## Reproducir el escenario no-openrouter-key

La suite incluye un escenario dedicado que arranca el proxy con
`OPENROUTER_SECRETS_PATH` apuntando a una ruta inexistente:

```bash
# Se ejecuta automáticamente como parte de la suite completa:
npm run test:headless-tts -- --no-voice-announce

# Para aislarlo con runHeadlessSession:
await runHeadlessSession({
  provider: 'default',
  prompt: 'Di hola',
  extraProxyEnv: { OPENROUTER_SECRETS_PATH: '/nonexistent/tts-secrets.json' },
});
// Verificar: grep '[TTS-FALLBACK]' server/logs-headless.jsonl | grep 'no-openrouter-key'
```

Resultado esperado: `[TTS-FALLBACK] reason: no-openrouter-key` en el log para
el evento `Stop`.

---

## Aserción mínima

```bash
# Éxito TTS dinámico en Stop
grep '"tag":"\[TTS-SPEECH\]"' server/logs-headless-tts.jsonl \
  | grep '"eventName":"Stop"' | tail -3

# Fallback con razón
grep '"tag":"\[TTS-FALLBACK\]"' server/logs-headless-tts.jsonl | tail -3
```
