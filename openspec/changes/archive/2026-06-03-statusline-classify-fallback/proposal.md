# Propuesta: Fallback heurístico en classifyModelWithEnv para provider default

## Motivación

Con `configure-provider default` (OAuth nativo), las variables `ANTHROPIC_DEFAULT_HAIKU_MODEL`,
`ANTHROPIC_DEFAULT_SONNET_MODEL` y `ANTHROPIC_DEFAULT_OPUS_MODEL` quedan vacías en
`~/.claude/settings.json`. Sin ellas, `classifyModelWithEnv` retorna `null` para todo `modelId`
→ `aggregateSessionMetrics` descarta todos los registros → Tabla 2 siempre en cero.

## Decisión

Añadir un fallback heurístico en `classifyModelWithEnv` que se activa **solo cuando las tres
variables están ausentes o vacías**: usar los términos `"haiku"`, `"opus"` y `"sonnet"` como
substrings del nombre del modelo.

Esto cubre los modelos estándar de Anthropic (`claude-opus-4-8`, `claude-sonnet-4-6`,
`claude-haiku-4-5-20251001`) sin afectar providers externos cuyo esquema de nombres no sigue
esa convención.

Si al menos una variable tiene valor, el fallback no se activa y solo aplica el modo primario
(comparación por includes contra los valores configurados).
