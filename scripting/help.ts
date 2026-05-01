import chalk from 'chalk';

interface NpmScript {
  name: string;
  description: string;
  category: 'local' | 'production' | 'recovery';
}

const scripts: NpmScript[] = [
  // Entorno Local
  { name: 'dev', description: 'Levanta servidor TS en vivo (tsx)', category: 'local' },
  { name: 'lint', description: 'Analiza la calidad estática del código (ESLint)', category: 'local' },
  { name: 'lint:fix', description: 'Repara auto. problemas corregibles del linting', category: 'local' },
  { name: 'typecheck', description: 'Chequeo de tipos TypeScript (tsc --noEmit)', category: 'local' },
  { name: 'format', description: 'Unifica tabulaciones e indentaciones (Prettier)', category: 'local' },
  { name: 'help', description: 'Muestra este panel de referencia de scripts', category: 'local' },
  { name: 'test', description: 'Validación integral (ESLint + TypeScript + Vitest + Compilación)', category: 'local' },
  { name: 'test:unit', description: 'Ejecuta pruebas unitarias aisladas', category: 'local' },
  { name: 'test:integration', description: 'Ejecuta pruebas de integración', category: 'local' },
  { name: 'test:watch', description: 'Modo observador para desarrollo TDD', category: 'local' },
  { name: 'configure:provider', description: 'Configura el proveedor activo de Claude Code (multiplataforma)', category: 'local' },

  // Producción
  { name: 'build', description: 'Compila óptimamente para Producción (tsup + tsc)', category: 'production' },
  { name: 'build:js', description: 'Compila JavaScript con tsup (ESM)', category: 'production' },
  { name: 'build:types', description: 'Genera declaraciones de tipos TypeScript (.d.ts)', category: 'production' },
  { name: 'start', description: 'Ejecuta servidor crudo desde dist/index.js', category: 'production' },

  // Sistema de Recuperación
  { name: 'clean:dist', description: 'Elimina carpeta compilada dist/', category: 'recovery' },
  { name: 'clean:modules', description: 'Purga caché de node_modules/', category: 'recovery' },
  { name: 'clean:sessions', description: 'Elimina datos de auditoría (./sessions)', category: 'recovery' },
  { name: 'clean:logs', description: 'Elimina logs acumulados (./logs)', category: 'recovery' },
  { name: 'clean', description: '[Nuclear] Paraleliza borrado de dist y modules', category: 'recovery' },
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
  const hint =
    script.name === 'dev' ? ` ${chalk.yellow('[Principal usage]')}` : '';
  console.log(`  ${cmd}  -> ${script.description}${hint}`);
}

console.log('');
