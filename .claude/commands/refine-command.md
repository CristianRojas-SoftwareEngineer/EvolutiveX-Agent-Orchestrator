# Refinar comando/workflow espejo

Este comando analiza una propuesta de mejora y genera un plan prescriptivo para refinar simultáneamente un command de Claude Code y su workflow espejo de Windsurf, manteniendo coherencia entre ambos entornos.

## Parámetros esperados

Puedes invocar este command con o sin argumentos en `$ARGUMENTS`. Con argumentos, Claude interpreta la propuesta e inicia el análisis directamente. Sin argumentos, Claude solicita la información necesaria antes de continuar.

La descripción debe cubrir:

- **Nombre del par espejo**: Nombre base del command/workflow a refinar (ej. `create-command`, `create-skill`).
- **Propuesta de mejora**: Qué cambiar y por qué — puede referirse a estructura, contenido, redacción o comportamiento.

Si falta el nombre o la propuesta, detente y pregunta antes de leer archivos. No infieras mejoras no declaradas.

## Objetivo operativo

Generar un plan prescriptivo y accionable que indique, para cada archivo del par espejo (CC y WS), exactamente qué contenido agregar, actualizar o eliminar, de forma consistente con los comandos de creación espejo (`create-command`, `create-skill`).

## Proceso paso a paso

### Paso 1: Interpretar la propuesta

Analiza `$ARGUMENTS` e identifica:

- Nombre base del par espejo.
- Qué se propone cambiar.
- Motivación o criterio detrás del cambio.

Si hay ambigüedad crítica, pregunta antes de continuar.

### Paso 2: Leer los archivos actuales

Lee ambos archivos del par:

- `.claude/commands/{nombre}.md`
- `.windsurf/workflows/{nombre}.md`

Si alguno no existe, notifícalo y pregunta cómo proceder.

### Paso 3: Analizar la propuesta en contexto

Con los archivos leídos, evalúa:

- Qué secciones o contenido afecta la propuesta.
- Cómo debe adaptarse la misma mejora a la estructura nativa de cada entorno.
- Si hay inconsistencias entre los archivos actuales que conviene corregir en el mismo paso.

### Paso 4: Entrar en modo de planificación

Usa la herramienta `EnterPlanMode` para entrar en modo de planificación antes de redactar el plan.

### Paso 5: Crear el plan prescriptivo

Redacta un plan estructurado en Etapas y Tareas que especifique, para cada archivo del par:

- Qué agregar (contenido nuevo con redacción exacta o esquemática).
- Qué actualizar (sección afectada, texto actual → texto propuesto).
- Qué eliminar (identificando el bloque exacto a remover).

El plan debe ser suficientemente prescriptivo para implementarse sin interpretación adicional.

## Reglas de diseño

1. **Simetría**: Toda mejora debe reflejarse en ambos entornos, adaptada a su estructura nativa.
2. **Sin sobrescritura no declarada**: No incluyas en el plan cambios fuera del alcance de la propuesta.
3. **Consistencia con creación**: Los cambios propuestos deben ser coherentes con la estructura que definen `create-command.md` y `create-skill.md`.
4. **Idioma**: Plan en español; términos técnicos altamente estandarizados en inglés cuando traducirlos introduzca ambigüedad.
5. **Solo planificar**: Este command produce un plan, no implementa cambios directamente.

## Formato de entrega

El plan debe incluir:

- **Par refinado**: Nombre base y rutas de los dos archivos.
- **Resumen de la propuesta**: Una frase que describa el cambio.
- **Etapas y Tareas**: Pasos numerados con instrucciones prescriptivas por archivo.
- **Pendientes**: Decisiones que requieren confirmación humana antes de implementar.

## Verificación final

Antes de responder, confirma mentalmente:

1. ¿Leí ambos archivos del par espejo?
2. ¿El plan cubre los dos entornos de forma consistente?
3. ¿Cada tarea es prescriptiva y no requiere interpretación adicional?
4. ¿No incluí cambios fuera del alcance de la propuesta?
5. ¿Entré en modo de planificación con `EnterPlanMode` antes de redactar el plan?
