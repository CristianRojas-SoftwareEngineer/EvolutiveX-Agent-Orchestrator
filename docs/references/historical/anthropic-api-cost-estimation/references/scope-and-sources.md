# Alcance y fuentes

Índice: [Notas de diseño](#notas-de-diseño-del-documento) · [§1 Tabla de roles](#1-alcance-y-fuentes) · [Fuera de la ecuación base](#qué-queda-fuera-de-esta-ecuación-base)

## Notas de diseño del documento

- **Público:** personas que interpretan carpetas `sessions/` y quienes implementan herramientas de coste encima del mismo contrato JSON.
- **Separación de responsabilidades:** la documentación oficial de Anthropic define *qué* se cobra; el JSON local define *a qué precio* (snapshot editable); el código solo combina `usage` × precios sin incrustar USD.
- **Límite del método:** el resultado es una **estimación** útil para análisis y alertas. La factura real de Anthropic puede diferir por redondeo, promociones, cambios de tarifa no reflejados en el JSON, uso de Batch API, Fast mode, herramientas con cargo fijo u otros modificadores no modelados aquí.

---

## 1. Alcance y fuentes

| Rol | Descripción |
|-----|-------------|
| **Lógica de coste** | Alineada con la documentación oficial de Anthropic: [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting). |
| **Fuente humana de verdad** | La página de **precios** de Anthropic (USD por millón de tokens, MTok) para validar o actualizar el archivo local cuando cambien tarifas o modelos. |
| **Fuente máquina para cálculo** | El archivo `config/anthropic-model-pricing.json` en el repositorio del proxy (u homólogo): el proxy o cualquier herramienta de análisis debe leer los coeficientes desde ahí, no desde constantes en el código. |

**Restricción de diseño:** los importes **no deben estar hardcodeados** en la lógica del servidor. Los costes por categoría y modelo se cargan desde el JSON; al cambiar precios, solo se edita (o despliega) ese archivo. El JSON debe mantenerse al día copiando valores desde la página oficial (columnas por MTok) para cada `modelId` que uses.

### Qué queda fuera de esta ecuación base

- [Batch API](https://platform.claude.com/docs/en/about-claude/pricing#batch-processing) (descuento distinto)
- [Fast mode](https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing) (tarifas premium)
- Cargos por herramientas **del lado del servidor** (p. ej. búsqueda web facturada por uso) y otros ítems no lineales en tokens

Si los usas, amplía el modelo de coste más allá de `usage` + tabla MTok.
