# Proposal: fix-tts-generic-fallback

## Why

El cliente Anthropic en `AuditHookEventHandler.generateSpeechText()` se inicializa con el SDK `@anthropic-ai/sdk`, que solo funciona con tokens de Anthropic. Cuando el provider activo es Minimax, Ollama u otro compatible con Anthropic, el token del request es de ese provider, no de Anthropic — el SDK lo rechaza silenciosamente y todas las llamadas TTS caen en el mensaje de fallback genérico. La verificación de la issue e434792 (fix TTS con OAuth token) se hizo solo con provider `anthropic`, donde funciona porque el token OAuth de Claude Code es válido contra `api.anthropic.com`.

## What Changes

- `AuditHookEventHandler.generateSpeechText()` deja de usar el SDK `@anthropic-ai/sdk` y usa `fetch()` directo al proxy local (`http://127.0.0.1:<PORT>/v1/messages`) con el token Bearer capturado del request authenticado
- El proxy reenvía la petición al `UPSTREAM_ORIGIN` activo con el mismo token, exactamente igual que las peticiones de Claude Code
- El token se obtiene de `setAuthToken()` ya existente (e434792) — no se captura de nuevo
- Si `fetch()` falla o el token no está disponible, se usa el fallback existente
- El constructor y `setAuthToken()` conservan la creación del cliente Anthropic para compatibilidad futura (no se eliminan)

## Capabilities

### New Capabilities
Ninguna. Este cambio no introduce nuevas capacidades — solo corrige la implementación de una ya existente.

### Modified Capabilities
Ninguna. El spec `tts-hooks` define que el sistema "SHALL invocar al LLM" y "SHALL usar fallback en caso de error"; no especifica el mecanismo de transporte. La corrección no cambia requisitos, solo la forma de cumplir el requisito existente.

## Impact

- **Archivo modificado**: `src/3-operations/audit-hook-event.handler.ts`
- **Dependencias**: ninguna nueva (usa `fetch` nativo de Node.js 18+)
- **Capas PKA**: solo capa 3 (operations/handlers)
- **Comportamiento breaking**: ninguno — el fallback existente sigue funcionando para errores de red y tokens ausentes
- **Verificación**: `npm run test:quick` debe pasar; probar con `configure-provider minimax` y verificar que los mensajes TTS no sean el fallback genérico