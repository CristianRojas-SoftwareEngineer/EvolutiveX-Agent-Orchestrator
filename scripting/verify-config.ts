/**
 * Configuración canónica de la pipeline de verificación.
 *
 * Este módulo es la **única fuente de verdad** sobre qué pasos ejecuta la
 * pipeline, en qué orden, y con qué dependencias. Es consumido por:
 *   - `scripting/verify-package-scripts.ts` (vía `import`).
 *   - `.claude/commands/verify-scripts.md` (vía la herramienta Read del agente).
 *
 * Cualquier paso nuevo o modificado se declara aquí. El script y el comando
 * derivan su comportamiento de este array; no duplican la enumeración.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/** Tipos de paso según su patrón de ejecución. */
export type StepKind = 'blocking' | 'background' | 'destructive' | 'restore';

/**
 * Patrón de verificación post-ejecución. Una función referenciada por su clave
 * en el registro `VERIFIERS`. El script la invoca tras ejecutar el comando.
 */
export type VerifierFn = (result: {
  exitCode: number;
  stdout: string;
  stderr: string;
}) => string | void;

/** Estructura de un paso de verificación. */
export interface VerifyStep {
  /** Identificador estable y único dentro de `VERIFY_STEPS`. */
  id: string;
  /** Nombre del script de `package.json` (opcional: vacío para comandos bare como `npm install`). */
  script: string;
  /** Argumentos completos que se pasan a `npm`. */
  args: string[];
  /** Patrón de ejecución. */
  kind: StepKind;
  /** Patrones regex de éxito en stdout/stderr (obligatorio si `kind === 'background'`). */
  successPatterns?: string[];
  /** Clave de la función de verificación post-ejecución. */
  verifier?: string;
  /** IDs de pasos de los que depende este. Si alguno falla, este se omite. */
  dependsOn?: string[];
  /** Etiquetas legibles de controles de riesgo (informativo, narrado por el comando). */
  riskControls?: string[];
  /**
   * Si es `true`, el script NO ejecuta este paso y lo reporta como `skip` en el
   * reporte JSON. Usado para auto-referencias (ej. `verify:package-scripts`
   * dentro de su propia pipeline) y para pasos que referencian scripts
   * ausentes de `package.json` (drift documentado).
   */
  skip?: boolean;
  /** Razón legible del skip; obligatoria cuando `skip === true`. */
  skipReason?: string;
}

/**
 * Registro de verificadores post-ejecución. Mapea claves declaradas en
 * `VerifyStep.verifier` a implementaciones. Una clave inexistente produce un
 * error al inicio del script.
 *
 * Las funciones reciben el resultado del proceso ejecutado y, opcionalmente,
 * un contexto de runtime (paths absolutos del proyecto) que el script les
 * pasa al invocarlas. Esto evita que los verificadores dependan de variables
 * globales.
 */
export interface VerifierContext {
  projectRoot: string;
}

export const VERIFIERS: Record<
  string,
  (result: { exitCode: number; stdout: string; stderr: string }, ctx: VerifierContext) => string
