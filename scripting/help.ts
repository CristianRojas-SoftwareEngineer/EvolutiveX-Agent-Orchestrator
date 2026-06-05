import chalk from 'chalk';

interface NpmScript {
  name: string;
  description: string;
  category: 'local' | 'production' | 'recovery';
}

const scripts: NpmScript[] = [
  // Entorno Local
  { name: 'dev', description: 'Levanta servidor TS en vivo (tsx)', category: 'local' },
  {
    name: 'lint',
    description: 'Analiza la calidad estática del código (ESLint)',
    category: 'local',
  },
  {
    name: 'lint:fix',
    description: 'Repara auto. problemas corregibles del linting',
    category: 'local',
  },
  {
    name: 'typecheck',
    description: 'Chequeo de tipos TypeScript (tsc --noEmit)',
    category: 'local',
  },
  {
    name: 'format',
    description: 'Unifica tabulaciones e indentaciones (Prettier)',
    category: 'local',
  },
  { name: 'help', description: 'Muestra este panel de referencia de scripts', category: 'local' },
  {
    name: 'test',
    description: 'Validación integral paralela (Lint‖Typecheck → Tests → Build)',
    category: 'local',
  },
  {
    name: 'test:quick',
    description: '[Rápido] Lint + Typecheck + Tests sin build',
    category: 'local',
  },
  { name: 'test:unit', description: 'Ejecuta pruebas unitarias aisladas', category: 'local' },
  { name: 'test:integration', description: 'Ejecuta pruebas de integración', category: 'local' },
  { name: 'test:watch', description: 'Modo observador para desarrollo TDD', category: 'local' },
  {
    name: 'configure:provider',
    description: 'Configura el proveedor activo de Claude Code (multiplataforma)',
    category: 'local',
  },
  {
    name: 'create:agents-reference',
    description: 'Crea hardlink AGENTS.md → CLAUDE.md (multiplataforma)',
    category: 'local',
  },
  {
    name: 'setup:install',
    description: 'Instala las features de SCP en ~/.claude (statusline, voz, hooks). Flags: --statusline --voice --hooks --force --dry-run --root',
    category: 'local',
  },
  {
    name: 'setup:uninstall',
    description: 'Desinstala las features de SCP de ~/.claude. Flags: --statusline --voice --hooks --force --dry-run --root',
    category: 'local',
  },
  {
    name: 'notifications:register',
    description: 'Helper de AUMID Windows (--install, --uninstall, --status). Idempotente y opt-in; no-op con mensaje informativo en macOS/Linux.',
    category: 'local',
  },
  {
    name: 'sessions:list',
    description: 'Lista sesiones Claude Code del proyecto (--project)',
    category: 'local',
  },
  {
    name: 'sessions:archive',
    description: 'Archiva sesión(es) a ~/.claude/archived-sessions/',
    category: 'local',
  },
  {
    name: 'sessions:delete',
    description: 'Elimina sesión(es) permanentemente (requiere --force)',
    category: 'local',
  },
  {
    name: 'sessions:list-archived',
    description: 'Lista sesiones archivadas',
    category: 'local',
  },
  {
    name: 'sessions:restore',
    description: 'Restaura una sesión archivada',
    category: 'local',
  },
  {
    name: 'sessions:sanitize:scan',
    description: 'Detecta thinking blocks con firma inválida (Smart Code Proxy)',
    category: 'local',
  },
  {
    name: 'sessions:sanitize',
    description: 'Sanitiza una sesión por ID (npm run … -- <id>)',
    category: 'local',
  },
  {
    name: 'sessions:sanitize:all',
    description: 'Sanitiza en lote todas las sesiones corruptas (--force)',
    category: 'local',
  },

  // Producción
  {
    name: 'build',
    description: 'Compila óptimamente para Producción (tsup + tsc)',
    category: 'production',
  },
  { name: 'build:js', description: 'Compila JavaScript con tsup (ESM)', category: 'production' },
  {
    name: 'build:types',
    description: 'Genera declaraciones de tipos TypeScript (.d.ts)',
    category: 'production',
  },
  {
    name: 'start',
    description: 'Ejecuta servidor crudo desde dist/index.js',
    category: 'production',
  },

  // Sistema de Recuperación
  { name: 'clean:dist', description: 'Elimina carpeta compilada dist/', category: 'recovery' },
  { name: 'clean:modules', description: 'Purga caché de node_modules/', category: 'recovery' },
  {
    name: 'clean:sessions',
    description: 'Elimina datos de auditoría (./sessions)',
    category: 'recovery',
  },
  { name: 'clean:logs', description: 'Elimina logs acumulados (./server)', category: 'recovery' },
  {
    name: 'clean:all',
    description: '[Nuclear total] Purga dist/, modules/, sessions/ y server/',
    category: 'recovery',
  },
];

const categoryLabels: Record<NpmScript['category'], { icon: string; label: string }> = {
  local: { icon: '🛠', label: 'ENTORNO LOCAL (Desarrollo)' },
  production: { icon: '📦', label: 'PRODUCCIÓN (CI/CD)' },
  recovery: { icon: '🧹', label: 'SISTEMA DE RECUPERACIÓN (Troubleshooting)' },
};

console.log(chalk.bold.cyan('================================================='));
console.log(chalk.bold.cyan('   SMART CODE PROXY - SCRIPTS DE MANTENIMIENTO   '));
console.log(chalk.bold.cyan('=================================================\n'));

let lastCategory: NpmScript['category'] | null = null;

for (const script of scripts) {
  if (script.category !== lastCategory) {
    const cat = categoryLabels[script.category];
    console.log(`\n${chalk.bold.magenta(`${cat.icon}  ${cat.label}`)}`);
    lastCategory = script.category;
  }
  const cmd = chalk.green(`npm run ${script.name}`);
  const hint = script.name === 'dev' ? ` ${chalk.yellow('[Principal usage]')}` : '';
  console.log(`  ${cmd}  -> ${script.description}${hint}`);
}

console.log('');
