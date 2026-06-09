# Propuesta: Integración de TTS Local (kokoro-js) con Memoria Contextual en Smart Code Proxy

## Problema y Motivación
Actualmente, el proxy de observabilidad "Smart Code Proxy" cuenta con un flujo de hooks para interceptar el ciclo de vida de Claude Code. Sin embargo, no dispone de una interfaz de salida de voz local (Text-to-Speech) que permita al desarrollador recibir notificaciones por voz inteligentes y contextuales sobre el estado de la ejecución.

Para mejorar la interacción por voz, el desarrollador necesita que el proxy no solo emita sonidos genéricos, sino que:
1. En los eventos de detención (`Stop`, `SubagentStop`, `StopFailure`), extraiga los últimos $N$ mensajes (del usuario, del asistente - incluyendo texto de razonamiento y uso de herramientas - y del sistema) para generar y reproducir por voz un resumen del proceso ejecutado.
2. En el evento de inicio (`UserPromptSubmit`), lea los últimos $N$ mensajes como contexto conversacional y genere una locución en voz respondiendo al último mensaje del usuario, actuando como un asistente de voz integrado.

Este enfoque provee capacidades de síntesis de voz locales (TTS) interactivas, personalizadas y de alta calidad ejecutadas 100% offline, mejorando la experiencia agéntica.

## Alcance
- **Objetivo**: Integrar un motor TTS offline basado en `kokoro-js` y ONNX Runtime en el backend de Smart Code Proxy, con capacidades de lectura de memoria contextual de sesiones.
- **Memoria Contextual**:
  - Implementar un extractor en el backend para leer los últimos $N$ turnos de la sesión actual de Claude Code (desde el archivo transcript JSONL).
  - Configurar $N$ de forma flexible (por ejemplo, por defecto los últimos 3 turnos).
- **Flujo de Interceptación en el Backend (`AuditHookEventHandler`)**:
  - `UserPromptSubmit`: Leer el contexto e invocar al LLM local (o reutilizar el cliente de Anthropic existente) para que genere una respuesta breve del asistente de voz, y luego reproducirla por voz.
  - `Stop` / `SubagentStop` / `StopFailure`: Leer el contexto, extraer el razonamiento/pasos de herramientas y mensajes previos, generar un resumen hablado corto en español de la tarea completada/pendiente y reproducirlo.
- **Reproducción**: Ejecutar la reproducción de forma asíncrona no bloqueante en Windows 11 utilizando PowerShell.
- **Fuera de Alcance**:
  - No crear orquestadores de hooks redundantes.
  - No requerir dependencias de Python globales ni herramientas como `espeak-ng`.

## Capas PKA Afectadas
- **1-domain**: Definición del puerto del servicio de síntesis de voz (`ITTSService`) y tipos para la memoria contextual (`SessionMessageContext`).
- **2-services**: Implementación de `KokoroTTSService` que encapsula `kokoro-js` y la reproducción asíncrona de audio.
- **3-operations**: Extensión de `AuditHookEventHandler` para orquestar la lectura de la memoria contextual, la llamada al LLM para resúmenes/respuestas y la reproducción TTS.
- **4-api**: Registro e inicialización en el Composition Root (`createProxyDependencies`) y arranque del modelo en memoria una sola vez.
