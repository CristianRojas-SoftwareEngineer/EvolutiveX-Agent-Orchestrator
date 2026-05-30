## 1. Inventario de componentes (Criterio 1)

- [x] 1.1 Documentar tabla de mapeo componente §28b/§40 → archivo destino en `src/` → fase (P1/P2) en `design.md`
- [x] 1.2 Documentar tabla de componentes legacy a retirar en P1 (`audit-writer.service.ts`, `session-store.service.ts`, `workflow-result-projector.service.ts`, constantes flat, tipos `ActiveInteraction`/`InteractionMetadata`)
- [x] 1.3 Verificar que §40 de `gateway-design.md` refleja la tabla de componentes objetivo

## 2. Puntos de emisión del correlador (Criterio 2)

- [x] 2.1 Documentar tabla de 6 mutaciones del correlador → evento §28b.3 en `design.md`
- [x] 2.2 Documentar emisión de `stream_chunk` por `AuditSseResponseHandler` (L3, no correlador)
- [x] 2.3 Documentar eventos diferidos a P2 (`session_start`, `step_inference_complete`, `step_closed`, `token_usage`, `session_complete`)
- [x] 2.4 Verificar que §28b.3 de `gateway-design.md` refleja el catálogo completo

## 3. Ownership del timer (Criterio 3)

- [x] 3.1 Documentar confirmación de que el timer de timeout de `ToolUse` permanece en el correlador (§24.1/G19) en `design.md`
- [x] 3.2 Documentar que `SessionPersistence` no implementa timer propio y consume el evento `tool_result` del bus
- [x] 3.3 Documentar que el timer actual de orphans (lazy, en siguiente request) es mecanismo distinto al timer de §24.1

## 4. Composition root (Criterio 4)

- [x] 4.1 Documentar estrategia de cableado en `composition-root.ts` en `design.md`: creación de `EventBus`, inyección en correlador, inyección en `SessionPersistence`
- [x] 4.2 Documentar patrón de inyección (dependencia explícita, correlador y `SessionPersistence` no se conocen)
- [x] 4.3 Documentar que `EventBus` es una sola instancia porarranque (no por sesión)

## 5. Corte limpio (Criterio 5)

- [x] 5.1 Documentar estrategia de eliminación de `sessions/` anterior en `design.md`
- [x] 5.2 Documentar punto de invocación (arranque del proxy, antes de registrar rutas)
- [x] 5.3 Documentar detección de layout antiguo (presencia de `main-agent/` o `interaction-sequence.json`)
- [x] 5.4 Documentar idempotencia de la eliminación

## 6. Validación y documentación

- [x] 6.1 Verificar que `design.md` cubre los 5 criterios del DoD de P0
- [x] 6.2 Verificar que §28b, §40, §42 de `gateway-design.md` reflejan el estado real tras el spike
- [x] 6.3 Verificar que el spike referencia las decisiones D1/D2/D3 como diseño fijado
- [x] 6.4 Ejecutar `migration-phase-gate` (gate documental, sin suite de tests)
