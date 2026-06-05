## Why

Cuando el hook se dispara desde **Cursor** (que también lee `~/.claude/settings.json`), el toast de `UserPromptSubmit` muestra mojibake: el prompt «Hola, ¿qué hace?» aparece como «Hola, Â¿quÃ© hace?». Desde **Claude Code** el mismo prompt se formatea correctamente.

Causa raíz confirmada por análisis de bytes: Cursor envía el payload del hook **doblemente codificado**. Toma los bytes UTF-8 del texto (`¿` = `C2 BF`, `é` = `C3 A9`), los reinterpreta como Latin-1/CP1252 (`Â¿`, `Ã©`) y reserializa *eso* como UTF-8 en el JSON que escribe a stdin. El pipeline del proxy (`readStdinBuffer` → `utf-8` → `JSON.parse` → formatter) es correcto y por eso propaga fielmente la corrupción ya introducida por Cursor. Claude Code emite UTF-8 limpio y no se ve afectado.

El fix de stdin único (`fix-notification-stdin-hook-relays`) resolvió la **carrera de stdin**; este change atiende un problema **distinto**: la doble codificación del cliente emisor.

## What Changes

- Nueva función pura `repairMojibake(text)` en `src/2-services/notifications/hook-payload-notification-message.ts`: detecta la firma «UTF-8 leído como Latin-1» y repara con `Buffer.from(text, 'latin1').toString('utf8')`, con guarda anti-`U+FFFD`.
- `resolveHookNotificationMessage` aplica `repairMojibake` al resultado de cualquier formatter. Es el embudo único por el que pasan ambos relays (`gateway-hook-notify`, `pre-tool-use-hook-ux`) y el CLI.
- Tests: reparación del caso Cursor, eñes/acentos, no-tocar UTF-8 correcto (Claude Code), no-tocar ASCII, e integración vía `resolveHookNotificationMessage`.

## Capabilities

### New Capabilities

_(ninguna — el comportamiento encaja en la capability existente)_

### Modified Capabilities

- `desktop-notifications-service`: el requirement de formatters incorpora la reparación de mojibake del payload antes de devolver el mensaje dinámico; los strings UTF-8 correctos pasan intactos.

## Impact

| Área | Archivos / sistemas |
|------|---------------------|
| PKA 2-services | `src/2-services/notifications/hook-payload-notification-message.ts` |
| Tests | `tests/2-services/notifications/hook-payload-notification-message.test.ts` |
| OpenSpec | Delta en este change; tras sync, `openspec/specs/desktop-notifications-service` refleja el contrato |

## No objetivos

- Arreglar la doble codificación en el origen (es un bug de Cursor, fuera del alcance del proxy).
- Reparar mojibake sobre el JSON crudo completo antes de `JSON.parse` (se opta por reparación dirigida al mensaje, con guarda, para no tocar payloads correctos).
- Cambiar la lectura de stdin de los relays o del CLI (ya UTF-8 por `fix-notification-stdin-hook-relays`).
