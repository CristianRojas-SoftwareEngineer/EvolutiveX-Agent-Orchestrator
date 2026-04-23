---
auto_execution_mode: 3
description: Genera un plan de desarrollo para Smart Code Proxy siguiendo la estructura estándar del proyecto (contexto, motivación, propósito, objetivos, requerimientos, cierre).
---

# Workflow: Crear plan de desarrollo para Smart Code Proxy

Este workflow te guía en la construcción de un plan de desarrollo siguiendo la estructura estándar establecida para el proyecto Smart Code Proxy. El objetivo es producir un plan completo, coherente y listo para ser ejecutado por un agente de implementación.

## Cómo operar este workflow

Al invocar este comando, el usuario puede haber incluido o no los requerimientos específicos del plan en su mensaje. Tu comportamiento depende de esto:

- **Si el usuario incluyó los requerimientos** junto con la invocación del comando, procede directamente a construir el plan completo integrando esos requerimientos en la "Sección variable".
- **Si el usuario NO incluyó los requerimientos**, solicítaselos explícitamente antes de generar el plan. Pregúntale por el problema a resolver, la mejora propuesta o la funcionalidad a implementar, y por cualquier restricción o contexto adicional que consideres necesario para dimensionar correctamente el alcance.

No generes un plan con requerimientos inventados o supuestos. Si hay ambigüedad en los requerimientos proporcionados, pide clarificación antes de continuar.

## Modelo conceptual del plan: dos fases claramente separadas

Antes de generar el plan, debes tener internalizada la siguiente distinción, que es el principio rector de este workflow:

- **Sección variable = tareas específicas del plan**. Son las tareas derivadas directamente de los requerimientos del usuario. Cambian de un plan a otro. Describen *qué* hay que construir, modificar o eliminar para resolver el requerimiento concreto.

- **Sección final = etapas invariantes de cierre**. Son pasos de higiene y consolidación que aplican a todo plan por igual, independientemente del requerimiento. No cambian de un plan a otro. Describen *cómo* se cierra cualquier implementación para preservar el estado canónico del proyecto.

Estas dos fases son **mutuamente excluyentes y secuenciales**: la sección variable se ejecuta primero y completa el trabajo específico; la sección final se ejecuta después y consolida el resultado. No hay solapamiento entre ambas.

### Reglas de no duplicación (críticas)

Estas reglas son de cumplimiento obligatorio al generar el plan:

1. **Nunca dupliques contenido entre la sección variable y la sección final**. Si una tarea pertenece conceptualmente a las etapas de cierre (eliminación de código zombie, validación de compilación/tests/linter, actualización de documentación, commit), va **únicamente** en la sección final. No la repliques como tarea variable.

2. **No adelantes etapas de cierre a la sección variable**. Aunque sea tentador incluir "validación" o "limpieza de zombie" como última tarea variable para que quede explícito que hay que hacerlo, no lo hagas: esa responsabilidad ya está cubierta por la sección final y duplicarla genera confusión sobre cuál es la fuente de verdad y en qué orden ejecutarlas.

3. **La sección variable termina cuando se completan los cambios específicos del requerimiento**. A partir de ahí, la continuación natural es la sección final, y así debe entenderlo el agente que ejecute el plan.

## Estructura obligatoria del plan generado

El plan que produzcas debe respetar la siguiente estructura completa, en este orden y sin omitir ninguna sección.

### 1. Consideraciones fundamentales para el razonamiento y diseño del plan

Esta sección es fija y debe incluirse íntegra al inicio de cada plan generado:

1. Es importante considerar que el proyecto "Smart Code Proxy" se encuentra en fase de desarrollo activo, por lo tanto, actualmente no hay ningún usuario, humano ni sistema que utilice o dependa de éste. Debido a esto, durante ésta fase la documentación histórica, la lógica legacy o la retrocompatibilidad no sólo no agregan valor al proyecto, sino que también le agregan complejidad innecesaria, y frenan su evolución.

