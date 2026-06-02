## Context

G1 introdujo `IProvider`, `ILanguageModel`, `Provider` y `LanguageModel` como entidades de dominio (capa 1), pero ningún servicio las instancia: el proxy enruta toda petición a `ProxyEnvironmentConfig.UPSTREAM_ORIGIN`, un string plano de env, sin abstracción de catálogo. Capa 3 y los handlers de auditoría no pueden resolver entidades `Provider`/`LanguageModel` desde el `model` wire del request.

G5 añade `IProviderCatalog` (port capa 1) y `ProviderCatalogService` (adapter capa 2) para cerrar esa brecha sin tocar la lógica de reenvío HTTP.

Referencia de diseño: [§13](../../../docs/proposals/gateway-design.md#13-entidades-de-enrutamiento), [§39](../../../docs/proposals/gateway-design.md#39-capa-1-objetivo), [§40](../../../docs/proposals/gateway-design.md#40-capa-2-objetivo).

## Goals / Non-Goals

**Goals:**

- Definir `IProviderCatalog` en `src/1-domain/interfaces/gateway/` (port puro, sin I/O).
- Implementar `ProviderCatalogService` en `src/2-services/` que construya el catálogo desde variables de entorno al arrancar.
- Exponer `getProvider(id): IProvider | undefined`, `getLanguageModel(modelId): ILanguageModel | undefined` y `listModels(): ILanguageModel[]`.
- Cablear `ProviderCatalogService` en `src/4-api/composition-root.ts`.
- Tests unitarios en `tests/2-services/` que cubran resolución nominal y caso ausente.

**Non-Goals:**

- Cambiar la lógica de reenvío HTTP (sigue usando `UPSTREAM_ORIGIN` directamente en `proxy.routes.ts`).
- Leer el catálogo desde un directorio `routing/providers/` en disco (diferido a P0+).
- Pricing o cálculo de coste por modelo.
- Routing dinámico por modelo (P0+).
- Cambiar la interfaz de `ProxyEnvironmentConfig`.

## Decisions

### D1 — Fuente de configuración: variables de entorno, no fichero en disco

**Opciones consideradas:**

| Opción | Pros | Contras |
|--------|------|---------|
| Env vars | Coherente con `ProxyEnvironmentConfig`; sin I/O adicional; sin necesidad de parsear formato nuevo | No permite catálogos complejos multi-proveedor sin proliferación de env vars |
| Fichero `routing/providers.json` | Escala a múltiples proveedores; es la dirección de §40 | Introduce I/O en arranque; requiere formato + validación; routing dinámico no está en scope de G5 |

**Decisión:** env vars para G5. La transición a `routing/providers/` es parte de P0+, cuando el routing dinámico por modelo se active. `ProviderCatalogService` encapsula la fuente de configuración detrás de `IProviderCatalog`, por lo que el cambio será local al adapter.

### D2 — Estructura del catálogo inicial: un proveedor y modelos on-demand

El catálogo arranca con un único proveedor derivado de `UPSTREAM_ORIGIN`:

- Si `UPSTREAM_ORIGIN` apunta a `api.anthropic.com` → `kind: 'anthropic'`, sin `baseUrl`.
- En cualquier otro caso → `kind: 'custom'`, `baseUrl: UPSTREAM_ORIGIN`.

Los `LanguageModel` se registran por `modelId` (el campo `model` del wire). En G5 el catálogo puede operar en modo **pass-through**: `getLanguageModel(modelId)` devuelve una entidad válida aunque el `modelId` no sea conocido de antemano, con `providerId` apuntando al proveedor único.

### D3 — Port en capa 1, no en capa 2

`IProviderCatalog` vive en `src/1-domain/interfaces/gateway/` para que capa 3 pueda recibir la dependencia sin acoplarse al adapter. Sigue el mismo patrón que `IWorkflowRepository`.

### D4 — Sin cambio en composition-root existente para el routing HTTP

El cableado de `ProviderCatalogService` en `composition-root.ts` es aditivo: se instancia y se expone como dependencia opcional. Los handlers existentes no reciben la dependencia en G5; el catálogo queda disponible para uso futuro en G6+/P0+.

## Risks / Trade-offs

- **Catálogo estático en G5**: sin routing dinámico, el catálogo es un value object de arranque. El riesgo de divergencia con el upstream real es bajo porque G5 no altera el reenvío.
- **Deuda de migración a fichero**: la decisión D1 diferida crea un cambio de fuente de configuración en P0+. Mitigación: `IProviderCatalog` aísla al consumidor; solo cambia `ProviderCatalogService`.
- **Dependencia innecesaria en composition-root**: inyectar algo que nadie consume aún añade ruido. Mitigación: G5 solo instancia; no pasa el catálogo a ningún handler salvo que el diseño P0+ lo requiera explícitamente.
