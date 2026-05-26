# OpenSpec + Claude Code

[OpenSpec](https://github.com/Fission-AI/OpenSpec) (spec-driven development) está instalado en este repositorio para proponer, aplicar y archivar cambios con trazabilidad en `openspec/`.

## Requisitos

- Node.js >= 20.19 (OpenSpec); el proxy en desarrollo recomienda Node >= 22.9 (véase [how-to-start.md](./how-to-start.md))
- CLI: `npm install -g @fission-ai/openspec@latest` (o `npx openspec` desde el proyecto)

## Estructura

```text
openspec/
├── config.yaml    # Contexto y reglas del proyecto
├── specs/         # Especificaciones (fuente de verdad)
└── changes/       # Cambios propuestos y archivo

.claude/
├── commands/opsx/           # Slash commands Claude Code (/opsx:<slug>.md)
└── skills/openspec-<slug>/ # Skills alineadas al slug del comando
```

> `.claude/` está en `.gitignore`. Tras clonar el repo, ejecuta `npx openspec init --tools claude --force` para regenerar comandos y skills locales.

## Convención de nombres

- Slash: `/opsx:<slug>` (p. ej. `/opsx:apply`)
- Comando: `.claude/commands/opsx/<slug>.md` (p. ej. `bulk-archive.md` para `/opsx:bulk-archive`)
- Skill: `.claude/skills/openspec-<slug>/` con `name: openspec-<slug>` en `SKILL.md`
- Meta (sin slash): `openspec-specialist` — enrutamiento, CLI, troubleshooting

## Comandos y skills (mapa canónico)

Reinicia Claude Code tras instalar o actualizar para cargar slash commands y skills.

| Slash | Uso breve | Skill |
|-------|-----------|-------|
| `/opsx:propose` | Crear change y generar proposal, specs, design, tasks | `openspec-propose` |
| `/opsx:explore` | Explorar ideas sin crear artefactos aún | `openspec-explore` |
| `/opsx:apply` | Implementar tasks del change activo | `openspec-apply` |
| `/opsx:sync` | Fusionar delta specs en `openspec/specs/` sin archivar | `openspec-sync` |
| `/opsx:archive` | Archivar change completado | `openspec-archive` |
| `/opsx:new` | Crear change vacío (scaffold) | `openspec-new` |
| `/opsx:continue` | Siguiente artefacto en orden de dependencias | `openspec-continue` |
| `/opsx:ff` | Todos los artefactos de planificación de una vez | `openspec-ff` |
| `/opsx:verify` | Verificar implementación frente a artefactos | `openspec-verify` |
| `/opsx:bulk-archive` | Archivar varios changes completados | `openspec-bulk-archive` |
| `/opsx:onboard` | Tutorial interactivo con el repo real | `openspec-onboard` |

Referencia ampliada en `.claude/skills/openspec-specialist/SKILL.md` (`<command_skill_map>`).

### Perfiles de workflow

- **Core (rápido):** propose, explore, apply, sync, archive
- **Expandido:** new, continue, ff, verify, bulk-archive, onboard

Este proyecto usa perfil `custom` con los 11 workflows (`openspec config list`).

## Tras `openspec update`

`openspec update` puede restaurar nombres legacy de skills (`openspec-apply-change`, `openspec-sync-specs`, …) y sobrescribir personalizaciones en `.claude/`.

```bash
npx openspec update
# o, para forzar regeneración:
npx openspec update --force
```

Después, si hace falta: renombra manualmente las carpetas a `openspec-<slug>` (convención en la tabla anterior), actualiza `name:` en cada `SKILL.md` y revisa si `openspec-specialist` conserva secciones custom (`<command_skill_map>`, `<routing>`, `<maintenance>`). El formato híbrido de artefactos sigue [artifact-structuring](../.claude/skills/artifact-structuring/SKILL.md).

## Ejemplo

```text
/opsx:propose refactor dominio gateway según docs/proposals/new-diseno-dominio-gateway-observabilidad.md
```

## CLI útil

```bash
openspec list                  # Cambios activos
openspec list --specs          # Specs
openspec new change "mi-change"
openspec status --change "mi-change"
openspec validate --all
openspec update               # Regenerar integración Claude
npx openspec update --force   # Regeneración forzada
```

## Configuración del proyecto

Edita [openspec/config.yaml](../openspec/config.yaml) para contexto (stack PKA, idioma, convenciones) y reglas por artefacto.