2. Es necesario que el plan preserve el estado canónico del proyecto, evitando mantener lógica, código fuente, documentación histórica, características legacy o retrocompatibilidad innecesariamente. El proyecto, el diseño, la implementación, el código fuente, la documentación y las respectivas skills deben actualizarse de forma sincronizada, coherente y consistente, lo que implica que si tras la implementación del plan aún existe lógica legacy o código zombie que ya no se utilice, éste debe ser eliminado de la implementación y de la documentación consistentemente.

3. Tanto el plan como las tareas diseñadas para resolver los requerimientos definidos en la sección variable del plan, deben definir explícitamente cuál es la motivación, propósito y objetivos del plan o tarea. Esto ayudará al agente que implemente el plan a delimitar el alcance del análisis y de las modificaciones por realizar en el plan o tarea. Otra ventaja de explicitar estas cuestiones a nivel de plan y de tarea, es que para las ejecuciones largas de planes exhaustivos será más simple para el agente reconocer y recordar cuál es el propósito, objetivos y alcance de cada modificación.

### 2. Sección inicial del plan

Construye esta sección con cuatro subsecciones claramente delimitadas:

1. **Contexto del proyecto**: Escribe una breve síntesis sobre la arquitectura de alto nivel del proyecto Smart Code Proxy y las tecnologías que utiliza. Esta síntesis debe ser suficiente para que un agente que no conozca el proyecto pueda orientarse al leer el plan.

2. **Motivación del plan**: Explica el "por qué" del plan. Describe el problema identificado que se busca resolver, o la propuesta de mejora para el proyecto. Esta subsección responde a la pregunta: ¿qué gatilló la necesidad de este plan?

3. **Propósito del plan**: Explica el "para qué" del plan. Describe el resultado esperado tras la implementación. El propósito debe alinearse explícitamente con la motivación descrita arriba.

4. **Objetivos del plan**: Explica el "cómo" del plan a nivel de pasos de alto nivel, alineados con el propósito. **Importante**: los objetivos enumerados aquí deben describir únicamente el trabajo específico del plan (sección variable). No incluyas objetivos como "validar compilación", "eliminar código zombie" o "hacer commit", porque esas responsabilidades pertenecen a la sección final y ya están implícitas en toda implementación.

### 3. Sección variable del plan

Aquí integras **exclusivamente** los requerimientos específicos proporcionados por el usuario. Esta sección debe desglosarse en tareas individuales, y para cada tarea explicitarás su propia motivación, propósito y objetivos, siguiendo el mismo patrón que a nivel de plan. Esto asegura que el agente ejecutor preserve el foco incluso en implementaciones largas.

Alcance estricto de la sección variable:

- **Incluye**: modificaciones de código fuente requeridas por los requerimientos, cambios en interfaces o contratos afectados directamente, actualizaciones de tests que verifican específicamente el comportamiento modificado, y cualquier otra acción que sea consecuencia directa del requerimiento del usuario.
- **No incluye**: tareas de cierre genéricas (limpieza de zombie residual, validación global de compilación/tests/linter, actualización sincronizada de documentación transversal, commit). Todas esas responsabilidades se describen una única vez en la sección final.

Si los requerimientos del usuario son ambiguos, están incompletos o presentan contradicciones con las consideraciones fundamentales, detente y solicita clarificación antes de materializar esta sección.

### Manejo de decisiones de diseño durante la generación

Durante el análisis de los requerimientos puede que detectes puntos de decisión arquitectónica que el usuario no resolvió explícitamente (por ejemplo, elegir entre dos estrategias de implementación con trade-offs distintos, o decidir si conservar o no cierto comportamiento residual). Cuando esto ocurra:

1. **No resuelvas el punto de decisión unilateralmente** incrustando la decisión como un hecho dentro de una tarea.
2. **Detén la generación del plan** y plantea el punto de decisión al usuario, explicando las alternativas, sus trade-offs y tu recomendación si la tienes.
3. **Continúa la generación del plan solo después** de que el usuario haya resuelto el punto de decisión.

