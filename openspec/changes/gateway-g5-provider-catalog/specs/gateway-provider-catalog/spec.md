# gateway-provider-catalog Specification

## Purpose

Catálogo de proveedores y modelos LLM disponibles en el gateway. Introduce `IProviderCatalog` como port de dominio (capa 1) y `ProviderCatalogService` como adapter (capa 2). Implementado en fase G5 (2026-05-30).

## ADDED Requirements

### Requirement: IProviderCatalog — port de dominio para resolución de proveedor y modelo

El sistema SHALL proveer la interfaz `IProviderCatalog` en `src/1-domain/interfaces/gateway/IProviderCatalog.ts` (capa 1) con los métodos `getProvider(id: string): IProvider | undefined`, `getLanguageModel(modelId: string): ILanguageModel | undefined` y `listModels(): ILanguageModel[]`. El port SHALL ser una interfaz pura sin importaciones de I/O, coherente con el patrón de `IWorkflowRepository`. Capa 3 SHALL depender de `IProviderCatalog`, no del adapter concreto.

#### Scenario: Resolución de proveedor existente

- **GIVEN** un `ProviderCatalogService` instanciado con un proveedor configurado cuyo `id` es `"anthropic"`
- **WHEN** se invoca `getProvider("anthropic")`
- **THEN** SHALL retornar un `IProvider` con `kind: 'anthropic'`

#### Scenario: Resolución de proveedor ausente

- **GIVEN** un catálogo inicializado correctamente
- **WHEN** se invoca `getProvider("inexistente")`
- **THEN** SHALL retornar `undefined`

#### Scenario: Resolución de modelo por modelId wire

- **GIVEN** un catálogo con un `LanguageModel` cuyo `modelId` es `"claude-sonnet-4-6"`
- **WHEN** se invoca `getLanguageModel("claude-sonnet-4-6")`
- **THEN** SHALL retornar un `ILanguageModel` con `modelId: "claude-sonnet-4-6"` y `providerId` apuntando al proveedor del catálogo

#### Scenario: listModels retorna todos los modelos registrados

- **GIVEN** un catálogo con uno o más `LanguageModel` registrados
- **WHEN** se invoca `listModels()`
- **THEN** SHALL retornar un array con todos los `ILanguageModel` registrados, sin mutaciones entre llamadas

### Requirement: ProviderCatalogService — adapter capa 2 desde variables de entorno

El sistema SHALL proveer `ProviderCatalogService` en `src/2-services/provider-catalog.service.ts` que implemente `IProviderCatalog`. El adapter SHALL construir el catálogo en su constructor a partir de `ProxyEnvironmentConfig.UPSTREAM_ORIGIN`: si la URL contiene `api.anthropic.com`, el proveedor SHALL tener `kind: 'anthropic'` sin `baseUrl`; en cualquier otro caso, `kind: 'custom'` con `baseUrl: UPSTREAM_ORIGIN`. El adapter NO SHALL realizar I/O en disco ni llamadas de red.

#### Scenario: Proveedor anthropic derivado de UPSTREAM_ORIGIN canónico

- **GIVEN** `UPSTREAM_ORIGIN` configurado como `"https://api.anthropic.com"`
- **WHEN** se instancia `ProviderCatalogService`
- **THEN** el proveedor registrado SHALL tener `kind: 'anthropic'`
- **AND** `baseUrl` SHALL ser `undefined`

#### Scenario: Proveedor custom derivado de UPSTREAM_ORIGIN alternativo

- **GIVEN** `UPSTREAM_ORIGIN` configurado como `"https://proxy.example.com"`
- **WHEN** se instancia `ProviderCatalogService`
- **THEN** el proveedor registrado SHALL tener `kind: 'custom'`
- **AND** `baseUrl` SHALL ser `"https://proxy.example.com"`

#### Scenario: getLanguageModel en modo pass-through para modelId no precargado

- **GIVEN** un `ProviderCatalogService` instanciado y un `modelId` no registrado explícitamente
- **WHEN** se invoca `getLanguageModel("claude-opus-4-8")`
- **THEN** SHALL retornar un `ILanguageModel` válido con `modelId: "claude-opus-4-8"` y `providerId` del proveedor activo
- **AND** el resultado SHALL ser coherente entre llamadas repetidas con el mismo `modelId`

### Requirement: Cableado en composition root

`ProviderCatalogService` SHALL instanciarse en `src/4-api/composition-root.ts` y quedar disponible como dependencia. En G5 el catálogo es aditivo: ningún handler existente recibe la dependencia obligatoriamente.

#### Scenario: Instanciación exitosa en arranque

- **GIVEN** una `ProxyEnvironmentConfig` válida con `UPSTREAM_ORIGIN` definido
- **WHEN** se ejecuta `buildCompositionRoot(config)`
- **THEN** el objeto de dependencias SHALL incluir una instancia de `IProviderCatalog` correctamente inicializada sin errores
