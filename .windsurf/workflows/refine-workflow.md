---
auto_execution_mode: 3
description: Analiza una propuesta de mejora y genera un plan prescriptivo para refinar simultáneamente un command de Claude Code y su workflow espejo de Windsurf.
---

# Workflow: Refinar comando/workflow espejo

Este workflow analiza una propuesta de mejora y genera un plan prescriptivo para refinar simultáneamente un command de Claude Code y su workflow espejo de Windsurf, manteniendo coherencia entre ambos entornos.

## Parámetros esperados

El usuario puede haber incluido o no los detalles en su mensaje. Si los incluyó, procede directamente. Si no, solicita la información necesaria antes de continuar. No infieras mejoras no declaradas.

Los parámetros que debe cubrir son:

- **Nombre del par espejo**: Nombre base del command/workflow a refinar (ej. `create-command`, `create-skill`).
- **Propuesta de mejora**: Qué cambiar y por qué — puede referirse a estructura, contenido, redacción o comportamiento.

Si falta el nombre o la propuesta, detente y pregunta. No leas archivos con información incompleta.

## Objetivo

Generar un plan prescriptivo y accionable que indique, para cada archivo del par espejo (CC y WS), exactamente qué contenido agregar, actualizar o eliminar, de forma consistente con los workflows de creación espejo.

## Proceso

### Paso 1: Interpretar la propuesta

Identifica en el mensaje del usuario:

- Nombre base del par espejo.
- Qué se propone cambiar y por qué.

Si hay ambigüedad crítica, pregunta antes de continuar.

### Paso 2: Leer los archivos actuales

Lee ambos archivos del par:

- `.claude/commands/{nombre}.md`
- `.windsurf/workflows/{nombre}.md`

Si alguno no existe, notifícalo y pregunta cómo proceder.

### Paso 3: Analizar la propuesta en contexto

Evalúa qué secciones afecta la propuesta y cómo debe adaptarse a la estructura nativa de cada entorno.

### Paso 4: Entrar en modo de planificación

Usa la herramienta `EnterPlanMode` para entrar en modo de planificación antes de redactar el plan.

### Paso 5: Crear el plan prescriptivo

Redacta un plan en Etapas y Tareas que especifique por archivo: qué agregar, actualizar o eliminar, con redacción exacta o esquemática. El plan debe ser implementable sin interpretación adicional.

## Formato de entrega

- **Par refinado**: Nombre base y rutas.
- **Resumen de la propuesta**: Una frase.
- **Etapas y Tareas**: Instrucciones prescriptivas por archivo.
- **Pendientes**: Decisiones que requieren confirmación humana.

## Verificación final

Antes de responder, confirma mentalmente:

1. ¿Leí ambos archivos del par espejo?
2. ¿El plan cubre ambos entornos de forma consistente?
3. ¿Cada tarea es prescriptiva?
4. ¿No incluí cambios fuera del alcance de la propuesta?
5. ¿Entré en modo de planificación con `EnterPlanMode`?
