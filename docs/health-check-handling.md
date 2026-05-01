# Manejo de Health Checks

Smart Code Proxy detecta y filtra automáticamente los health checks de conectividad que el runtime Bun de Claude Code envía antes de establecer una sesión real de trabajo.

## Motivación

Claude Code (a través de su runtime Bun interno) envía ocasionalmente peticiones de prueba para verificar que el proxy está disponible antes de iniciar una conversación. Estas peticiones:

- No contienen cuerpo de petición
- No incluyen autenticación
- No tienen headers de sesión de Claude Code
- Retornan errores 404 porque no son peticiones válidas de la API Anthropic

Sin filtrado, estas peticiones crean directorios `_unknown/` con interacciones vacías que contaminan el directorio de auditoría sin aportar valor a la observabilidad.

## Criterios de Detección

Un request se clasifica como health check (y se ignora silenciosamente) si cumple **TODAS** estas condiciones:

| Condición           | Descripción                                                    |
| ------------------- | -------------------------------------------------------------- |
| User-Agent          | Contiene "Bun" pero **NO** contiene "claude-cli"               |
| Body vacío          | `rawBody.length === 0`                                         |
| Sin autorización    | Ausencia de header `authorization`                             |
| Sin sesión          | Ausencia de `x-claude-code-session-id` y `x-cc-audit-session`  |
| Fallback `_unknown` | La sesión resuelta es `_unknown` (fallback final del resolver) |

## Comportamiento

Cuando se detecta un health check:

1. El handler `AuditInteractionHandler.execute()` retorna `null` inmediatamente
2. **No se crea directorio de interacción**
3. **No se escribe ningún archivo de auditoría**
4. El proxy continúa operando normalmente

## Ejemplo de Request Filtrado

```http
GET /v1/messages HTTP/1.1
Host: 127.0.0.1:8787
User-Agent: Bun/1.3.13
Accept: */*
Connection: keep-alive
Accept-Encoding: identity
```

Este request típico de Bun sería filtrado porque:

- User-Agent es "Bun/1.3.13" (sin "claude-cli")
- No tiene body
- No tiene `authorization`
- No tiene headers de sesión
- Resuelve a `_unknown`

## Requests que NO son Filtrados

Los siguientes requests **sí se auditan** aunque vengan de Bun o caigan en `_unknown`:

- Requests con header `authorization` (peticiones autenticadas)
- Requests con body no vacío (peticiones de API reales)
- Requests con User-Agent de `claude-cli` (sesiones reales de Claude Code)

## Implementación

La lógica de detección está en `AuditInteractionHandler.isIgnorableHealthCheck()`:

```typescript
private isIgnorableHealthCheck(
  params: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer },
  auditSessionId: string,
): boolean {
  // Todos los criterios deben cumplirse
  if (auditSessionId !== '_unknown') return false;
  if (params.rawBody.length > 0) return false;
  const userAgent = this.getHeaderValue(params.headers, 'user-agent') || '';
  if (!userAgent.includes('Bun') || userAgent.includes('claude-cli')) return false;
  if (this.getHeaderValue(params.headers, 'authorization')) return false;
  if (this.getHeaderValue(params.headers, 'x-claude-code-session-id')) return false;
  if (this.getHeaderValue(params.headers, 'x-cc-audit-session')) return false;
  return true;
}
```

## Casos de Borde

### ¿Qué pasa si Claude Code cambia su User-Agent?

Si Claude Code envía peticiones legítimas sin el header `claude-cli` en el User-Agent, pero **con** cuerpo de petición o **con** autorización, estas peticiones **no serán filtradas** porque el criterio de body vacío y ausencia de auth prevalece.

### ¿Y si un cliente alternativo usa Bun?

Si otro cliente basado en Bun envía peticiones válidas de la API Anthropic (con autorización y body), estas serán auditadas correctamente porque el criterio de autorización o body no vacío evita el filtrado.

## Troubleshooting

### Problema: Veo directorios `_unknown/` creados

**Causa probable:** El criterio de filtrado no está capturando todos los casos.

**Diagnóstico:** Verifica los `request/headers.json` en los directorios `_unknown/`:

```bash
cat sessions/_unknown/interactions/000001_*/request/headers.json
```

Si el request tiene `user-agent: Bun/...` pero **no** fue filtrado, verifica si tiene algún campo que evita el filtrado (authorization, body no vacío, o headers de sesión).

### Problema: Quiero desactivar el filtrado

No hay una variable de entorno para desactivar el filtrado. Si necesitas auditar estos requests, modifica temporalmente `isIgnorableHealthCheck()` para retornar `false` siempre.

## Historial de Cambios

- **v1.x**: Introducción del filtrado de health checks basado en Bun UA + body vacío + ausencia de auth/sesión
