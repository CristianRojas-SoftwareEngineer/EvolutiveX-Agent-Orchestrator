# Propuesta: Nueva Estructura de Directorios — Smart Code Proxy

## Diagrama general

```text
sessions/
  {sessionID}/
    main-agent/                                                                   → /sessions/{sessionID}/main-agent/
    │ interactions/                                                                → /sessions/{sessionID}/main-agent/interactions/
    │   01/                                                                        → /sessions/{sessionID}/main-agent/interactions/01/
    │   XX/                                                                        → /sessions/{sessionID}/main-agent/interactions/XX/
    │     input/                                                                   → .../XX/input/
    │     steps/                                                                   → .../XX/steps/
    │     │ 01/                                                                    → .../XX/steps/01/
    │     │   request/                                                             → .../XX/steps/01/request/
    │     │   thought/                                                             → .../XX/steps/01/thought/     (solo si hay extended thinking)
    │     │   response/                                                            → .../XX/steps/01/response/
    │     │ YY/                                                                    → .../XX/steps/YY/            (step con delegación a subagentes)
    │     │   request/                                                             → .../XX/steps/YY/request/
    │     │   thought/                                                             → .../XX/steps/YY/thought/     (solo si hay extended thinking)
    │     │   response/                                                            → .../XX/steps/YY/response/
    │     │   sub-agent-01/                                                        → .../XX/steps/YY/sub-agent-01/  (primer subagente del step)
    │     │   │ input/                                                             → .../sub-agent-01/input/
    │     │   │ steps/                                                             → .../sub-agent-01/steps/
    │     │   │ │ 01/                                                              → .../sub-agent-01/steps/01/
    │     │   │ │   request/                                                       → .../sub-agent-01/steps/01/request/
    │     │   │ │   thought/                                                       → .../sub-agent-01/steps/01/thought/  (solo si hay extended thinking)
    │     │   │ │   response/                                                      → .../sub-agent-01/steps/01/response/
    │     │   │ │ ZZ/                                                              → .../sub-agent-01/steps/ZZ/
    │     │   │ │   request/                                                       → .../sub-agent-01/steps/ZZ/request/
    │     │   │ │   thought/                                                       → .../sub-agent-01/steps/ZZ/thought/  (solo si hay extended thinking)
    │     │   │ │   response/                                                      → .../sub-agent-01/steps/ZZ/response/
    │     │   │ output/                                                            → .../sub-agent-01/output/
    │     │   sub-agent-02/                                                        → .../XX/steps/YY/sub-agent-02/  (segundo subagente del step, si lo hay)
    │     │   │ input/                                                             → .../sub-agent-02/input/
    │     │   │ steps/  ...                                                        → .../sub-agent-02/steps/
    │     │   │ output/                                                            → .../sub-agent-02/output/
    │     │   sub-agent-TT/                                                        → .../XX/steps/YY/sub-agent-TT/  (subagente paralelo #TT)
    │     │     ...
    │     output/                                                                  → .../XX/output/
    │
    side-interactions/                                                             → /sessions/{sessionID}/side-interactions/
      01/                                                                          → /sessions/{sessionID}/side-interactions/01/
      MM/                                                                          → /sessions/{sessionID}/side-interactions/MM/
        input/                                                                     → .../MM/input/               (solo en side-request; ausente en client-preflight)
        steps/                                                                     → .../MM/steps/
        │ 01/                                                                      → .../MM/steps/01/
        │   request/                                                               → .../MM/steps/01/request/
        │   thought/                                                               → .../MM/steps/01/thought/    (solo si hay extended thinking)
        │   response/                                                              → .../MM/steps/01/response/
        │ NN/                                                                      → .../MM/steps/NN/
        │   request/                                                               → .../MM/steps/NN/request/
        │   thought/                                                               → .../MM/steps/NN/thought/    (solo si hay extended thinking)
        │   response/                                                              → .../MM/steps/NN/response/
        output/                                                                    → .../MM/output/              (solo en side-request; ausente en client-preflight)
```

---

## Reglas de nomenclatura

| Símbolo en diagrama | Dimensión | Formato | Ejemplo |
|---|---|---|---|
| `XX` | Índice de interacción en `main-agent/interactions/` | 2 dígitos, sin UUID | `01`, `12` |
| `MM` | Índice de interacción en `side-interactions/` | 2 dígitos, sin UUID | `01`, `06` |
| `YY` | Índice de step dentro de una interacción agéntica | 2 dígitos | `01`, `03` |
| `ZZ` | Índice de step dentro de un subagente | 2 dígitos | `01`, `02` |
| `NN` | Índice de step dentro de una side-interaction | 2 dígitos | `01`, `04` |
| `TT` | Índice de subagente (`sub-agent-TT`) | 2 dígitos | `01`, `02` |

---

## Los dos contenedores de primer nivel

### `main-agent/interactions/` — Interacciones agénticas

Contiene las interacciones de tipo `agentic`: el agente principal recibió un prompt del usuario, lo procesó a través de uno o más steps HTTP, y produjo una respuesta reconstruida.

Estructura fija por interacción:
- `input/` — prompt inicial del usuario (top-level)
- `steps/YY/` — cada llamada HTTP individual, con sus subdirectorios `request/`, `thought/` (opcional), `response/`, y `sub-agent-TT/` (opcional, uno por cada subagente que el step haya delegado)
- `output/` — respuesta final reconstruida del pipeline completo

### `side-interactions/` — Preflights y peticiones secundarias

Contiene dos tipos de interacción secundaria:

**`client-preflight`** — El harness de Claude Code ejecuta un par de peticiones de inicialización antes de la primera interacción real (quota-check y cache warm-up). No tienen `input/` ni `output/` propios — solo `steps/`.

**`side-request`** — Peticiones auxiliares con `"tools": []` que el harness envía en paralelo al turno agéntico activo (p. ej. `/v1/messages/count_tokens`). Sí tienen `input/` y `output/`.

---

## Subdirectorios dentro de cada step

| Directorio | Presencia | Contenido |
|---|---|---|
| `request/` | Siempre | Petición HTTP enviada a Anthropic en este step |
| `thought/` | Solo si el step contiene extended thinking | Bloques de extended thinking emitidos por el modelo |
| `response/` | Siempre | Respuesta HTTP recibida de Anthropic en este step |

---

## Tabla de cambios respecto a la estructura actual

| Estructura actual | Nueva estructura | Motivo |
|---|---|---|
| `interactions/NNNNNN_<uuid>/` (todos los tipos) | `main-agent/interactions/NN/` (solo agentic) | Separación física por tipo; legibilidad |
| `interactions/NNNNNN_<uuid>/` (side-request/preflight) | `side-interactions/NN/` | Separación física por tipo |
| `NNNNNN_<uuid>/` (6 dígitos + UUID) | `NN/` (2 dígitos, sin UUID) | Simplicidad; los UUIDs no aportan valor de navegación |
| `request/` (top-level de interacción) | `input/` | Claridad semántica: es la entrada del ciclo, no una petición HTTP |
| `response/` (top-level de interacción) | `output/` | Claridad semántica: es la salida reconstruida del ciclo completo |
| `steps/NNN/` (3 dígitos) | `steps/NN/` (2 dígitos) | Consistencia con numeración de interacciones |
| `steps/NNN/sub-interactions/NNN_<uuid>/` | `steps/YY/sub-agent-TT/` (siempre con índice) | Nombre más expresivo; índice uniforme independientemente de si hay uno o varios subagentes |
| *(ausente)* | `steps/NN/thought/` | Soporte para extended thinking |
