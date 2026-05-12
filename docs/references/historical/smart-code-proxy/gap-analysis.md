# Guía de Análisis de Gaps: Harness Nativo vs Smart Code Proxy

## Propósito

Esta guía complementa el workflow `/analizar-sesion` de Windsurf, proporcionando el conocimiento de dominio necesario para clasificar correctamente las discrepancias entre el registro nativo de Claude Code (harness) y la auditoría de Smart Code Proxy.

## Principio fundamental

Smart Code Proxy busca **observabilidad inteligente para análisis humano**, no granularidad técnica por sí misma. El objetivo es presentar los flujos lógicos que el usuario orquesta de forma natural y trazable.

**No todo lo que se puede registrar debe registrarse.** Las ejecuciones de built-in tools por subagentes sí son relevantes.

## Flujo de decisión para clasificación de gaps

```
¿El proxy captura menos subagentes que el harness?
├── SÍ → INCONSISTENCIA (subagentes perdidos)
│          Investigar: handleSubagent, findInteractionWithPendingAgents
└── NO → ¿El proxy tiene más profundidad de anidamiento?
           ├── SÍ → ¿Son built-in tools de subagentes?
           │              ├── SÍ → DIFERENCIA DE DISEÑO (intencional)
           │              └── NO → INCONSISTENCIA (¿subagentes fantasma?)
           └── NO → Verificar correlación tool_use IDs
```

## Tabla de diagnóstico rápido

| Síntoma | Tipo | Investigar | Prioridad |
|---------|------|-----------|-----------|
| Subagente en harness, no en proxy | **Inconsistencia** | `AuditInteractionHandler`, `findInteractionWithPendingAgents` | Crítica |
| `state.json` sin `meta.json` | **Inconsistencia** | Crash del proxy, logs de error | Alta |
| Built-in tools como sub-interacciones (nivel 2+) | **Diferencia de diseño** | Comportamiento correcto, no un bug | Documentar |
| Preflights como interacciones separadas | **Diferencia de diseño** | Comportamiento correcto | Documentar |
| Mayor metadata (tokens, latencias) en proxy | **Diferencia de diseño** | Enriquecimiento intencional | — |
| `triggeringToolUseId: null` en subagente | **Diferencia de diseño** | Tool uses paralelos, correlación ambigua (documentado) | Baja |
| Tool_use IDs descorrelacionados | **Inconsistencia** | `handleContinuation`, correlación | Media |
| Subagente nivel 2+ sin `parentContext` correcto | **Inconsistencia** | Construcción de `parentContext` | Media |

## Diferencias de diseño vs inconsistencias: criterios detallados

### Diferencias de diseño intencionales (no requieren acción)

Estas diferencias reflejan decisiones arquitectónicas deliberadas del proxy:

| Aspecto | Justificación |
|---------|---------------|
| **Built-in tools como sub-interacciones** | Permite trazabilidad de qué URLs fetchió cada subagente; aporta valor al análisis humano |
| **Preflights separados** | Claridad en la secuencia de inicialización; el harness las agrupa pero son lógicamente distintas |
| **Estructura de directorios jerárquica** | Navegación humana más intuitiva que JSONL lineal (árbol vs lista) |
| **Metadata explícita por step** | Análisis de costes y comportamiento granular; el harness tiene esta data implícita |
| **`parentContext` con paths absolutos** | Trazabilidad explícita de relaciones padre-hijo; el harness usa IDs que requieren correlación |

### Inconsistencias/bugs (requieren investigación/corrección)

Estas situaciones indican que el proxy no capturó correctamente el comportamiento del harness:

| Indicador | Evidencia requerida | Acción |
|-----------|---------------------|--------|
| **Subagente perdido** | Harness registra `tool_use` Agent + `tool_result` correspondiente; proxy no tiene sub-interacción | Verificar `findInteractionWithPendingAgents`, `handleSubagent`, posible pérdida de evento SSE |
| **Interacción huérfana** | `state.json` presente, `meta.json` ausente en directorio de interacción | Investigar crash del proxy, memoria, logs de error en momento del incidente |
| **Tool_use ID descorrelacionado** | `tool_use_id` del harness no aparece en ningún `parentContext` del proxy | Revisar `handleContinuation`, lógica de consumo de `pendingAgentToolUses` |
| **ParentContext roto** | Subagente nivel 2+ tiene `parentContext` apuntando a interacción incorrecta | Verificar construcción de `parentContext` |

## Casos de estudio

### Caso 1: Subagentes paralelos con correlación ambigua

**Síntoma:** 3 tool_use `Agent` en mismo step, subagentes con `triggeringToolUseId: null`

**Análisis:**
- Cuando múltiples tool_use `Agent` se emiten en paralelo en el mismo step
- La correlación tool_use → subagente no puede ser unívoca al momento de crear el subagente
- `handleSubagent` deja `triggeringToolUseId: null` cuando hay >1 pending

**Conclusión:** Diferencia de diseño conocida y documentada; no requiere acción

**Acción:** Ninguna; comportamiento esperado. La correlación se puede establecer post-hoc analizando timestamps.

### Caso 2: Preflight zombie (resuelto)

**Síntoma (historial):** Preflights quedaban abiertos indefinidamente con `state.json`

**Causa:** Cierre incorrecto de preflights en handler de respuesta

**Resolución:** `handlePreflightQuota` y `handlePreflightWarmup` ahora cierran inmediatamente con `outcome: "completed"`

**Lección:** Los preflights son interacciones transitorias que nunca deben quedar abiertas.

## Checklist para análisis de sesión

Antes de entregar un análisis comparativo, verifica:

### Conteo y correlación
- [ ] ¿Número de subagentes coincide entre harness y proxy?
- [ ] ¿Todos los tool_use IDs del harness aparecen en el proxy?
- [ ] ¿Algún subagente del harness no tiene correspondiente en proxy?

### Estado de interacciones
- [ ] ¿Algún directorio tiene `state.json` sin `meta.json` correspondiente?
- [ ] Si sí: interacción huérfana → **inconsistencia** (investigar crash)

### Profundidad de anidamiento
- [ ] ¿El proxy tiene más sub-interacciones que tool_use del harness?
- [ ] ¿Son built-in tools (WebFetch/WebSearch)? → **diferencia de diseño**
- [ ] ¿Son subagentes no esperados? → **inconsistencia** (investigar)

### Metadata de correlación
- [ ] ¿Los subagentes nivel 1+ tienen `parentContext` correcto?
- [ ] ¿El `parentInteractionDir` apunta a la interacción padre correcta?

### Valor de observabilidad
- [ ] ¿Las diferencias encontradas aportan valor a la observabilidad humana?
- [ ] ¿O son ruido técnico sin significado para el flujo lógico?

## Regla de oro

> Si el proxy registra **menos** subagentes que el harness, es una **inconsistencia**.
> Si registra **más profundidad** (built-in tools como sub-interacciones), es una **diferencia de diseño intencional**.

## Recursos relacionados

- **Workflow:** `/analizar-sesion` en `C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\.windsurf\workflows\`
- **Skill principal:** `SKILL.md` en esta misma carpeta
- **Referencia estructural:** `reference.md` en esta misma carpeta
