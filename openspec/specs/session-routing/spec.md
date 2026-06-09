# session-routing Specification

## Purpose

Funciones puras de mapeo de eventos a rutas de directorio para el layout `causal-workflows-v1`. Módulo canónico de routing (el antiguo `audit-paths.ts` fue retirado). Implementado en fase P1 (2026-05-30).

## Requirements

### Requirement: Funciones de routing de sesión

El sistema SHALL proveer en `src/2-services/session-routing.ts` las siguientes funciones puras:

- `getWorkflowDir(sessionId: string, workflowIndex: number): string` — devuelve `sessions/<sessionId>/workflows/<NN>/` donde NN es el índice con zero-padding. El parámetro `workflowIndex` SHALL ser **base 1** (primer turno = `1` → `workflows/01/`).
- `getStepDir(sessionId: string, workflowIndex: number, stepIndex: number): string` — devuelve `sessions/<sessionId>/workflows/<NN>/steps/<MM>/`. El parámetro `stepIndex` SHALL ser **base 1** (primer step = `1` → `steps/01/`).
- `getToolsDir(sessionId: string, workflowIndex: number, stepIndex: number): string` — devuelve `sessions/<sessionId>/workflows/<NN>/steps/<MM>/tools/`.
- `getToolDir(sessionId: string, workflowIndex: number, stepIndex: number, toolIndex: number, toolName: string): string` — devuelve `sessions/<sessionId>/workflows/<NN>/steps/<MM>/tools/<KK-slug>/`. El parámetro `toolIndex` SHALL ser **base 1**.

Las funciones SHALL formatear el entero recibido directamente con `pad()` **sin** sumar ni restar offset oculto.

#### Scenario: getWorkflowDir genera ruta base 1

- **WHEN** se invoca `getWorkflowDir('sess-abc', 1)`
- **THEN** el resultado SHALL ser `'sessions/sess-abc/workflows/01/'`

#### Scenario: getStepDir genera ruta base 1

- **WHEN** se invoca `getStepDir('sess-abc', 1, 1)`
- **THEN** el resultado SHALL ser `'sessions/sess-abc/workflows/01/steps/01/'`

#### Scenario: getToolDir genera ruta con slug normalizado base 1

- **WHEN** se invoca `getToolDir('sess-abc', 1, 1, 1, 'Read')`
- **THEN** el resultado SHALL ser `'sessions/sess-abc/workflows/01/steps/01/tools/01-Read/'`

#### Scenario: Índices con zero-padding correcto

- **WHEN** se invoca `getWorkflowDir('sess-1', 10)`
- **THEN** el resultado SHALL contener `'workflows/10/'` (sin padding adicional para >= 10)

---

### Requirement: Normalización de slug de tool name

El sistema SHALL normalizar el nombre del tool para el slug del directorio: convertir a lowercase, reemplazar caracteres no alfanuméricos por guiones, y truncar a 32 caracteres. El formato SHALL ser `<KK>-<slug>` donde KK es el índice con zero-padding de 2 dígitos.

#### Scenario: Tool name con caracteres especiales

- **WHEN** se invoca `getToolDir('s', 1, 1, 2, 'my_custom.tool')`
- **THEN** el slug SHALL ser `'02-my-custom-tool'`

#### Scenario: Tool name largo se trunca

- **WHEN** se invoca `getToolDir('s', 1, 1, 1, 'A'.repeat(50))`
- **THEN** el slug SHALL tener máximo 35 caracteres (índice + guión + 32 de slug)

---

### Requirement: Retiro del módulo audit-paths.ts

El sistema SHALL NOT incluir el archivo `src/1-domain/constants/audit-paths.ts`. Las constantes
de rutas del layout `causal-workflows-v1` SHALL provenir exclusivamente de
`src/2-services/session-routing.ts` y de literales locales en servicios que lo requieran.

El comentario de cabecera en `session-routing.ts` SHALL describir que `audit-paths.ts` fue
retirado (no que aún existe como módulo reemplazable).

#### Scenario: Archivo audit-paths ausente

- **WHEN** se inspecciona el árbol `src/1-domain/constants/`
- **THEN** el archivo `audit-paths.ts` SHALL NOT existir

#### Scenario: Cero imports de audit-paths

- **WHEN** se buscan referencias a `audit-paths` bajo `src/` y `tests/`
- **THEN** NO SHALL existir sentencias `import` ni `from '...audit-paths...'`

#### Scenario: Routing sigue operativo

- **WHEN** se invocan `getWorkflowDir`, `getStepDir` y `getToolDir` desde `session-routing.ts`
- **THEN** las rutas generadas SHALL coincidir con el layout `causal-workflows-v1` documentado en `session-audit-model.md`
