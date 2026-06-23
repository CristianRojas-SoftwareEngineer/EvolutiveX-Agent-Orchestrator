#!/usr/bin/env node
// scripting/changelog/install-changelog-hook.ts — instala .git/hooks/post-commit para
// regenerar CHANGELOG.md tras cada commit y enmendarlo al mismo commit.
// Idempotente: reemplaza si ya existe. .git/hooks/ no se versiona — reinstalar
// tras cada clone.
// Advertencia: git commit --amend cambia el SHA del commit original.

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface HookInstallResult {
  path: string;
  hookContent: string;
}

// ---------------------------------------------------------------------------
// Función pura: renderiza el contenido del hook
// ---------------------------------------------------------------------------

/**
 * Devuelve el contenido literal del script de hook post-commit.
 * Mantiene el mismo contenido que el heredoc del bash original,
 * con la invocación actualizada a generate-changelog.ts.
 */
export function renderPostCommitHook(repoRoot: string): string {
  // Escape del repoRoot para el heredoc de bash
  const repoRootEscaped = repoRoot.replace(/'/g, "'\\''");
  return `\
#!/usr/bin/env bash
# post-commit: regenera CHANGELOG.md y lo incluye en el commit via --amend.
# Guard contra recursión: git dispara post-commit también en --amend.
set -euo pipefail
REPO_ROOT='${repoRootEscaped}'
LOCK="$REPO_ROOT/.git/post-commit.lock"
[ -f "$LOCK" ] && exit 0
touch "$LOCK"
trap "rm -f '$LOCK'" EXIT
bash "$REPO_ROOT/scripting/changelog/generate-changelog.ts"
git -C "$REPO_ROOT" add CHANGELOG.md
git -C "$REPO_ROOT" commit --amend --no-edit --no-verify
`;
}

// ---------------------------------------------------------------------------
// Función pura: instala el hook en el repo
// ---------------------------------------------------------------------------

/**
 * Escribe .git/hooks/post-commit con el contenido del hook.
 * Crea el directorio de hooks recursivamente si no existe.
 * Retorna la ruta absoluta del archivo instalado.
 */
export function installPostCommitHook(repoRoot: string): HookInstallResult {
  const hookDir = join(repoRoot, '.git', 'hooks');
  if (!existsSync(hookDir)) {
    mkdirSync(hookDir, { recursive: true });
  }

  const hookPath = join(hookDir, 'post-commit');
  const hookContent = renderPostCommitHook(repoRoot);
  writeFileSync(hookPath, hookContent, 'utf-8');

  return { path: hookPath, hookContent };
}

// ---------------------------------------------------------------------------
// CLI main
// ---------------------------------------------------------------------------

function main(): void {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf-8',
  }).trim();

  const { path: hookPath } = installPostCommitHook(repoRoot);
  console.log(`Hook post-commit instalado en ${hookPath}`);
}

main();
