# Propuesta: Mejora de Observabilidad para Subagentes Paralelos

## Estado Actual: Problemas de Observabilidad

### Estructura Plana Actual

Actualmente, cuando Claude Code ejecuta un turno principal que invoca subagentes mediante la tool `agent`, todas las interacciones se generan como entidades independientes al mismo nivel dentro de la sesión:

```
sessions/
  <session-id>/
    interactions/
      000001_<uuid>/          # Turno principal (generó tool_use "agent")
        meta.json
        state.json
        steps/
          001/
            request/
            response/         # Aquí se emitió el tool_use "agent"
      000002_<uuid>/          # Subagente A (relación NO explícita)
        meta.json
        state.json
        steps/
          001/
            request/
            response/
      000003_<uuid>/          # Subagente B (relación NO explícita)
        meta.json
        state.json
        steps/
          001/
            request/
            response/
```

### Problemas Críticos de Observabilidad

#### 1. Pérdida de Contexto Jerárquico

Al observar el filesystem, un desarrollador no puede determinar:

- **Qué step del padre generó cada subagente**: Los subagentes aparecen como interacciones huérfanas sin indicación de su progenitor
- **Orden causal**: No hay forma de saber si el subagente B se inició antes o después del subagente A sin inspeccionar timestamps de múltiples archivos
- **Dependencias**: No es posible identificar qué subagentes son hijos de qué turno sin correlacionar manualmente tool_use_ids a través de decenas de archivos JSON

#### 2. Trazabilidad Rota

Cuando se analiza una sesión post-mortem o durante debugging:

- El investigador debe abrir múltiples archivos `meta.json` y `response/body.json` dispersos en el filesystem para reconstruir mentalmente el árbol de ejecución
- Los logs de error en un subagente no contienen metadatos de su progenitor, haciendo imposible determinar el contexto que generó el error
- Las métricas de duración total incluyen tiempo de subagentes como tiempo independiente, distorsionando análisis de throughput y latencia del flujo principal

#### 3. Correlación Manual Impracticable

Para entender un flujo completo con subagentes, el investigador debe ejecutar un proceso manual de múltiples pasos:

1. Abrir la interacción principal y navegar a steps/X/response/body.json
2. Buscar el tool_use con name="agent" en el response
3. Extraer el tool_use_id de ese tool_use
4. Buscar en todas las demás interacciones de la sesión cuál contiene ese tool_use_id en su request/body.json
5. Repetir este proceso para cada subagente encontrado, sin garantía de haber descubierto todos

Este proceso es **impracticable para sesiones con 10+ subagentes** y propenso a errores humanos.

#### 4. Confusión Temporal por Race Conditions

Cuando múltiples subagentes se ejecutan en paralelo:

- La numeración secuencial de interacciones (`000001`, `000002`, `000003`) refleja orden de llegada al proxy, no orden lógico de ejecución
- Un subagente puede tener número menor que steps posteriores del padre si llegó primero al proxy
- Esto genera confusión temporal: ¿El subagente 000003 ocurrió antes o después del step 002 del padre? La estructura plana no lo revela.

---

## Estado Deseado: Jerarquía Explícita en Filesystem

### Principio de Diseño

Los subagentes deben almacenarse **dentro del contexto que los generó** — específicamente, anidados bajo el step del turno principal que emitió el `tool_use` con nombre "agent". Esto transforma la estructura de auditoría de una colección plana a un árbol semántico que refleja la estructura real de ejecución.

### Estructura Anidada Deseada

```
sessions/
  <session-id>/
    interactions/
      000001_<uuid>/                    # Turno principal
        meta.json
        state.json
        steps/
          001/
            request/
            response/                     # Contiene tool_use "agent" que inició subagentes
            sub-interactions/             # Subagentes generados por este step
              000001_<uuid>/              # Subagente A (hijo del step 001)
                meta.json                 # Incluye parentInteractionDir, parentStepIndex, triggeringToolUseId
                state.json
                steps/
                  001/
                    request/
                    response/
              000002_<uuid>/              # Subagente B (hijo del step 001)
                meta.json
                state.json
                steps/
                  001/
                    request/
                    response/
          002/
            request/
            response/
            sub-interactions/             # Subagentes generados en step 002
              000001_<uuid>/              # Subagente C (nueva secuencia local al step)
                meta.json
                state.json
                steps/
                  001/
                    request/
                    response/
```

