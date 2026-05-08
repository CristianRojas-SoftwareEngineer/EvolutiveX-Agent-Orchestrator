---
auto_execution_mode: 3
description: Crea una automatización espejo — un command de Claude Code y un workflow de Windsurf — que representen la misma intención operativa respetando la estructura nativa de cada entorno.
---

# Workflow: Crear command/workflow espejo para Claude Code y Windsurf

Este workflow crea simultáneamente un command de Claude Code y un workflow de Windsurf que automatizan la misma tarea, adaptando la redacción a la estructura nativa de cada entorno.

## Parámetros esperados

El usuario puede haber incluido o no los detalles en su mensaje. Si los incluyó, procede directamente. Si no, solicita la información necesaria antes de continuar. No inventes automatizaciones ni supongas propósitos no declarados.

Los parámetros que debe cubrir son:

- **Nombre deseado**: Nombre base en `kebab-case`.
- **Propósito**: Qué tarea repetitiva debe automatizar.
- **Entradas**: Parámetros que deberá pedir o aceptar.
- **Proceso**: Pasos esperados.
- **Salida**: Formato de respuesta esperado.
- **Restricciones**: Herramientas, validaciones, idioma, límites o convenciones especiales.

Si falta el nombre o el propósito, detente y pregunta. No crees archivos con información incompleta.

## Objetivo

Crear simultáneamente:

1. Un command de Claude Code en `.claude/commands/{nombre}.md`.
2. Un workflow de Windsurf en `.windsurf/workflows/{nombre}.md`.

Ambos deben ser equivalentes en intención pero respetar la estructura nativa de cada entorno.

## Estructura recomendada para Claude Code

El command debe ser un markdown autocontenido en `.claude/commands/`:

1. **H1** con el nombre funcional del command.
2. **Descripción breve** de la tarea.
3. **Parámetros esperados** (invocación, lista de parámetros, criterios de clarificación).
4. **Objetivo operativo**.
5. **Proceso paso a paso** con instrucciones ejecutables.
6. **Reglas de diseño y seguridad** específicas.
7. **Formato de entrega**.
8. **Verificación final**.

Frontmatter opcional de Claude Code (usar solo si aporta valor):

```yaml
---
description: Descripción breve visible para el command.
argument-hint: "[nombre] [descripción]"
---
```

## Estructura recomendada para Windsurf

El workflow debe ubicarse en `.windsurf/workflows/` con frontmatter obligatorio:

```yaml
---
auto_execution_mode: 3
description: Descripción breve del workflow.
---
```

Después del frontmatter:

1. **H1** con `Workflow: {Nombre}`.
2. **Parámetros esperados** (invocación, lista de parámetros, criterios de clarificación).
3. **Objetivo**.
4. **Proceso** con pasos numerados.
5. **Formato de entrega**.
6. **Verificación final**.

El workflow completo debe mantenerse bajo 12.000 caracteres.

## Reglas de creación espejo

1. **Nombre común**: Usa el mismo nombre base para ambos archivos.
2. **Equivalencia semántica**: Ambos artefactos automatizan la misma tarea.
3. **Estructura nativa**: No fuerces el formato de Claude Code dentro de Windsurf ni viceversa.
4. **Idioma**: Español, conservando términos técnicos estandarizados en inglés cuando traducirlos introduzca ambigüedad.
5. **No sobrescribir sin leer**: Verifica si los archivos destino existen y tienen contenido. Si no están vacíos, pide confirmación antes de reemplazarlos.
6. **Sin especulación**: No agregues pasos, herramientas ni validaciones que el usuario no haya pedido.

## Proceso

### Paso 1: Interpretar el requerimiento

Identifica en el mensaje del usuario:

- Nombre base del command/workflow.
- Propósito.
- Entradas obligatorias.
- Pasos de ejecución.
- Salida esperada.
- Restricciones.

Si hay ambigüedad crítica, pregunta antes de continuar.

### Paso 2: Determinar rutas destino

Construye las rutas:

- `.claude/commands/{nombre}.md`
- `.windsurf/workflows/{nombre}.md`

Usa `kebab-case` si el usuario no entregó un nombre explícito.

### Paso 3: Verificar archivos existentes

Antes de escribir, comprueba si cada ruta destino existe y tiene contenido:

- Si el archivo no existe o está vacío: procede a crearlo.
- Si el archivo tiene contenido: muestra un resumen de lo existente y pide confirmación antes de reemplazarlo.

### Paso 4: Diseñar ambos artefactos

Diseña primero el comportamiento común. Luego adapta la redacción:

- **Claude Code**: command directo con `$ARGUMENTS` para parámetros, invocable desde `/nombre`.
- **Windsurf**: workflow secuencial con solicitud explícita de parámetros al usuario, invocable desde `/nombre`.

### Paso 5: Escribir los archivos

Crea ambos archivos solo cuando el requerimiento esté claro, las rutas estén definidas y no haya contenido previo sin confirmar.

### Paso 6: Verificar consistencia

Comprueba que:

1. Ambos archivos existen en las rutas correctas.
2. Ambos comparten el mismo propósito.
3. El command de Claude Code no usa estructura inválida.
4. El workflow de Windsurf tiene `auto_execution_mode` y `description` en el frontmatter.
5. El workflow de Windsurf se mantiene bajo 12.000 caracteres.
6. La redacción está en español con términos técnicos en inglés donde corresponda.

## Formato de entrega

Al finalizar, responde con:

- **Archivos creados o actualizados**: Lista de rutas.
- **Propósito común**: Resumen de una frase.
- **Diferencias estructurales**: Qué se adaptó para cada entorno.
- **Pendientes**: Cualquier decisión que requiera revisión humana.

## Verificación final

Antes de responder, confirma mentalmente:

1. ¿Creé el command de Claude Code y el workflow de Windsurf?
2. ¿Ambos representan la misma automatización?
3. ¿Cada archivo respeta la estructura recomendada de su entorno?
4. ¿No sobrescribí contenido existente sin confirmación?
5. ¿La salida final es breve, clara y accionable?
