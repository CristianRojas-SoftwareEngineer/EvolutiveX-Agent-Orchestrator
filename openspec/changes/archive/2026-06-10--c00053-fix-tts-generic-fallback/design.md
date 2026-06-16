## Context

`AuditHookEventHandler.generateSpeechText()` (src/3-operations/audit-hook-event.handler.ts) usa `new Anthropic({ authToken: token })` del SDK `@anthropic-ai/sdk` para invocar el LLM. El token se captura del header `authorization` del primer request autenticado vía `setAuthToken()` (e434792).

**Problema**: el SDK de Anthropic solo funciona con tokens de Anthropic. Cuando el provider activo es Minimax, Ollama u otro compatible con Anthropic, el token del request es de ese provider. El SDK lo rechaza o ignora → `anthropic` queda `undefined` → `generateSpeechText()` siempre devuelve `FALLBACK_SPEECH`.

El proxy local (`http://127.0.0.1:8787`) reenvía tráfico a `UPSTREAM_ORIGIN` (provider real) y ya sabe autenticar con cualquier provider porque usa el mismo token del request. La solución es que `generateSpeechText()` use el proxy como passthrough en lugar del SDK directo.

## Goals / Non-Goals

**Goals:**
- `generateSpeechText()` funciona con cualquier provider (Anthropic, Minimax, Ollama, OpenCode, etc.)
- No requiere cambios en el proxy (rutas, headers, lógica de reenvío)
- Mantiene el fallback existente cuando el token no está disponible o la llamada falla

**Non-Goals:**
- No modificar la lógica de captura de token (`setAuthToken`) — ya funciona
- No eliminar el cliente Anthropic del constructor ni de `setAuthToken` — se conserva para uso futuro
- No cambiar el spec `tts-hooks` — los requisitos siguen cumpliéndose
- No modificar `stop-work-summary-notification.ts` — ese script corre en el proceso de Claude Code y tiene su propio problema separado

## Decisions

### D1: Usar `fetch()` al proxy local en lugar del SDK de Anthropic

**Opción A — SDK de Anthropic directo al provider (descartada):**
```typescript
const client = new Anthropic({ authToken: token, baseURL: upstreamUrl });
```
Requiere conocer `upstreamUrl` en el handler, que no tiene acceso directo a `UPSTREAM_ORIGIN` (está en `ProxyEnvironmentConfig` de la capa 4, no accesible desde capa 3 sin romper PKA).

**Opción B — `fetch()` al proxy local (elegida):**
```typescript
const port = process.env.PORT || 8787;
const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
  method: 'POST',
  headers: {
    'authorization': `Bearer ${this.capturedToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ model, messages, system, max_tokens }),
});
const data = await res.json();
```
El proxy reenvía la petición al `UPSTREAM_ORIGIN` con el mismo token. El handler no necesita saber qué provider está activo.

**Alternativa C — Header `x-claude-code-internal` (descartada):**
Agregar un header propietario para marcar requests internos y evitar loop. Innecesario: `UPSTREAM_ORIGIN` nunca apunta al proxy local, por lo que no hay riesgo de loop.

### D2: Mantener `setAuthToken` y el cliente Anthropic

El constructor y `setAuthToken()` crean `this.anthropic = new Anthropic(...)`. Este código se conserva porque:
- No causa comportamiento incorrecto (la llamada al LLM ya no pasa por ahí)
- Permite uso futuro del cliente Anthropic directo si otra feature lo necesita
- Eliminarlo requeriría cambios en el constructor y rompería el patrón establecido

### D3: El token se comparte entre threads/workers?

El servidor proxy es single-process (Fastify, sin workers). El token capturado en `preHandler` está en la misma instancia del handler. No hay problema de concurrencia.

## Risks / Trade-offs

- **[Riesgo] Token no disponible en el primer request**: si el primer request es un preflight o no tiene `authorization`, `this.capturedToken` queda vacío. `generateSpeechText()` devuelve fallback — comportamiento correcto existente.
- **[Riesgo] Token caduca entre requests**: si el token expira entre el primer request y la llamada TTS, la petición al proxy falla. Se usa fallback — aceptable para TTS.
- **[Trade-off] Dependencia del proxy local**: el handler ahora depende de que el proxy esté corriendo para generar texto TTS. Si el proxy cae, TTS usa fallback. Aceptable porque la auditoría principal también depende del proxy.
- **[Trade-off] Latencia adicional**: un `fetch()` extra a través del proxy introduce ~1 hop de red adicional. Para TTS (voz, no-path crítico) es irrelevante.