# Session manager (Claude Code)

Scripts npm para gestionar sesiones de **Claude Code** en `~/.claude`, sin depender de Claude Code Router.

## Layout en disco

| Ruta | Contenido |
|------|-----------|
| `~/.claude/projects/{slug}/` | `{sessionId}.jsonl`, `sessions-index.json` |
| `~/.claude/archived-sessions/` | Sesiones archivadas (reversibles) |
| `~/.claude/sessions/*.json` | Sesiones **activas** (no archivar/eliminar) |
| `{slug}/{sessionId}/subagents/*.jsonl` | Historial de subagentes (sanitize) |

El `{slug}` codifica la ruta del proyecto (`C:\Foo\Bar` → `C--Foo-Bar`).

## Comandos npm

Desde la raíz del repositorio Smart Code Proxy:

| Script | Uso |
|--------|-----|
| `npm run sessions:list` | Lista sesiones del cwd (`--project` opcional) |
| `npm run sessions:archive -- <id> [--ids a,b]` | Archiva a `archived-sessions/` |
| `npm run sessions:delete -- <id> --force` | Elimina permanentemente |
| `npm run sessions:list-archived` | Lista archivadas |
| `npm run sessions:restore -- <id>` | Restaura al proyecto de origen |
| `npm run sessions:sanitize:scan` | Detecta thinking blocks con firma inválida |
| `npm run sessions:sanitize -- <id>` | Sanitiza una sesión |
| `npm run sessions:sanitize:all` | Lote (requiere `-- --force`) |

Ejemplos:

```bash
npm run sessions:list
npm run sessions:archive -- 3d4df093-4e7d-4819-88e9-b45157bff2dc
npm run sessions:delete -- 3d4df093-4e7d-4819-88e9-b45157bff2dc --force
npm run sessions:sanitize:scan
npm run sessions:sanitize -- 3d4df093-4e7d-4819-88e9-b45157bff2dc
```

## Sanitize y Smart Code Proxy

Al usar **Smart Code Proxy** con modelos distintos de los oficiales de Anthropic, los bloques `thinking` pueden guardarse con `signature` vacía o corta. Eso impide reanudar con la API oficial (`Invalid signature in thinking block`).

Este módulo elimina esos bloques (umbral: firma válida ≥ 200 caracteres). Tras sanitizar:

```bash
claude --resume <session-id>
```

## Migración desde `~/.claude/commands`

Los slash commands `/archive-session`, `/delete-session` y `/sanitize-session` (PowerShell) están sustituidos por estos scripts. Tras verificar paridad, se pueden eliminar los `.md` y `.ps1` legacy (ver checklist en `docs/issues/artifacts-drift.md`).

**No incluido:** `--this` ni marcadores en `pending-session-actions` (requerían hook SessionEnd).

## Checklist antes de eliminar legacy (`~/.claude`)

1. `npm run sessions:list` en este repo ≈ listado esperado en `/resume`
2. Archivar sesión inactiva → desaparece del listado; archivo en `archived-sessions/`
3. `npm run sessions:restore -- <id>` → `.jsonl` en slug correcto; `sessions-index.json` actualizado
4. `npm run sessions:delete -- <id> --force` → irreversible
5. `npm run sessions:sanitize:scan` detecta sesiones con firma corta (vía Smart Code Proxy)
6. Tras `sessions:sanitize`, `claude --resume <id>` sin error de thinking block

Si todo pasa, eliminar: `commands/archive-session.md`, `delete-session.md`, `sanitize-session.md`, `scripts/session-manager.ps1`, `scripts/sanitize-session.ps1`.
