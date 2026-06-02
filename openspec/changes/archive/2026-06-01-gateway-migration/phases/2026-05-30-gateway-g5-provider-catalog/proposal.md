> **Orquestador:** `gateway-migration` | **Fase:** g5 (Refactor gateway)

## Why

Las entidades `Provider` y `LanguageModel` existen en capa 1 (interfaces + modelos de clase, fase G1) pero ningún servicio las instancia ni expone: el proxy enruta todas las peticiones a `UPSTREAM_ORIGIN`, un único string de env, sin ninguna abstracción de catálogo. G5 introduce `ProviderCatalog` (capa 2) para que los handlers de capa 3 puedan resolver entidades de proveedor y modelo a partir del campo `model` del wire, cerrando la brecha entre las definiciones de dominio de G1 y su uso práctico en la cadena de auditoría.

## What Changes

- **Nueva interfaz de dominio** `IProviderCatalog` (capa 1, port): expone `getProvider(id)`, `getLanguageModel(modelId)` y `listModels()`.
- **Nuevo adapter** `ProviderCatalogService` (capa 2): carga la configuración de proveedores y modelos desde variables de entorno y la expone a través de `IProviderCatalog`.
- **Cableado en composition root** (capa 4): `ProviderCatalogService` se instancia e inyecta en el gráfico de dependencias; no altera la lógica de reenvío HTTP (que sigue usando `UPSTREAM_ORIGIN`).
- **Retiro del legacy**: encapsular el acceso directo a `UPSTREAM_ORIGIN` como dato de configuración bruto, sin lógica de selección de proveedor.

## Capabilities

### New Capabilities

- `gateway-provider-catalog`: catálogo de proveedores y modelos LLM; port `IProviderCatalog` en capa 1 + adapter `ProviderCatalogService` en capa 2.

### Modified Capabilities

*(ninguna — los contratos de `IProvider` e `ILanguageModel` de `gateway-domain-types` no cambian en G5)*

## Impact

- **Capa 1 — `src/1-domain/`**: nueva interfaz `IProviderCatalog` bajo `interfaces/gateway/`.
- **Capa 2 — `src/2-services/`**: nuevo `ProviderCatalogService`; reutiliza `Provider` y `LanguageModel` de G1.
- **Capa 4 — `src/4-api/composition-root.ts`**: instanciación e inyección del catálogo.
- **Fuera de alcance G5**: routing HTTP dinámico por modelo (P0+), pricing/coste, persistencia del catálogo en disco.
- Referencia de diseño: [§13](../../../docs/proposals/gateway-design.md#13-entidades-de-enrutamiento), [§39](../../../docs/proposals/gateway-design.md#39-capa-1-objetivo), [§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo).
