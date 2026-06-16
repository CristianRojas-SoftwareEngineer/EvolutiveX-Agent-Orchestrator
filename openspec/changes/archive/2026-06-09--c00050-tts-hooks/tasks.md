## 1. Configurar Dependencias y Entorno (PKA 4-api/2-services)

- [x] 1.1 Instalar dependencias `kokoro-js` en `package.json`
- [x] 1.2 Agregar configuración de variables de entorno y soporte offline de transformers en `src/4-api/config/env.config.ts`

## 2. Puertos de Dominio (PKA 1-domain)

- [x] 2.1 Crear la interfaz `ITTSService` en `src/1-domain/ports/ITTSService.ts`
- [x] 2.2 Crear la interfaz `IContextExtractor` en `src/1-domain/ports/IContextExtractor.ts` y tipos asociados para el mensaje contextual en `src/1-domain/types/hook.types.ts`

## 3. Implementar Servicios y Adaptadores (PKA 2-services)

- [x] 3.1 Implementar `TranscriptContextExtractor` en `src/2-services/tts/transcript-extractor.service.ts`
- [x] 3.2 Implementar `KokoroTTSService` en `src/2-services/tts/kokoro-tts.service.ts` utilizando transformers offline y PowerShell no bloqueante en Windows 11

## 4. Orquestar en Handlers y API (PKA 3-operations/4-api)

- [x] 4.1 Extender `AuditHookEventHandler` en `src/3-operations/audit-hook-event.handler.ts` para inyectar `ITTSService` y `IContextExtractor`, leer el transcript y llamar a Anthropic/LLM para la generación de la locución/resumen
- [x] 4.2 Configurar el Composition Root en `src/4-api/composition-root.ts` instanciando e inicializando los servicios de TTS y Extractor e inyectándolos en `AuditHookEventHandler`

## 5. Verificación y Pruebas

- [x] 5.1 Ejecutar `npm run test:quick` para asegurar que el typecheck y lint sigan pasando sin errores
- [x] 5.2 Levantar el servidor proxy y probar manualmente la síntesis ante eventos de hook simulados
