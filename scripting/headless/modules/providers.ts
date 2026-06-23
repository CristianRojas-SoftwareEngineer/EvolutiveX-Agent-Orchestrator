import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Proveedores omitidos por defecto (sin suscripción activa). */
export const EXCLUDED_PROVIDERS = ['opencode', 'xiaomi'] as const;

/** Proveedor virtual sin carpeta en routing/providers/. */
export const PSEUDO_PROVIDERS = ['default'] as const;

/** Orden preferido de ejecución en la suite por defecto. */
export const PROVIDER_EXECUTION_ORDER = [
  'ollama',
  'minimax',
  'openrouter',
  'anthropic',
  'default',
] as const;

export type KnownProvider = (typeof PROVIDER_EXECUTION_ORDER)[number];

/** Escanea routing/providers/ buscando directorios con config.json. */
export function discoverCatalogProviders(projectRoot: string): string[] {
  const basePath = join(projectRoot, 'routing', 'providers');
  if (!existsSync(basePath)) return [];

  return readdirSync(basePath, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(basePath, d.name, 'config.json')))
    .map((d) => d.name)
    .sort();
}

/** true si el nombre es un proveedor del catálogo o pseudo-proveedor. */
export function isKnownProvider(name: string, projectRoot: string): boolean {
  if ((PSEUDO_PROVIDERS as readonly string[]).includes(name)) return true;
  return discoverCatalogProviders(projectRoot).includes(name);
}

/** Ordena proveedores según PROVIDER_EXECUTION_ORDER; desconocidos al final. */
export function sortProviders(providers: string[]): string[] {
  const order = new Map(PROVIDER_EXECUTION_ORDER.map((p, i) => [p, i]));
  return [...providers].sort((a, b) => {
    const ia = order.get(a as KnownProvider) ?? 999;
    const ib = order.get(b as KnownProvider) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

export interface ResolveProvidersOptions {
  projectRoot: string;
  /** Lista explícita desde --providers; si se omite, se descubre del catálogo. */
  explicit?: string[];
  /** Exclusiones adicionales (--exclude-providers). */
  extraExclude?: string[];
}

export interface ResolveProvidersResult {
  providers: string[];
  /** Proveedores omitidos al usar descubrimiento automático. */
  excludedByDefault: string[];
  catalog: string[];
  warnings: string[];
}

/**
 * Resuelve la lista de proveedores a probar.
 * Por defecto: todos los del catálogo + default, menos opencode y xiaomi.
 */
export function resolveTestProviders(opts: ResolveProvidersOptions): ResolveProvidersResult {
  const catalog = discoverCatalogProviders(opts.projectRoot);
  const known = new Set([...catalog, ...PSEUDO_PROVIDERS]);
  const defaultExclude = new Set<string>(EXCLUDED_PROVIDERS);
  const extraExclude = new Set(opts.extraExclude ?? []);
  const warnings: string[] = [];

  let providers: string[];

  if (opts.explicit && opts.explicit.length > 0) {
    providers = sortProviders(opts.explicit);
  } else {
    const exclude = new Set([...defaultExclude, ...extraExclude]);
    providers = sortProviders([...catalog, ...PSEUDO_PROVIDERS].filter((p) => !exclude.has(p)));
  }

  for (const p of providers) {
    if (!known.has(p)) {
      warnings.push(
        `Proveedor "${p}" no reconocido en routing/providers ni como pseudo-proveedor.`,
      );
    }
  }

  const excludedByDefault = sortProviders(
    [...defaultExclude, ...extraExclude].filter((p) => catalog.includes(p)),
  );

  return { providers, excludedByDefault, catalog, warnings };
}

/** Lista por defecto cuando no se pasa --providers (requiere projectRoot en runtime). */
export function defaultTestProviders(projectRoot: string): string[] {
  return resolveTestProviders({ projectRoot }).providers;
}
