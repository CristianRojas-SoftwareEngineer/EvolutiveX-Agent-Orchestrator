## 1. Capa 1 — Port IProviderCatalog

- [x] 1.1 Crear `src/1-domain/interfaces/gateway/IProviderCatalog.ts` con los métodos `getProvider(id: string): IProvider | undefined`, `getLanguageModel(modelId: string): ILanguageModel | undefined` y `listModels(): ILanguageModel[]`. Verificación: `npm run test:quick` sin errores de tipado.

## 2. Capa 2 — Adapter ProviderCatalogService

- [x] 2.1 Crear `src/2-services/provider-catalog.service.ts` que implemente `IProviderCatalog`. El constructor recibe `UPSTREAM_ORIGIN: string` y construye el proveedor: `kind: 'anthropic'` si la URL contiene `api.anthropic.com`, `kind: 'custom'` con `baseUrl` en otro caso. Verificación: `npm run test:quick`.
- [x] 2.2 Implementar `getLanguageModel(modelId)` en modo pass-through: si el `modelId` no está precargado, crear y cachear un `ILanguageModel` con ese `modelId` apuntando al proveedor activo. Verificación: el mismo `modelId` llamado dos veces devuelve el mismo objeto (identidad referencial o igualdad profunda).

## 3. Tests unitarios

- [x] 3.1 Crear `tests/2-services/provider-catalog.service.test.ts` con casos: proveedor anthropic (URL canónica), proveedor custom (URL alternativa), `getProvider` ausente devuelve `undefined`, `getLanguageModel` pass-through coherente entre llamadas, `listModels` retorna todos los modelos cacheados. Verificación: `npm run test:quick` — todos los tests pasan.

## 4. Capa 4 — Cableado en composition root

- [x] 4.1 Instanciar `ProviderCatalogService` en `src/4-api/composition-root.ts` pasando `config.UPSTREAM_ORIGIN`. Exponer la instancia como `providerCatalog: IProviderCatalog` en el objeto de dependencias. Verificación: `npm run test:quick` — sin regresiones.

## 5. Validación final y documentación

- [x] 5.1 Ejecutar `npm run test:quick` limpio y confirmar 0 errores, 0 warnings de tipado. Registrar resultado en el commit.
- [x] 5.2 Actualizar `docs/proposals/gateway-design.md` §39 para reflejar que G5 está implementado (equivalente al bloque de estado que existe para G1 y G4).
