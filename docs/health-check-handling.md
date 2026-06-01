# Peticiones sin sesión (pre-sesión)

Smart Code Proxy **no audita en disco** las peticiones que llegan sin cabecera de sesión válida. El proxy las reenvía al upstream con normalidad, pero no crea carpetas bajo `sessions/`.

Modelo de sesión y resolución de `session-id`: [`session-audit-model.md` §6](./session-audit-model.md#6-sesión-e-identificadores).

## Motivación

Claude Code (y otros clientes) envían a veces peticiones **antes** de establecer una sesión de trabajo real: comprobaciones de conectividad (`HEAD /`), listados (`GET /v1/models`), probes del runtime Bun, etc. Esas peticiones:

- Suelen no incluir `x-claude-code-session-id` ni `x-cc-audit-session`
- No aportan valor a la observabilidad de un turno de chat
- No deben contaminar `sessions/` con árboles vacíos

## Mecanismo real (código)

La resolución de sesión sigue esta prioridad (véase también [README — Correlación de sesión](../README.md#correlación-de-sesión-sessionid)):

1. Cabecera `x-cc-audit-session` (override)
2. Cabecera `x-claude-code-session-id` (fallback Claude Code)
3. Si ninguna está presente o está vacía → el resolver devuelve `sessionId: "_unknown"`

En `AuditWorkflowHandler.execute()`, si `auditSessionId === '_unknown'`, el handler **retorna `null` inmediatamente**:

- No se crea directorio de interacción
- No se escribe ningún archivo de auditoría
- El proxy continúa reenviando la petición al upstream

**Importante:** no existe filtrado adicional por User-Agent, body vacío ni `authorization`. Cualquier petición sin cabecera de sesión válida queda fuera de la auditoría, tenga o no token o cuerpo.

## Ejemplos habituales

```http
HEAD / HTTP/1.1
Host: 127.0.0.1:8787
```

```http
GET /v1/messages HTTP/1.1
Host: 127.0.0.1:8787
User-Agent: Bun/1.3.13
Accept: */*
```

Ambos resuelven a `_unknown` si no envían cabeceras de sesión y **no generan auditoría**.

## Qué sí se audita

Solo las peticiones con sesión identificada (cabecera override o fallback presente y no vacía) crean o actualizan árboles bajo:

- `sessions/<sessionId>/workflows/NN/` — cada ciclo auditado (turno `agentic`, preflight o `side-request` como workflow hermano)

`AuditWorkflowHandler` abre o continúa workflows vía `IWorkflowRepository.openWorkflow()`; no existe un “directorio de interacción” flat separado. Ver [`session-audit-model.md` §0](./session-audit-model.md#0-layout-vigente-causal-workflows-v1).

No se crea `sessions/_unknown/`.

## Endpoint `GET /health` del proxy

El proxy expone `GET /health` en el puerto local (p. ej. `8787`) para monitoreo del proceso. Es independiente del mecanismo anterior: no pasa por la lógica de auditoría de tráfico Anthropic.

## Troubleshooting

### No veo carpetas bajo `sessions/` al usar Claude Code

Comprueba que el cliente envía `x-claude-code-session-id` (o tu override) y que `ANTHROPIC_BASE_URL` apunta al proxy. Sin cabecera de sesión, el comportamiento esperado es **cero** escritura en `sessions/`.

### Quiero auditar peticiones sin cabecera de sesión

No hay variable de entorno para ello. Requeriría cambiar el código (p. ej. dejar de retornar `null` en `_unknown`) o adaptar las cabeceras de sesión en [`advanced-configuration.md`](./advanced-configuration.md); no es el diseño actual del proxy.

### Carpetas antiguas `sessions/_unknown/` en disco

Pueden ser restos de versiones anteriores o de otra herramienta. El código actual no las crea. Puedes eliminarlas con `npm run clean:sessions` si no las necesitas.

## Nota histórica

Versiones anteriores de la documentación describían un filtrado fino por User-Agent Bun, body vacío y ausencia de `authorization` (`isIgnorableHealthCheck`). **Esa lógica no está implementada** en el código actual: el único gate es la ausencia de cabecera de sesión → `_unknown` → sin auditoría.
