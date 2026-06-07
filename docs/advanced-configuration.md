# Configuración avanzada (sin variables de entorno)

El proxy expone pocas variables de entorno en [`configs/.env.example`](../configs/.env.example) y el [README](../README.md). Los comportamientos siguientes están **fijados en código**; para cambiarlos edita las constantes indicadas y vuelve a compilar/desplegar.

## Cabeceras de sesión y strip hacia upstream

| Constante                       | Archivo                                                                                     | Valor por defecto                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `AUDIT_SESSION_OVERRIDE_HEADER` | [`src/1-domain/constants/session-headers.ts`](../src/1-domain/constants/session-headers.ts) | `x-cc-audit-session`                                  |
| `AUDIT_SESSION_FALLBACK_HEADER` | mismo                                                                                       | `x-claude-code-session-id`                            |
| `STRIP_AUDIT_SESSION_HEADER`    | mismo                                                                                       | `true` (no reenvía la cabecera de sesión al upstream) |
| `AUDIT_SESSION_HASH_SUFFIX`     | mismo                                                                                       | `false` (sin sufijo `-<hash8>` en carpetas)           |

**Prioridad de resolución:** override → fallback Claude Code → `_unknown` (sin auditoría en disco).

**Cliente distinto a Claude Code:** envía una de esas cabeceras con el ID deseado, o renombra las constantes si tu runtime usa otro nombre.

**No hacer strip hacia upstream:** pon `STRIP_AUDIT_SESSION_HEADER = false` en `session-headers.ts`.

## Compresión hacia el upstream

El proxy **siempre** envía `Accept-Encoding: identity` al upstream ([`src/5-user-interfaces/http/proxy.routes.ts`](../src/5-user-interfaces/http/proxy.routes.ts)) para mantener auditoría legible.

Si el upstream responde con `Content-Encoding: gzip` de todos modos, el proxy descomprime hacia el cliente y hacia `sessions/` (véase el test de integración en `tests/5-user-interfaces/gzip-decompression.test.ts`).

Para depurar otro modo de negociación, modifica temporalmente `proxy.routes.ts`; no hay variable de entorno.

## Límites de bytes

| Concepto                                        | Origen                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Volcado en disco (request, response, `sse.txt`) | Env `MAX_AUDIT_BYTES` (default 50 MiB)                                                                         |
| Buffer en memoria para respuestas no-SSE        | Derivado: `max(MAX_AUDIT_BYTES, 100 MiB)` — ver [`audit-limits.ts`](../src/1-domain/constants/audit-limits.ts) |

**Buffer de memoria distinto al de disco:** edita `DEFAULT_PROXY_BUFFER_CEILING_BYTES` o `resolveProxyResponseBufferBytes()` en `audit-limits.ts`.

**Raw dump SSE ilimitado o desactivado:** el tope de `sse.txt` sigue `MAX_AUDIT_BYTES`; la reconstrucción usa `sse.jsonl` y no depende de `sse.txt`.

## Proveedores y Claude Code

- **Upstream del proxy:** `UPSTREAM_ORIGIN` en el entorno del **servidor** proxy.
- **Enrutar Claude Code al proxy:** `ANTHROPIC_BASE_URL` en el entorno de **Claude Code** (véase [how-to-start.md](how-to-start.md)).
