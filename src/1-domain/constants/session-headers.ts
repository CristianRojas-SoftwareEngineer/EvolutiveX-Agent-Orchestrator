/** Cabecera primaria de sesión (override); prioridad sobre el fallback de Claude Code. */
export const AUDIT_SESSION_OVERRIDE_HEADER = 'x-cc-audit-session';

/** Cabecera secundaria enviada por Claude Code por defecto. */
export const AUDIT_SESSION_FALLBACK_HEADER = 'x-claude-code-session-id';

/**
 * Si es true, elimina la cabecera de sesión antes de reenviar al upstream.
 * Casos excepcionales: editar esta constante (ver `docs/advanced-configuration.md`).
 */
export const STRIP_AUDIT_SESSION_HEADER = true;

/**
 * Si es true, añade sufijo `-<hash8>` al nombre de carpeta bajo `sessions/`.
 * Casos excepcionales: editar esta constante (ver `docs/advanced-configuration.md`).
 */
export const AUDIT_SESSION_HASH_SUFFIX = false;