### Características del Estado Deseado

#### 1. Contexto Co-localizado

La presencia de un directorio `sub-interactions/` dentro de un step indica inmediatamente que ese step generó subagentes. Al listar el filesystem, la jerarquía de ejecución es **autodescriptiva** — no requiere inspección de contenidos ni correlación manual.

#### 2. Metadatos de Parentezco

Cada subagente incluye en su `meta.json` información completa de su origen:

- `parentInteractionDir`: Directorio absoluto del turno padre
- `parentStepIndex`: Índice del step del padre que generó este subagente
- `triggeringToolUseId`: Identificador del tool_use específico que inició este subagente

Esto permite navegación bidireccional: desde el subagente al contexto exacto que lo generó en una sola operación de filesystem.

#### 3. Secuenciación Local por Step

Las sub-interacciones utilizan secuencia **local al step padre**, reiniciando en cada step:

- Step 001 puede tener `sub-interactions/000001_*`, `sub-interactions/000002_*`...
- Step 002 comienza su propia secuencia con `sub-interactions/000001_*`

Esta secuencia local es independiente de la numeración global de interacciones de la sesión, permitiendo identificar rápidamente "el primer subagente del step 3" sin ambigüedad.

#### 4. Entidades Completas Contextualizadas

Los subagentes mantienen su naturaleza de interacciones completas:

- Poseen su propio `meta.json`, directorio `steps/` con estructura completa, y ciclo de vida independiente
- No se mezclan con el flujo principal del padre (sus steps no aparecen en el meta.json del padre)
- Su cierre es independiente: el padre puede cerrar su turno mientras los subagentes siguen ejecutándose

#### 5. Límite de Profundidad Natural

Dado que Claude Code no expone la tool `agent` a los subagentes mismos, la profundidad máxima de anidación es 2 niveles: el turno principal (nivel 1) y los subagentes directos que genera (nivel 2). No existe el caso de sub-subagentes (nivel 3+), lo que simplifica la complejidad del diseño.

---

## Comparativa: Antes vs. Después

| Aspecto | Estructura Plana (Actual) | Estructura Anidada (Deseada) |
|---------|---------------------------|------------------------------|
| **Descubrimiento** | Requiere listar e inspeccionar N archivos dispersos | Simple `ls steps/X/sub-interactions/` revela existencia y cantidad |
| **Trazabilidad** | Correlación manual vía tool_use_id a través de archivos | Metadata explícita en meta.json del subagente |
| **Navegación** | Saltos entre directorios independientes | Navegación jerárquica natural en filesystem |
| **Debugging** | Contexto dividido en múltiples lugares; reconstrucción mental requerida | Contexto co-localizado; árbol visible en estructura de directorios |
| **Auditoría** | Scripts de correlación necesarios para árbol de ejecución | Estructura autodescriptiva; árbol = filesystem |
| **Visualización** | Dependencia de timestamps y heurísticas para orden | Árbol de directorios = árbol de ejecución real |

---

## Conclusión

La estructura plana actual transforma sesiones con subagentes en rompecabezas de correlación manual, degradando severamente la capacidad de observación y debugging del sistema. La anidación de sub-interacciones resuelve esto haciendo que el **filesystem mismo refleje el árbol de ejecución**.

El estado deseado — donde los subagentes residen físicamente dentro del step que los generó, con metadatos de parentezco explícitos — transforma la auditoría de una colección de entidades relacionadas lógicamente pero dispersas físicamente, a un **árbol semántico autodescriptivo** que un desarrollador puede navegar y comprender sin herramientas auxiliares ni scripts de correlación.

Esta transformación es fundamental para:

1. **Operadores humanos**: Capacidad de entender flujos complejos con múltiples subagentes paralelos mediante simple navegación de directorios
2. **Herramientas automáticas**: Parsing determinístico y sin ambigüedad del árbol de ejecución completo
3. **Debugging post-mortem**: Reconstrucción inmediata del contexto completo de fallo con una sola operación de filesystem
