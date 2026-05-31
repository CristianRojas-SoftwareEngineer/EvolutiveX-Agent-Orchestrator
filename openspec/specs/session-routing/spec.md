# session-routing Specification

## Purpose

Funciones puras de mapeo de eventos a rutas de directorio para el layout `causal-workflows-v1`. Reemplaza las constantes flat retiradas de `audit-paths.ts` (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`). Implementado en fase P1 (2026-05-30).

## Requirements

### Requirement: Funciones de routing de sesión

El sistema SHALL proveer en `src/2-services/session-routing.ts` las siguientes funciones puras:

- `getWorkflowDir(sessionId: string, workflowIndex: number): string` — devuelve `sessions/<sessionId>/workflows/<NN>/` donde NN es el índice con zero-padding.
- `getStepDir(sessionId: string, workflowIndex: number, stepIndex: number): string` — devuelve `sessions/<sessionId>/workflows/<NN>/steps/<MM>/`.
- `getToolsDir(sessionId: string, workflowIndex: number, stepIndex: number): string` — devuelve `sessions/<sessionId>/workflows/<NN>/steps/<MM>/tools/`.
- `getToolDir(sessionId: string, workflowIndex: number, stepIndex: number, toolIndex: number, toolName: string): string` — devuelve `sessions/<sessionId>/workflows/<NN>/steps/<MM>/tools/<KK-slug>/`.

#### Scenario: getWorkflowDir genera ruta correcta

- **WHEN** se invoca `getWorkflowDir('sess-abc', 0)`
- **THEN** el resultado SHALL ser `'sessions/sess-abc/workflows/00/'`

#### Scenario: getStepDir genera ruta correcta

- **WHEN** se invoca `getStepDir('sess-abc', 1, 3)`
- **THEN** el resultado SHALL ser `'sessions/sess-abc/workflows/01/steps/03/'`

#### Scenario: getToolDir genera ruta con slug normalizado

- **WHEN** se invoca `getToolDir('sess-abc', 0, 0, 0, 'Read')`
- **THEN** el resultado SHALL ser `'sessions/sess-abc/workflows/00/steps/00/tools/00-Read/'`

#### Scenario: Índices con zero-padding correcto

- **WHEN** se invoca `getWorkflowDir('sess-1', 10)`
- **THEN** el resultado SHALL contener `'workflows/10/'` (sin padding adicional para >= 10)

---

### Requirement: Normalización de slug de tool name

El sistema SHALL normalizar el nombre del tool para el slug del directorio: convertir a lowercase, reemplazar caracteres no alfanuméricos por guiones, y truncar a 32 caracteres. El formato SHALL ser `<KK>-<slug>` donde KK es el índice con zero-padding de 2 dígitos.

#### Scenario: Tool name con caracteres especiales

- **WHEN** se invoca `getToolDir('s', 0, 0, 2, 'my_custom.tool')`
- **THEN** el slug SHALL ser `'02-my-custom-tool'`

#### Scenario: Tool name largo se trunca

- **WHEN** se invoca `getToolDir('s', 0, 0, 0, 'A'.repeat(50))`
- **THEN** el slug SHALL tener máximo 35 caracteres (índice + guión + 32 de slug)
