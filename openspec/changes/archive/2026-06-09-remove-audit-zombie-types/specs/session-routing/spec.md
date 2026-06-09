## ADDED Requirements

### Requirement: Retiro del módulo audit-paths.ts

El sistema SHALL NOT incluir el archivo `src/1-domain/constants/audit-paths.ts`. Las constantes
de rutas del layout `causal-workflows-v1` SHALL provenir exclusivamente de
`src/2-services/session-routing.ts` y de literales locales en servicios que lo requieran.

El comentario de cabecera en `session-routing.ts` SHALL describir que `audit-paths.ts` fue
retirado (no que aún existe como módulo reemplazable).

Referencia: spec vigente en `openspec/specs/session-routing/spec.md` — funciones puras de routing.

#### Scenario: Archivo audit-paths ausente

- **WHEN** se inspecciona el árbol `src/1-domain/constants/`
- **THEN** el archivo `audit-paths.ts` SHALL NOT existir

#### Scenario: Cero imports de audit-paths

- **WHEN** se buscan referencias a `audit-paths` bajo `src/` y `tests/`
- **THEN** NO SHALL existir sentencias `import` ni `from '...audit-paths...'`

#### Scenario: Routing sigue operativo

- **WHEN** se invocan `getWorkflowDir`, `getStepDir` y `getToolDir` desde `session-routing.ts`
- **THEN** las rutas generadas SHALL coincidir con el layout `causal-workflows-v1` documentado en `session-audit-model.md`
