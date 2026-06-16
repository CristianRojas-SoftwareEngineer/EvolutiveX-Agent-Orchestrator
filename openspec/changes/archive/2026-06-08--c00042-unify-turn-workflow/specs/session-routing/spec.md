## MODIFIED Requirements

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
