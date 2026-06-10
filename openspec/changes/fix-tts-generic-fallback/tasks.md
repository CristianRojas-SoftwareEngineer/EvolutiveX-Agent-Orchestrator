## 1. Implementación

- [ ] 1.1 Modificar `generateSpeechText()` en `src/3-operations/audit-hook-event.handler.ts` para usar `fetch()` al proxy local (`http://127.0.0.1:${PORT}/v1/messages`) con el token capturado, en lugar del SDK `@anthropic-ai/sdk`. Mantener `this.capturedToken` como campo privado y `setAuthToken()` para capturarlo. Si `fetch()` falla o no hay token, usar el fallback existente.

## 2. Verificación

- [ ] 2.1 Ejecutar `npm run test:quick` y confirmar que lint y typecheck pasan sin errores
- [ ] 2.2 Verificar manualmente con provider Minimax (`configure-provider minimax`) que los mensajes TTS no son el fallback genérico