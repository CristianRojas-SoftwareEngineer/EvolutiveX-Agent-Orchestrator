/* eslint-disable no-undef */

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const magenta = "\x1b[35m";
const red = "\x1b[31m";

console.log(`${bold}${cyan}=================================================${reset}`);
console.log(`${bold}${cyan}   🚀 SMART CODE PROXY - SCRIPTS DE MANTENIMIENTO 🚀  ${reset}`);
console.log(`${bold}${cyan}=================================================${reset}\n`);

console.log(`${bold}${magenta}🛠  ENTORNO LOCAL (Desarrollo)${reset}`);
console.log(`  ${green}npm run dev${reset}       -> Levanta servidor TS en vivo (tsx) ${yellow}[Principal usage]${reset}`);
console.log(`  ${green}npm run lint${reset}      -> Analiza la calidad estática del código (ESLint)`);
console.log(`  ${green}npm run lint:fix${reset}  -> Repara auto. problemas corregibles del linting`);
console.log(`  ${green}npm run typecheck${reset} -> Chequeo de tipos TypeScript (tsc --noEmit)`);
console.log(`  ${green}npm run format${reset}    -> Unifica tabulaciones e identaciones (Prettier)`);
console.log(`  ${green}npm run help${reset}      -> Muestra este panel de referencia de scripts`);
console.log(`  ${green}npm test${reset}          -> Validación integral (ESLint + TypeScript + Vitest + Compilación)`);
console.log(`  ${green}npm run test:unit${reset}  -> Ejecuta pruebas unitarias aisladas`);
console.log(`  ${green}npm run test:integration${reset} -> Ejecuta pruebas de integración`);
console.log(`  ${green}npm run test:watch${reset} -> Modo observador para desarrollo TDD`);

console.log(`\n${bold}${magenta}📦  PRODUCCIÓN (CI/CD)${reset}`);
console.log(`  ${green}npm run build${reset}     -> Compila óptimamente para Producción. Ejecuta:`);
console.log(`                       ${cyan}• [0] clean:dist${reset} - Evita condiciones de carrera`);
console.log(`                       ${cyan}• [1] build:js${reset} - JavaScript veloz vía tsup (en paralelo)`);
console.log(`                       ${cyan}• [2] build:types${reset} - Checkeo de tipos vía tsc (en paralelo)`);
console.log(`  ${green}npm start${reset}         -> Ejecuta servidor crudo desde dist/index.js`);

console.log(`\n${bold}${magenta}🧹  SISTEMA DE RECUPERACIÓN (Troubleshooting)${reset}`);
console.log(`  ${green}npm run clean:dist${reset}    -> Elimina carpeta compilada dist/`);
console.log(`  ${green}npm run clean:modules${reset}   -> Purga caché de node_modules/`);
console.log(`  ${green}npm run clean:sessions${reset}  -> Elimina datos de auditoría (./sessions)`);
console.log(`  ${green}npm run clean${reset}           -> ${red}[Nuclear]${reset} Paraleliza borrado de dist y modules\n`);
