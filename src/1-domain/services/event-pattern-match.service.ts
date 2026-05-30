/**
 * Determina si un `eventType` coincide con un `pattern` de suscripción.
 *
 * Soporta:
 * - `*` — wildcard total: coincide con cualquier tipo.
 * - `prefix_*` — coincide con tipos que empiezan por `prefix_`.
 * - `*_suffix` — coincide con tipos que terminan por `_suffix`.
 * - Coincidencia exacta — sin `*`, coincide solo si `pattern === eventType`.
 */
export function matches(pattern: string, eventType: string): boolean {
  if (pattern === '*') return true;

  const endsWithStar = pattern.endsWith('*');
  const startsWithStar = pattern.startsWith('*');

  if (endsWithStar && !startsWithStar) {
    const prefix = pattern.slice(0, -1);
    return eventType.startsWith(prefix);
  }

  if (startsWithStar && !endsWithStar) {
    const suffix = pattern.slice(1);
    return eventType.endsWith(suffix);
  }

  return pattern === eventType;
}
