## Context

El hook `Stop` de Claude Code actualmente despacha dos notificaciones de escritorio desde un único proceso (`stop-hook-ux.ts`): (1) un toast inmediato de señal de fin de turno (`notifyStopTurnFinished`) y (2) un segundo toast con un resumen de Haiku generado desde `last_assistant_message`. El input al modelo se limita al último bloque de texto del asistente, lo que produce resúmenes superficiales sin contexto del workflow completo. El tope de generación de 320 chars fue diseñado para el display del toast, no para el contenido óptimo.

Este cambio convierte el hook en un **asistente de continuidad conversacional**: un único toast que, en lugar de ser una señal de estado, entrega un mensaje orientado a facilitar el siguiente paso del usuario. El diseño también prepara la arquitectura para la Fase 2 (TTS), donde el texto completo generado será narrado por un sistema de voz que leerá `sessions/.last-continuity-message.txt`.

Archivos centrales afectados:
- `scripting/stop-hook-ux.ts` — orquestador
- `scripting/stop-work-summary-notification.ts` — lógica de extracción, generación y notificación
- `tests/scripting/stop-hook-ux.test.ts`
- `tests/scripting/stop-work-summary-notification.test.ts`
- `docs/notifications.md`, `README.md`

## Goals / Non-Goals

**Goals:**
- Eliminar el primer toast de señal de estado y emitir un único toast con mensaje de continuidad.
- Extraer el contexto del workflow actual + turno previo desde el transcript JSONL de Claude Code.
- Reformular el prompt de Haiku para cubrir tres dimensiones: qué se completó, qué está abierto, y la dirección del siguiente prompt.
- Eliminar el tope de 320 chars en la generación; truncar solo en el display del toast (≤ 250 chars).
- Persistir el texto completo en `sessions/.last-continuity-message.txt` como punto de integración para TTS.
- Mantener la robustez ante fallos: si el modelo, el transcript o la escritura en disco fallan, el toast se emite igual (con fallback).

**Non-Goals:**
- Implementar el sistema TTS (Fase 2; este cambio solo genera el archivo que TTS consumirá).
- Modificar el CLI de notificaciones `src/2-services/notifications/cli.ts`.
- Modificar el gateway, el endpoint `POST /hooks` ni la lógica de correlación de workflows.
- Cambiar el comportamiento de otros hooks del lifecycle (`UserPromptSubmit`, `SubagentStop`, etc.).
- Persistencia histórica de mensajes de continuidad (el archivo se sobreescribe en cada `Stop`).

## Decisions

### D1: Fuente de contexto — transcript JSONL como fuente principal

**Decisión:** `extractWorkflowContext` lee `transcript_path` del payload para obtener el workflow actual y el turno previo. `last_assistant_message` se mantiene como fallback si `transcript_path` falta o falla.

**Alternativas consideradas:**
- *Solo `last_assistant_message`*: insuficiente para turnos largos con múltiples steps; el último mensaje solo dice "listo" sin contexto del trabajo realizado.
- *Leer los archivos de sesión del gateway (`sessions/<id>/workflows/NN/`)*: requiere conocer el número de workflow activo, que el hook no recibe directamente; añade acoplamiento al layout del gateway.
- *Transcript completo sin filtrar*: podría ser muy largo (sesiones de muchos workflows); necesario delimitar al workflow actual.

**Criterio de corte del transcript:** el último mensaje `role: 'user'` marca el inicio del workflow actual. El penúltimo mensaje `role: 'user'` marca el inicio del turno previo. Para el turno previo solo se retiene el prompt inicial + el último texto del asistente (compresión), evitando que el contexto se infle con steps intermedios del turno anterior.

### D2: Ruta del archivo de persistencia — ruta fija sin session_id

**Decisión:** `sessions/.last-continuity-message.txt` (ruta fija, sin subdirectorio de sesión).

**Alternativas consideradas:**
- *`sessions/<sessionId>*/last-continuity-message.txt`*: requiere el mismo match por prefijo que hace el statusline; añade complejidad a un script de scripting que ya tiene el `session_id` pero no sabe el sufijo del directorio. El valor para TTS es leer el mensaje más reciente, no uno específico de una sesión anterior.
- *Variable de entorno configurable*: YAGNI; TTS necesita una ruta fija y predecible para la integración en Fase 2.

**Nota:** `CLAUDE_PROJECT_DIR` provee la raíz del repo. El hook ya recibe esta variable expandida por Claude Code en el comando del hook.

### D3: Prompt de tres dimensiones en prosa continua

**Decisión:** Un único prompt que pide prosa en español sin markdown, cubriendo qué se completó, qué está abierto y la dirección del siguiente paso. No se pide una respuesta estructurada (secciones, listas, bullets).

**Rationale:** La prosa continua es compatible con TTS (lectura natural sin artefactos de formateo) y con el display del toast (no hay saltos de línea ni asteriscos). Si el modelo genera listas igualmente, `normalizeWhitespace` ya las colapsa.

**`max_tokens`:** 600 (sube desde 300). Un mensaje de continuidad rico con tres dimensiones necesita ~150-250 tokens; el margen extra cubre turnos con más contexto a narrar.

### D4: Gestión de `CLAUDE_PROJECT_DIR` en el orquestador

**Decisión:** `stop-hook-ux.ts` pasa `process.env.CLAUDE_PROJECT_DIR ?? ''` a `runContinuityNotification`. Si está vacío, `writeContinuityMessage` registra en stderr y no escribe; el toast se emite igual.

**Rationale:** `CLAUDE_PROJECT_DIR` lo expande Claude Code al lanzar el hook desde el proyecto. En tests, se puede inyectar vía el segundo argumento de la función (mismo patrón de inyección de dependencias que usa `deps` en `runStopWorkSummaryNotification` hoy).

### D5: Renombre `runStopWorkSummaryNotification` → `runContinuityNotification`

**Decisión:** Renombrar la función principal exportada para reflejar el propósito ampliado.

**Impacto:** Los tests que importan la función por nombre necesitan actualización. El mock en `stop-hook-ux.test.ts` también. No hay otras referencias externas al módulo (el orquestador es el único llamante en producción).

## Risks / Trade-offs

- **Latencia del toast:** El toast único aparece tras la llamada a Haiku (~1-3 s). Antes, el primer toast era inmediato. El usuario pierde el feedback instantáneo de fin de turno a cambio de un único mensaje más útil. Mitigación: Haiku es el modelo más rápido disponible; en la mayoría de los turnos el delay es imperceptible.

- **transcript_path puede no estar disponible:** Versiones anteriores de Claude Code o configuraciones no estándar podrían no incluir `transcript_path` en el payload. Mitigación: `last_assistant_message` es el fallback documentado; si ambos faltan, se emite el copy del catálogo.

- **Tamaño del transcript:** Sesiones largas con muchos workflows producen archivos JSONL grandes. Mitigación: la lectura es línea por línea (streaming con `createInterface`); solo se retienen los segmentos de los dos últimos workflows en memoria. El input al modelo está acotado por `MAX_INPUT_CHARS`.

- **`sessions/` puede no existir si el proxy no está corriendo:** `writeContinuityMessage` falla silenciosamente y registra en stderr. El toast se emite igual; TTS simplemente no encuentra el archivo. No es un error bloqueante.

- **Compatibilidad con instalación global:** La instalación global (`install:notifications`) sigue usando el doble comando `post-hook-event.ts` + `cli.ts` para `Stop`. Este cambio solo aplica al `.claude/settings.json` del proyecto. No hay rotura de instalaciones globales.
