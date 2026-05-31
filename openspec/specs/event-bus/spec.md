# event-bus Specification

## Purpose

Bus de eventos async in-process (pub/sub en memoria) que conecta el correlador con `SessionPersistence`. Patrón: emisor (correlador) → bus → suscriptor (persistencia). El bus es abstracto (`IEventBus` port en L1); el adapter concreto (`EventBus` en L2) gestiona suscriptores y pattern matching. Implementado en fase P1 (2026-05-30).

## Requirements

### Requirement: IEventBus — port abstracto de emisión/suscripción

El sistema SHALL proveer la interface `IEventBus` en `src/1-domain/repositories/IEventBus.ts` con los siguientes métodos:

- `publish(event: TelemetryEvent): void` — emite un evento a todos los suscriptores cuyo patrón coincida con `event.type`.
- `subscribe(pattern: string, callback: EventCallback): SubscriptionRef` — registra un suscriptor para eventos que coincidan con `pattern`. Devuelve un handle opaco para desuscripción.
- `unsubscribe(ref: SubscriptionRef): void` — elimina el suscriptor identificado por `ref`.

#### Scenario: publish entrega evento a suscriptor coincidente

- **GIVEN** un `EventBus` con un suscriptor registrado para el patrón `'workflow_start'`
- **WHEN** se invoca `publish({ type: 'workflow_start', sessionId: 's1', timestamp: '...', payload: {} })`
- **THEN** el callback del suscriptor SHALL ser invocado con el evento

#### Scenario: publish no entrega a suscriptor no coincidente

- **GIVEN** un `EventBus` con un suscriptor registrado para el patrón `'workflow_start'`
- **WHEN** se invoca `publish({ type: 'step_request', sessionId: 's1', timestamp: '...', payload: {} })`
- **THEN** el callback del suscriptor NO SHALL ser invocado

#### Scenario: unsubscribe desactiva el suscriptor

- **GIVEN** un suscriptor activo con `SubscriptionRef`
- **WHEN** se invoca `unsubscribe(ref)`
- **AND** se invoca `publish()` con un evento que coincidiría con el patrón
- **THEN** el callback del suscriptor NO SHALL ser invocado

---

### Requirement: Pattern matching de suscripciones

El sistema SHALL implementar un matcher de patrones en `src/1-domain/services/event-pattern-match.service.ts` con la función `matches(pattern: string, eventType: string): boolean` que soporte:

- `*` — wildcard que coincide con cualquier `eventType`.
- `prefix_*` — coincide con tipos que empiezan por `prefix_`.
- `*_suffix` — coincide con tipos que terminan por `_suffix`.
- Coincidencia exacta — si el patrón no contiene `*`, coincide solo si `pattern === eventType`.

#### Scenario: wildcard simple coincide con cualquier tipo

- **WHEN** se evalúa `matches('*', 'workflow_start')`
- **THEN** el resultado SHALL ser `true`

#### Scenario: prefix wildcard coincide con tipos que empiezan por el prefijo

- **WHEN** se evalúa `matches('workflow_*', 'workflow_start')`
- **THEN** el resultado SHALL ser `true`

#### Scenario: prefix wildcard no coincide con tipos que no empiezan por el prefijo

- **WHEN** se evalúa `matches('workflow_*', 'step_request')`
- **THEN** el resultado SHALL ser `false`

#### Scenario: suffix wildcard coincide con tipos que terminan por el sufijo

- **WHEN** se evalúa `matches('*_result', 'tool_result')`
- **THEN** el resultado SHALL ser `true`

#### Scenario: coincidencia exacta sin wildcard

- **WHEN** se evalúa `matches('workflow_start', 'workflow_start')`
- **THEN** el resultado SHALL ser `true`

#### Scenario: coincidencia exacta falla si no son iguales

- **WHEN** se evalúa `matches('workflow_start', 'workflow_complete')`
- **THEN** el resultado SHALL ser `false`

---

### Requirement: EventBus — adapter async in-process

El sistema SHALL implementar `EventBus` en `src/2-services/event-bus.service.ts` como adapter de `IEventBus`:

- SHALL almacenar suscriptores en una estructura `Map<pattern, Set<callback>>`.
- `publish()` SHALL iterar los suscriptores cuyo patrón coincida con `event.type` y ejecutar cada callback de forma fire-and-forget (sin await).
- Errores en callbacks SHALL registrarse en log sin propagarse al emisor.
- `subscribe()` SHALL devolver un `SubscriptionRef` opaco que permita desuscripción.
- La instancia SHALL ser única por arranque del proxy (no por sesión).

#### Scenario: publish ejecuta callbacks de forma fire-and-forget

- **GIVEN** un `EventBus` con un suscriptor que tarda 100ms en ejecutarse
- **WHEN** se invoca `publish()` con un evento coincidente
- **THEN** `publish()` SHALL retornar inmediatamente sin esperar al callback
- **AND** el callback SHALL ejecutarse de forma asíncrona

#### Scenario: error en un callback no afecta a otros suscriptores

- **GIVEN** un `EventBus` con dos suscriptores para el mismo patrón, donde el primero lanza un error
- **WHEN** se invoca `publish()` con un evento coincidente
- **THEN** el segundo suscriptor SHALL ejecutarse correctamente
- **AND** el error del primero SHALL registrarse en log

---

### Requirement: Tipos de telemetría

El sistema SHALL definir en `src/1-domain/types/telemetry.types.ts`:

- `TelemetryEvent`: `{ type: string, sessionId: string, workflowId?: string, timestamp: string, payload: unknown }`
- `EventCallback`: `(event: TelemetryEvent) => void | Promise<void>`
- `SubscriptionRef`: tipo opaco para identificar un suscriptor (puede ser `symbol`, `string` o `object`)

#### Scenario: TelemetryEvent tiene los campos requeridos

- **WHEN** se construye un `TelemetryEvent` con `type`, `sessionId` y `timestamp`
- **THEN** el objeto SHALL ser válido según el tipo
- **AND** `workflowId` y `payload` SHALL ser opcionales
