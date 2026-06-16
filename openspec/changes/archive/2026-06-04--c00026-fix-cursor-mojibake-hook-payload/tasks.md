# Tasks: fix-cursor-mojibake-hook-payload

> Estado: implementación ya aplicada y verificada manualmente (toast correcto desde Cursor); checkboxes marcados para trazabilidad pre-commit.

## 1. Reparación de mojibake

- [x] 1.1 Añadir `repairMojibake(text)` con firma de detección y guarda anti-`U+FFFD`
- [x] 1.2 Aplicar `repairMojibake` en `resolveHookNotificationMessage` (embudo único)

## 2. Tests

- [x] 2.1 Casos de `repairMojibake`: reparación Cursor, eñes/acentos, UTF-8 correcto intacto, ASCII intacto
- [x] 2.2 Integración: `resolveHookNotificationMessage('UserPromptSubmit', …)` repara el prompt

## 3. OpenSpec y despliegue

- [x] 3.1 Change `fix-cursor-mojibake-hook-payload` (proposal, specs, tasks)
- [x] 3.2 `openspec validate fix-cursor-mojibake-hook-payload --strict`
- [x] 3.3 Sync → fusionar delta en `openspec/specs/desktop-notifications-service`
- [ ] 3.4 Commit del working tree
