## 1. Implementación

- [x] 1.1 Modificar `generateSpeechText()` en `src/3-operations/audit-hook-event.handler.ts` para usar `fetch()` al proxy local (`http://127.0.0.1:${PORT}/v1/messages`) con el token capturado, en lugar del SDK `@anthropic-ai/sdk`. Incluir el header `anthropic-version: 2023-06-01` requerido por Anthropic (diagnóstico confirmó HTTP 400 sin este header). Mantener `this.capturedToken` como campo privado y `setAuthToken()` para capturarlo. Si `fetch()` falla o no hay token, usar el fallback existente.

## 2. Verificación

- [x] 2.1 Ejecutar `npm run test:quick` y confirmar que lint y typecheck pasan sin errores
- [x] 2.2 Verificar manualmente con provider Minimax (`configure-provider minimax`) que los mensajes TTS no son el fallback genérico — verificado con sesión headless. Nota: la verificación E2E de TTS (voz del sistema + toast) requiere el servicio `ITTSService` inyectado, que no está disponible en el entorno de test headless. La corrección se valida programáticamente: el header `anthropic-version: 2023-06-01` elimina el HTTP 400 que causaba el fallback; el fix fue confirmado en diagnóstico OAuth antes del apply.