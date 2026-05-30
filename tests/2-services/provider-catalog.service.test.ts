import { describe, it, expect } from 'vitest';
import { ProviderCatalogService } from '../../src/2-services/provider-catalog.service.js';

describe('ProviderCatalogService', () => {
  describe('proveedor Anthropic (URL canónica)', () => {
    const service = new ProviderCatalogService('https://api.anthropic.com');

    it('resuelve kind anthropic sin baseUrl', () => {
      const provider = service.getProvider('anthropic');
      expect(provider?.kind).toBe('anthropic');
      expect(provider?.baseUrl).toBeUndefined();
    });
  });

  describe('proveedor custom (URL alternativa)', () => {
    const service = new ProviderCatalogService('https://proxy.example.com');

    it('resuelve kind custom con baseUrl', () => {
      const provider = service.getProvider('custom');
      expect(provider?.kind).toBe('custom');
      expect(provider?.baseUrl).toBe('https://proxy.example.com');
    });
  });

  describe('getProvider', () => {
    it('devuelve undefined para id inexistente', () => {
      const service = new ProviderCatalogService('https://api.anthropic.com');
      expect(service.getProvider('inexistente')).toBeUndefined();
    });
  });

  describe('getLanguageModel', () => {
    it('dos llamadas con el mismo modelId devuelven la misma instancia', () => {
      const service = new ProviderCatalogService('https://api.anthropic.com');
      const m1 = service.getLanguageModel('claude-opus-4-8');
      const m2 = service.getLanguageModel('claude-opus-4-8');
      expect(m1).toBe(m2);
    });

    it('el providerId del modelo apunta al proveedor activo', () => {
      const service = new ProviderCatalogService('https://api.anthropic.com');
      const model = service.getLanguageModel('claude-opus-4-8');
      expect(model?.providerId).toBe('anthropic');
    });
  });

  describe('listModels', () => {
    it('devuelve todos los modelos cacheados', () => {
      const service = new ProviderCatalogService('https://api.anthropic.com');
      service.getLanguageModel('model-a');
      service.getLanguageModel('model-b');
      service.getLanguageModel('model-c');
      expect(service.listModels()).toHaveLength(3);
    });
  });
});
