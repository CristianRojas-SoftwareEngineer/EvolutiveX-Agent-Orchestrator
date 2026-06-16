# statusline-live-refresh Specification (delta)

## REMOVED Requirements

### Requirement: Statusline instalado con `refreshInterval` configurable

**Reason**: La capability `statusline-live-refresh` se retira. El timer periódico ya no resuelve un problema del proxy tras corregir la causa raíz de la Tabla 2 estática.

**Migration**: El instalador no escribe `refreshInterval`. Ver `statusline-installer` y `statusline-runtime` (cierre temprano conservado).

### Requirement: Cierre temprano cuando `session-metrics.json` no cambió

**Reason**: Requirement duplicado; la fuente canónica pasa a ser `statusline-runtime` («Caché por sesión»).

**Migration**: Sin cambio de comportamiento en código; eliminar esta capability al archivar el change.

### Requirement: Indicador visual "● live (Ns)" en cabecera de Tabla 2

**Reason**: Acoplado al timer `refreshInterval`, fuera del alcance del proyecto.

**Migration**: Ver delta `statusline-runtime` — requirement del indicador eliminado.

### Requirement: Cache `lastRenderedTable2Output` sincronizado con la sesión

**Reason**: Requirement duplicado; la fuente canónica pasa a ser `statusline-runtime` («Campo `lastRenderedTable2Output`»).

**Migration**: Sin cambio de comportamiento en código; eliminar esta capability al archivar el change.