Esto preserva el control arquitectónico del usuario y evita que el plan quede contaminado con decisiones implícitas difíciles de revertir.

### 4. Sección final del plan

Esta sección es fija y debe incluirse íntegra al final de cada plan generado. Las cuatro etapas siguientes están ordenadas según una lógica temporal estricta que debe preservarse sin alteraciones: primero se limpia el código, luego se valida sobre un código ya limpio, luego se documenta sobre un código ya validado, y finalmente se commitea un estado ya completo.

1. **Eliminación de código zombie**: Identificar si los cambios implementados han provocado que alguna parte del código fuente del proyecto se volviera "zombie" al dejar de utilizarse. Si es el caso, eliminar consistentemente el código fuente, lógica y documentación "zombie" identificada. Esta etapa va primero porque eliminar código después de validar obligaría a re-ejecutar todas las validaciones; limpiar antes permite validar una sola vez sobre el estado final.

2. **Validación técnica**: Comprobar y validar la correcta compilación del proyecto, luego comprobar y validar que todos los tests automatizados se completen exitosamente, y luego también comprobar que no existan warnings ni errores detectados por el linter del proyecto. Si cualquiera de estas validaciones falla se deben corregir de forma iterativa-incremental, hasta solucionarse completamente. Esta etapa va segunda porque opera sobre el código ya limpio producido por la etapa anterior.

3. **Actualización sincronizada de documentación**: Analizar los cambios implementados, luego investigar qué secciones, subsecciones o comentarios en la documentación del proyecto son impactadas por los cambios implementados, para luego diseñar un sub-plan de actualización de toda la documentación necesaria de forma sincronizada, coherente y consistente a través de los múltiples archivos del proyecto. La documentación se encuentra distribuida en `C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\README.md`, `C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\docs\` y `C:\Users\Cristian\.claude\skills\smart-code-proxy\`. Esta etapa va tercera porque documenta un estado de código ya limpio y ya validado, evitando documentar realidades que luego cambiarían.

4. **Commit descriptivo**: Realizar un commit con los cambios diseñados e implementados en el plan, describiendo los cambios implementados en idioma español, el cual debe ser descriptivo y detallado. Para construir el mensaje del commit se debe analizar la motivación, propósito y objetivos del plan, luego analizar y sintetizar todos los cambios implementados, y comentar cómo se alinea cada cambio implementado con la motivación, propósito y objetivos del plan diseñado. Esta etapa va última porque captura en el historial un estado ya consolidado, limpio, validado y documentado.

## Formato de entrega

Entrega el plan completo en un único bloque de markdown bien estructurado, utilizando encabezados jerárquicos coherentes (H1 para el título del plan, H2 para las secciones principales, H3 para subsecciones y tareas). No omitas ninguna de las secciones descritas arriba, incluso si el requerimiento es pequeño: la uniformidad estructural es parte del valor de este workflow.

## Verificación final antes de entregar

Antes de entregar el plan, ejecuta mentalmente la siguiente lista de verificación. Si alguna comprobación falla, corrige el plan antes de entregarlo:

1. ¿La sección variable contiene únicamente tareas derivadas de los requerimientos específicos del usuario?
2. ¿Ninguna tarea de la sección variable duplica una responsabilidad de la sección final (zombie, validación, documentación, commit)?
3. ¿Las etapas de la sección final aparecen en el orden correcto: zombie → validación → documentación → commit?
4. ¿Cada tarea de la sección variable tiene su propia motivación, propósito y objetivos explícitos?
5. ¿Los objetivos del plan en la sección inicial describen únicamente el trabajo específico, sin mezclar etapas de cierre?
6. ¿Detecté algún punto de decisión arquitectónica que no fue resuelto por el usuario y que debería consultar antes de entregar?

Solo entrega el plan cuando las seis comprobaciones hayan pasado.