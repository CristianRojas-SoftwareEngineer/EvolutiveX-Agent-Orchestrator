# Crear comando/workflow espejo para Claude Code y Windsurf

Este comando crea una automatización espejo para ambos entornos: un command de Claude Code y un workflow de Windsurf que representen la misma intención operativa, pero respetando la estructura nativa recomendada de cada plataforma.

## Parámetros esperados

Puedes invocar este command con o sin argumentos en `$ARGUMENTS`. Con argumentos, Claude interpreta la descripción libre e inicia el proceso directamente. Sin argumentos, Claude solicita la información necesaria antes de continuar.

La descripción debe cubrir:

- **Nombre deseado**: Nombre base del command/workflow, en `kebab-case` si ya está definido.
- **Propósito**: Qué tarea repetitiva debe automatizar.
- **Entradas**: Parámetros que deberá pedir o aceptar.
- **Proceso**: Pasos esperados.
- **Salida**: Formato de respuesta esperado.
- **Restricciones**: Herramientas permitidas, validaciones, idioma, límites o convenciones especiales.

Si falta el nombre o el propósito, detente y pregunta antes de crear archivos. No inventes automatizaciones ambiguas.

## Objetivo

Crear simultáneamente:

1. Un command de Claude Code en `.claude/commands/{nombre}.md`.
2. Un workflow de Windsurf en `.windsurf/workflows/{nombre}.md`.

Ambos deben ser equivalentes en intención, pero no copias literales si la estructura del entorno exige diferencias.

## Estructura recomendada para Claude Code

El archivo de Claude Code debe ser un markdown autocontenido ubicado en `.claude/commands/`.

Usa esta estructura:

1. **H1** con el nombre funcional del command.
2. **Descripción breve** de la tarea.
3. **Parámetros esperados** (invocación, lista de parámetros, criterios de clarificación).
4. **Objetivo operativo**.
5. **Proceso paso a paso** con instrucciones ejecutables.
6. **Reglas de diseño y seguridad** específicas.
7. **Formato de entrega**.
8. **Verificación final**.

Puedes usar frontmatter de Claude Code solo si aporta valor claro, por ejemplo:

```yaml
---
description: Descripción breve visible para el command.
argument-hint: "[nombre] [descripción]"
---
```

Si no es necesario, omite el frontmatter para mantener el command simple.

## Estructura recomendada para Windsurf

El archivo de Windsurf debe ubicarse en `.windsurf/workflows/` y comenzar con frontmatter YAML.

Usa esta estructura:

```yaml
---
auto_execution_mode: 3
description: Descripción breve del workflow.
---
```

Después del frontmatter, incluye:

1. **H1** con `Workflow: {Nombre}`.
2. **Parámetros esperados** (invocación, lista de parámetros, criterios de clarificación).
3. **Objetivo**.
4. **Proceso** con pasos numerados.
5. **Formato de entrega**.
6. **Verificación final**.

Respeta el límite práctico de Windsurf: el workflow completo debe ser conciso y mantenerse bajo 12.000 caracteres.

## Reglas de creación espejo

1. **Nombre común**: Usa el mismo nombre base para ambos archivos, salvo que el usuario pida nombres distintos.
2. **Equivalencia semántica**: Ambos artefactos deben automatizar la misma tarea.
3. **Estructura nativa**: No fuerces el formato de Claude Code dentro de Windsurf ni el formato de Windsurf dentro de Claude Code.
4. **Idioma**: Escribe en español, conservando términos técnicos altamente estandarizados en inglés cuando traducirlos introduzca ambigüedad.
5. **No sobrescribir sin leer**: Antes de escribir, verifica si los archivos destino existen y lee su contenido. Si contienen información no vacía, pide confirmación antes de reemplazarla.
6. **Sin automatización especulativa**: No agregues pasos, herramientas o validaciones que el usuario no haya pedido o que no sean necesarias para el propósito declarado.

## Proceso

### Paso 1: Interpretar el requerimiento

Analiza `$ARGUMENTS` e identifica:

- Nombre base del command/workflow.
- Propósito.
- Entradas obligatorias.
- Pasos de ejecución.
- Salida esperada.
- Restricciones.

Si hay ambigüedad crítica, pregunta antes de continuar.

### Paso 2: Determinar rutas destino

Construye estas rutas:

- `.claude/commands/{nombre}.md`
- `.windsurf/workflows/{nombre}.md`

Usa `kebab-case` para el nombre si el usuario no entregó uno explícito.

### Paso 3: Verificar archivos existentes

Antes de escribir, comprueba si cada ruta destino ya existe y tiene contenido:

- Si el archivo no existe o está vacío: procede a crearlo.
- Si el archivo tiene contenido: muestra un resumen de lo existente y pide confirmación antes de reemplazarlo.

### Paso 4: Diseñar ambos artefactos

Diseña primero el comportamiento común. Luego adapta la redacción a cada entorno:

- Claude Code: command directo, orientado a ejecutar una tarea reusable desde `/nombre`.
- Windsurf: workflow secuencial, orientado a guiar a Cascade por una trayectoria de pasos.

### Paso 5: Escribir los archivos

Crea o actualiza ambos archivos solo cuando:

- El requerimiento esté claro.
- Las rutas destino estén definidas.
- No exista contenido previo no confirmado.

### Paso 6: Verificar consistencia

Comprueba que:

1. Ambos archivos existen.
2. Ambos comparten el mismo propósito.
3. El command de Claude Code no usa estructura inválida.
4. El workflow de Windsurf tiene `auto_execution_mode` y `description` en el frontmatter.
5. El workflow de Windsurf se mantiene por debajo de 12.000 caracteres.
6. La redacción está en español con términos técnicos en inglés solo cuando corresponda.

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