> = {
  'expect-stdout': (result) => {
    if (!result.stdout || result.stdout.trim().length === 0) {
      throw new Error('No se capturó salida estándar.');
    }
    return 'Salida estándar capturada correctamente.';
  },
  'expect-non-zero-exit': (result) => {
    if (result.exitCode === 0) {
      throw new Error('Se esperaba salida no cero (camino de error) pero el comando salió 0.');
    }
    return `Salida no cero confirmada (código ${result.exitCode}) — CLI valida argumento.`;
  },
  'path-present-agents-claude': (_result, ctx) => {
    const targets = [join(ctx.projectRoot, 'AGENTS.md'), join(ctx.projectRoot, 'CLAUDE.md')];
    const missing = targets.filter((p) => !existsSync(p));
    if (missing.length > 0) {
      throw new Error(`Faltan archivos de referencia: ${missing.join(', ')}`);
    }
    return 'AGENTS.md y CLAUDE.md presentes (hardlink esperado).';
  },
  'path-present-dist': (_result, ctx) => {
    const dist = join(ctx.projectRoot, 'dist');
    if (!existsSync(dist)) {
      throw new Error('dist/ no existe después del build.');
    }
    return 'dist/ presente.';
  },
  'path-present-dist-js': (_result, ctx) => {
    const js = join(ctx.projectRoot, 'dist/index.js');
    if (!existsSync(js)) {
      throw new Error('dist/index.js no fue generado.');
    }
    return 'dist/index.js generado.';
  },
  'any-files-exist-dist-d-ts': (_result, ctx) => {
    const dist = join(ctx.projectRoot, 'dist');
    if (!existsSync(dist)) {
      throw new Error('No hay archivos .d.ts bajo dist/ (directorio ausente).');
    }
    const files = readdirSync(dist).filter((f) => f.endsWith('.d.ts'));
    if (files.length === 0) {
      throw new Error('No hay archivos .d.ts bajo dist/.');
    }
    return `${files.length} archivo(s) .d.ts bajo dist/.`;
  },
  'path-present-dist-js-and-d-ts': (_result, ctx) => {
    const js = join(ctx.projectRoot, 'dist/index.js');
    if (!existsSync(js)) {
      throw new Error('dist/index.js no fue regenerado.');
    }
    const dist = join(ctx.projectRoot, 'dist');
    const dts = readdirSync(dist).filter((f) => f.endsWith('.d.ts'));
    if (dts.length === 0) {
      throw new Error('No hay archivos .d.ts bajo dist/.');
    }
    return `dist/ regenerado (index.js + ${dts.length} .d.ts).`;
  },
  'path-absent-dist': (_result, ctx) => {
    const dist = join(ctx.projectRoot, 'dist');
    if (existsSync(dist)) {
      throw new Error('dist/ aún existe después de clean:dist.');
    }
    return 'dist/ eliminado.';
  },
  'path-absent-sessions': (_result, ctx) => {
    const sessions = join(ctx.projectRoot, 'sessions');
    if (existsSync(sessions)) {
      throw new Error('sessions/ aún existe después de clean:sessions.');
    }
    return 'sessions/ eliminado.';
  },
  'path-absent-server': (_result, ctx) => {
    const server = join(ctx.projectRoot, 'server');
    if (existsSync(server)) {
      throw new Error('server/ aún existe después de clean:logs.');
    }
    return 'server/ eliminado.';
  },
  'path-absent-node-modules': (_result, ctx) => {
    const nm = join(ctx.projectRoot, 'node_modules');
    if (existsSync(nm)) {
      throw new Error('node_modules/ aún existe después de clean:modules.');
    }
    return 'node_modules/ eliminado.';
  },
  'path-present-node-modules': (_result, ctx) => {
    const nm = join(ctx.projectRoot, 'node_modules');
    if (!existsSync(nm)) {
      throw new Error('node_modules/ no existe tras npm install.');
    }
    return 'node_modules/ restaurado.';
  },
  'path-absent-dist-node-modules-sessions-server': (_result, ctx) => {
    const dirs = ['dist', 'node_modules', 'sessions', 'server'].map((d) =>
      join(ctx.projectRoot, d),
    );
    const present = dirs.filter((d) => existsSync(d));
    if (present.length > 0) {
      throw new Error(`Aún existen: ${present.join(', ')}`);
    }
    return '4 directorios eliminados (dist/, node_modules/, sessions/, server/).';
  },
};

/**
 * Lista canónica y ordenada de los 38 pasos de verificación.
 *
 * El orden de aparición es el orden de ejecución. El script itera
 * secuencialmente; los pasos con `dependsOn` no satisfecho se marcan como
 * `skip` con la razón «dependencia no satisfecha».
 */
