---
auto_execution_mode: 3
description: Crea una skill espejo para Claude Code y Windsurf que encapsule la misma capacidad reutilizable, respetando la estructura nativa de cada entorno.
---

# Workflow: Crear skill espejo para Claude Code y Windsurf

Este workflow crea simultáneamente una skill para Claude Code y una skill para Windsurf que encapsulan la misma capacidad reutilizable, adaptando la redacción y el frontmatter a cada entorno.

## Parámetros esperados

El usuario puede haber incluido o no los detalles de la skill en su mensaje. Si los incluyó, procede directamente. Si no, solicita la información necesaria antes de continuar. No inventes una skill incompleta.

Los parámetros que debe cubrir son:

- **Nombre de la skill**: En `kebab-case`.
- **Propósito**: Cuándo y para qué debe usarse.
- **Activación**: Situaciones en las que el asistente debe invocarla.
- **Instrucciones**: Procedimiento o conocimiento que debe encapsular.
- **Recursos de soporte**: Archivos adicionales, plantillas o scripts necesarios.
- **Restricciones**: Herramientas, rutas, idioma, formato de salida o límites.

Si falta el nombre o el propósito, detente y pregunta. No crees archivos con información incompleta.

## Objetivo

Crear simultáneamente:

1. Una skill de Claude Code en `.claude/skills/{nombre}/SKILL.md`.
2. Una skill de Windsurf en `.windsurf/skills/{nombre}/SKILL.md`.

Si se requieren archivos de soporte (`reference.md`, `examples.md`, scripts), créalos dentro del directorio de cada skill con estructuras equivalentes.

## Estructura recomendada para skills de Claude Code

```text
.claude/skills/{nombre}/SKILL.md
```

Frontmatter requerido:

```yaml
---
name: nombre-en-kebab-case
description: >-
  Descripción que explique cuándo usar esta skill. Aparece en el system
  prompt para que Claude Code decida cuándo invocarla automáticamente.
---
```

Campos opcionales útiles si están justificados: `disable-model-invocation`, `allowed-tools`, `argument-hint`.

Secciones del cuerpo:

1. **Propósito**.
2. **Cuándo usar esta skill**.
3. **Entradas esperadas**.
4. **Proceso de trabajo**.
5. **Recursos de soporte**.
6. **Formato de entrega**.
7. **Verificación final**.

## Estructura recomendada para skills de Windsurf

```text
.windsurf/skills/{nombre}/SKILL.md
```

Frontmatter requerido:

```yaml
---
name: nombre-en-kebab-case
description: >-
  Descripción que ayude a Cascade a decidir cuándo usar la skill.
---
```

Secciones del cuerpo (mismas que Claude Code):

1. **Propósito**.
2. **Cuándo usar esta skill**.
3. **Entradas esperadas**.
4. **Proceso de trabajo**.
5. **Recursos de soporte**.
6. **Formato de entrega**.
7. **Verificación final**.

## Reglas de creación espejo

1. **Mismo nombre base**: Usa el mismo `{nombre}` en `.claude/skills/` y `.windsurf/skills/`.
2. **Misma capacidad**: Ambas skills deben enseñar la misma habilidad.
3. **Formato nativo**: Respeta los frontmatter y convenciones propias de cada entorno.
4. **Recursos equivalentes**: Si creas archivos de soporte, replícalos en ambos entornos salvo razón clara para no hacerlo.
5. **No sobrescribir sin leer**: Si algún archivo destino existe y no está vacío, pide confirmación antes de reemplazarlo.
6. **Idioma**: Español, salvo términos técnicos altamente estandarizados en inglés.
7. **Simplicidad**: No crees archivos de soporte si el contenido cabe claramente en `SKILL.md`.

## Proceso

### Paso 1: Interpretar la skill requerida

Identifica en el mensaje del usuario:

- Nombre.
- Descripción breve.
- Situaciones de uso.
- Procedimiento que debe seguir el asistente.
- Entradas y salidas.
- Recursos de soporte necesarios.

Si falta información crítica, pregunta antes de escribir.

### Paso 2: Determinar rutas destino

Define las rutas principales:

- `.claude/skills/{nombre}/SKILL.md`
- `.windsurf/skills/{nombre}/SKILL.md`

Y, si corresponde, archivos de soporte:

- `.claude/skills/{nombre}/reference.md`
- `.windsurf/skills/{nombre}/reference.md`

### Paso 3: Verificar archivos existentes

Antes de escribir, comprueba si cada ruta destino existe y tiene contenido:

- Si no existe o está vacío: procede a crearlo.
- Si tiene contenido: muestra un resumen y pide confirmación antes de reemplazarlo.

### Paso 4: Diseñar la skill común

Define el contenido conceptual compartido:

- Qué problema resuelve.
- Cuándo se activa.
- Qué pasos debe seguir.
- Qué salida produce.
- Qué límites debe respetar.

### Paso 5: Adaptar a cada entorno

Redacta la misma skill en dos versiones:

- **Claude Code**: redacción orientada a invocación automática por descripción matching y uso desde Claude Code.
- **Windsurf**: redacción orientada a Cascade, con frontmatter mínimo y activación por `@skill-name` o descripción matching.

### Paso 6: Crear archivos

Crea los directorios y archivos solo cuando el diseño esté completo y no haya conflictos sin confirmar.

### Paso 7: Verificar

Comprueba que:

1. Ambos `SKILL.md` tienen frontmatter válido con `name` y `description`.
2. Ambos describen la misma habilidad.
3. Las rutas son correctas.
4. No hay recursos de soporte innecesarios.
5. La redacción está en español con términos técnicos en inglés donde corresponda.

## Formato de entrega

Al finalizar, responde con:

- **Skills creadas o actualizadas**: Rutas principales.
- **Recursos de soporte**: Lista o "ninguno".
- **Propósito común**: Una frase.
- **Diferencias entre entornos**: Solo si existen.
- **Pendientes**: Decisiones no resueltas.

## Verificación final

Antes de responder, confirma mentalmente:

1. ¿Creé la skill para Claude Code?
2. ¿Creé la skill para Windsurf?
3. ¿Ambas respetan la estructura recomendada de su entorno?
4. ¿La skill no está sobre-diseñada?
5. ¿No sobrescribí contenido existente sin confirmación?
