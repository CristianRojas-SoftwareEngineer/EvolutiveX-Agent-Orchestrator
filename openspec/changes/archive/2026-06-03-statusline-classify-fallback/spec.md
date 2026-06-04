# Spec: Fallback heurístico en classifyModelWithEnv

## Requisito: Clasificación con vars ausentes (fallback heurístico)

### Scenario: Fallback activo — modelo haiku

- **GIVEN** `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` están vacías o ausentes
- **AND** `modelId` contiene el término `"haiku"`
- **THEN** `classifyModelWithEnv` SHALL retornar `'lite'`

### Scenario: Fallback activo — modelo opus

- **GIVEN** las tres variables están vacías o ausentes
- **AND** `modelId` contiene el término `"opus"`
- **THEN** `classifyModelWithEnv` SHALL retornar `'reasoning'`

### Scenario: Fallback activo — modelo sonnet

- **GIVEN** las tres variables están vacías o ausentes
- **AND** `modelId` contiene el término `"sonnet"`
- **THEN** `classifyModelWithEnv` SHALL retornar `'standard'`

### Scenario: Fallback activo — modelo sin término conocido

- **GIVEN** las tres variables están vacías o ausentes
- **AND** `modelId` no contiene `"haiku"`, `"opus"` ni `"sonnet"`
- **THEN** `classifyModelWithEnv` SHALL retornar `null`

### Scenario: Fallback no activo — alguna var configurada

- **GIVEN** al menos una de las tres variables tiene valor no vacío
- **THEN** el fallback heurístico NO se activa
- **AND** solo aplica la comparación por includes contra las vars configuradas

### Scenario: Prioridad en fallback

- **GIVEN** las tres variables están vacías o ausentes
- **AND** `modelId` contiene tanto `"opus"` como `"sonnet"`
- **THEN** `classifyModelWithEnv` SHALL retornar `'reasoning'` (opus tiene prioridad)

### Scenario: Métricas end-to-end con fallback

- **GIVEN** `session-metrics.json` contiene modelos con `"claude-sonnet-4-6"` y `"claude-haiku-4-5-20251001"`
- **AND** `settingsEnv` está vacío (sin vars configuradas)
- **THEN** `aggregateSessionMetrics` SHALL retornar contadores `> 0` en los niveles correctos