export const VERIFY_STEPS: VerifyStep[] = [
  {
    id: 'help',
    script: 'help',
    args: ['run', 'help'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'configure-provider',
    script: 'configure:provider',
    args: ['run', 'configure:provider', '--', '--show-current'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'create-agents-reference',
    script: 'create:agents-reference',
    args: ['run', 'create:agents-reference'],
    kind: 'blocking',
    verifier: 'path-present-agents-claude',
  },
  {
    id: 'verify-package-scripts',
    script: 'verify:package-scripts',
    args: ['run', 'verify:package-scripts'],
    kind: 'blocking',
    skip: true,
    skipReason: 'Auto-referencia: este paso es el script mismo; lo emite la pipeline al invocarse.',
  },
  {
    id: 'install-statusline-dry-run',
    script: 'install:statusline',
    args: ['run', 'install:statusline', '--', '--dry-run'],
    kind: 'blocking',
    skip: true,
    skipReason:
      'Drift de package.json: el script `install:statusline` ya no existe. Se conserva el paso para auditoría histórica; remediación pendiente.',
  },
  {
    id: 'install-notifications-dry-run',
    script: 'install:notifications',
    args: ['run', 'install:notifications', '--', '--dry-run'],
    kind: 'blocking',
    skip: true,
    skipReason:
      'Drift de package.json: el script `install:notifications` ya no existe. Se conserva el paso para auditoría histórica; remediación pendiente.',
  },
  {
    id: 'setup-dry-run',
    script: 'setup',
    args: ['run', 'setup', '--', '--dry-run'],
    kind: 'blocking',
    skip: true,
    skipReason:
      'Drift de package.json: el script `setup` ya no existe; reemplazado por `setup:install` y `setup:uninstall`. Remediación pendiente.',
  },
  {
    id: 'notifications-register',
    script: 'notifications:register',
    args: ['run', 'notifications:register'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'lint',
    script: 'lint',
    args: ['run', 'lint'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'typecheck',
    script: 'typecheck',
    args: ['run', 'typecheck'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'test-unit',
    script: 'test:unit',
    args: ['run', 'test:unit'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'test-integration',
    script: 'test:integration',
    args: ['run', 'test:integration'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'format',
    script: 'format',
    args: ['run', 'format'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'lint-fix',
    script: 'lint:fix',
    args: ['run', 'lint:fix'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'clean-dist',
    script: 'clean:dist',
    args: ['run', 'clean:dist'],
    kind: 'destructive',
    verifier: 'path-absent-dist',
    riskControls: ['restore-build'],
  },
  {
    id: 'build-js',
    script: 'build:js',
    args: ['run', 'build:js'],
    kind: 'blocking',
    verifier: 'path-present-dist-js',
    dependsOn: ['clean-dist'],
  },
  {
    id: 'build-types',
    script: 'build:types',
    args: ['run', 'build:types'],
    kind: 'blocking',
    verifier: 'any-files-exist-dist-d-ts',
    dependsOn: ['clean-dist'],
  },
  {
    id: 'build',
    script: 'build',
    args: ['run', 'build'],
    kind: 'blocking',
    verifier: 'path-present-dist-js-and-d-ts',
    dependsOn: ['clean-dist'],
  },
  {
    id: 'test-quick',
    script: 'test:quick',
    args: ['run', 'test:quick'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'test',
    script: 'test',
    args: ['test'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'start',
    script: 'start',
    args: ['start'],
    kind: 'background',
    successPatterns: ['listening', 'Proxy levantado'],
    riskControls: ['background-kill'],
  },
  {
    id: 'dev',
    script: 'dev',
    args: ['run', 'dev'],
    kind: 'background',
    successPatterns: ['listening', 'Proxy levantado'],
    riskControls: ['background-kill'],
  },
  {
    id: 'test-watch',
    script: 'test:watch',
    args: ['run', 'test:watch'],
    kind: 'background',
    successPatterns: ['RUN'],
    riskControls: ['background-kill-by-name'],
  },
  {
    id: 'sessions-list',
    script: 'sessions:list',
    args: ['run', 'sessions:list'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'sessions-list-archived',
    script: 'sessions:list-archived',
    args: ['run', 'sessions:list-archived'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'sessions-sanitize-scan',
    script: 'sessions:sanitize:scan',
    args: ['run', 'sessions:sanitize:scan'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'sessions-archive-error-path',
    script: 'sessions:archive',
    args: ['run', 'sessions:archive', '--', '__verify-nonexistent-session-id__'],
    kind: 'blocking',
    verifier: 'expect-non-zero-exit',
    riskControls: ['safe-error-path'],
  },
  {
    id: 'sessions-restore-error-path',
    script: 'sessions:restore',
    args: ['run', 'sessions:restore', '--', '__verify-nonexistent-session-id__'],
    kind: 'blocking',
    verifier: 'expect-non-zero-exit',
    riskControls: ['safe-error-path'],
  },
  {
    id: 'sessions-delete-error-path',
    script: 'sessions:delete',
    args: ['run', 'sessions:delete', '--', '__verify-nonexistent-session-id__'],
    kind: 'blocking',
    verifier: 'expect-non-zero-exit',
    riskControls: ['safe-error-path'],
  },
  {
    id: 'sessions-sanitize-error-path',
    script: 'sessions:sanitize',
    args: ['run', 'sessions:sanitize', '--', '__verify-nonexistent-session-id__'],
    kind: 'blocking',
    verifier: 'expect-non-zero-exit',
    riskControls: ['safe-error-path'],
  },
  {
    id: 'sessions-sanitize-all',
    script: 'sessions:sanitize:all',
    args: ['run', 'sessions:sanitize:all', '--', '--force'],
    kind: 'blocking',
    verifier: 'expect-stdout',
  },
  {
    id: 'clean-sessions',
    script: 'clean:sessions',
    args: ['run', 'clean:sessions'],
    kind: 'destructive',
    verifier: 'path-absent-sessions',
    riskControls: ['restore-on-failure'],
  },
  {
    id: 'clean-logs',
    script: 'clean:logs',
    args: ['run', 'clean:logs'],
    kind: 'destructive',
    verifier: 'path-absent-server',
    riskControls: ['restore-on-failure'],
  },
  {
    id: 'clean-modules',
    script: 'clean:modules',
    args: ['run', 'clean:modules'],
    kind: 'destructive',
    verifier: 'path-absent-node-modules',
    riskControls: ['restore-node-modules'],
  },
  {
    id: 'restore-dependencies-after-modules',
    script: '',
    args: ['install'],
    kind: 'restore',
    dependsOn: ['clean-modules'],
    verifier: 'path-present-node-modules',
  },
  {
    id: 'clean-all',
    script: 'clean:all',
    args: ['run', 'clean:all'],
    kind: 'destructive',
    dependsOn: ['restore-dependencies-after-modules'],
    verifier: 'path-absent-dist-node-modules-sessions-server',
    riskControls: ['restore-everything'],
  },
  {
    id: 'restore-dependencies-after-all',
    script: '',
    args: ['install'],
    kind: 'restore',
    dependsOn: ['clean-all'],
    verifier: 'path-present-node-modules',
  },
  {
    id: 'restore-build-artifacts',
    script: 'build',
    args: ['run', 'build'],
    kind: 'restore',
    dependsOn: ['restore-dependencies-after-all'],
    verifier: 'path-present-dist-js-and-d-ts',
  },
];
