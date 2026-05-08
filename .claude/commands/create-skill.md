# Crear skill espejo para Claude Code y Windsurf

Este comando crea una skill equivalente para Claude Code y Windsurf, respetando la estructura nativa de cada entorno. Su propósito es permitir que una misma capacidad reutilizable quede disponible en ambos asistentes sin duplicar manualmente el diseño.

## Parámetros esperados

Puedes invocar este command con o sin argumentos en `$ARGUMENTS`. Con argumentos, Claude interpreta la descripción libre e inicia el proceso directamente. Sin argumentos, Claude solicita la información necesaria antes de continuar.

La descripción debe cubrir:

- **Nombre de la skill**: En `kebab-case`.
- **Propósito**: Cuándo y para qué debe usarse.
- **Activación**: Situaciones en las que el asistente debe invocarla.
- **Instrucciones**: Procedimiento o conocimiento que debe encapsular.
- **Recursos de soporte**: Archivos adicionales, plantillas, ejemplos o scripts necesarios.
- **Restricciones**: Herramientas, rutas, idioma, formato de salida o límites.

Si falta el nombre, el propósito o las condiciones de uso, detente y pide clarificación. No inventes una skill incompleta.

## Objetivo

Crear simultáneamente:

1. Una skill de Claude Code en `.claude/skills/{nombre}/SKILL.md`.
2. Una skill de Windsurf en `.windsurf/skills/{nombre}/SKILL.md`.

Si se requieren archivos de soporte, créalos dentro del directorio de cada skill, manteniendo estructuras equivalentes cuando sea útil.

## Estructura recomendada para skills de Claude Code

Cada skill de Claude Code debe vivir en un directorio propio:

```text
.claude/skills/{nombre}/SKILL.md
```

El archivo `SKILL.md` debe comenzar con frontmatter YAML. Usa como base:

```yaml
---
name: nombre-en-kebab-case
description: Descripción breve que explique cuándo usar esta skill.
---
```

Campos opcionales útiles si están justificados:

- **`disable-model-invocation`**: Para impedir invocación automática si la skill solo debe usarse manualmente.
- **`allowed-tools`**: Para restringir herramientas cuando la skill tenga límites claros.
- **`argument-hint`**: Para indicar parámetros esperados.

Después del frontmatter, usa secciones claras:

1. **Propósito**.
2. **Cuándo usar esta skill**.
3. **Entradas esperadas**.
4. **Proceso de trabajo**.
5. **Recursos de soporte**.
6. **Formato de entrega**.
7. **Verificación final**.

## Estructura recomendada para skills de Windsurf

Cada skill de Windsurf debe vivir en un directorio propio:

```text
.windsurf/skills/{nombre}/SKILL.md
```

El archivo `SKILL.md` debe comenzar con frontmatter YAML con campos requeridos:

```yaml
---
name: nombre-en-kebab-case
description: Descripción breve que ayude a Cascade a decidir cuándo usar la skill.
---
```

Después del frontmatter, usa secciones claras:

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
4. **Recursos equivalentes**: Si creas `reference.md`, `examples.md`, plantillas o scripts, replica el recurso en ambos entornos salvo que haya una razón clara para no hacerlo.
5. **No sobrescribir sin leer**: Si algún archivo destino existe y no está vacío, pide confirmación antes de reemplazarlo.
6. **Idioma**: Escribe en español, salvo términos técnicos altamente estandarizados en inglés.
7. **Simplicidad**: No crees archivos de soporte si el contenido cabe claramente en `SKILL.md`.

## Proceso

### Paso 1: Interpretar la skill requerida

Analiza `$ARGUMENTS` e identifica:

- Nombre.
- Descripción breve.
- Situaciones de uso.
- Procedimiento que debe seguir el asistente.
- Entradas y salidas.
- Recursos de soporte necesarios.

Si falta información crítica, pregunta antes de escribir.

### Paso 2: Determinar rutas destino

Define:

- `.claude/skills/{nombre}/SKILL.md`
- `.windsurf/skills/{nombre}/SKILL.md`

Y, si corresponde:

- `.claude/skills/{nombre}/reference.md`
- `.windsurf/skills/{nombre}/reference.md`
- `.claude/skills/{nombre}/examples.md`
- `.windsurf/skills/{nombre}/examples.md`

### Paso 3: Verificar archivos existentes

Antes de escribir, comprueba si cada ruta destino ya existe y tiene contenido:

- Si el archivo no existe o está vacío: procede a crearlo.
- Si el archivo tiene contenido: muestra un resumen de lo existente y pide confirmación antes de reemplazarlo.

### Paso 4: Diseñar la skill común

Diseña primero el contenido conceptual común:

- Qué problema resuelve.
- Cuándo se activa.
- Qué pasos debe seguir.
- Qué salida produce.
- Qué límites debe respetar.

### Paso 5: Adaptar a cada entorno

Adapta la misma skill a:

- Claude Code: redacción orientada a skills invocables por Claude Code.
- Windsurf: redacción orientada a Cascade y su sistema de skills.

### Paso 6: Crear archivos

Crea los directorios y archivos necesarios solo cuando:

- El diseño esté completo.
- No haya conflictos no confirmados.
- Los archivos de soporte estén justificados.

### Paso 7: Verificar

Comprueba que:

1. Ambos `SKILL.md` tienen frontmatter válido.
2. Ambos incluyen `name` y `description`.
3. Ambos describen la misma habilidad.
4. Las rutas son correctas.
5. No hay recursos de soporte innecesarios.

## Formato de entrega

Al finalizar, responde con:

- **Skills creadas o actualizadas**: Rutas principales.
- **Recursos de soporte**: Lista o “ninguno”.
- **Propósito común**: Una frase.
- **Diferencias entre entornos**: Solo si existen.
- **Pendientes**: Decisiones no resueltas.

## Verificación final

Antes de responder, confirma mentalmente:

1. ¿Creé la skill para Claude Code?
2. ¿Creé la skill para Windsurf?
3. ¿Ambas respetan la estructura recomendada?
4. ¿La skill no está sobre-diseñada?
5. ¿No sobrescribí contenido existente sin confirmación?
