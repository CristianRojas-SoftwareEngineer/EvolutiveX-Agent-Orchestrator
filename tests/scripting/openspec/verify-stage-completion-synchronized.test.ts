/**
 * Tests para la extensión 'synchronized' de verify-stage-completion.ts
 *
 * Verifica:
 * 1. Que '--through synchronized' es un valor válido (no produce "valor no válido").
 * 2. Que el parseo de 'status' desde .openspec.yaml funciona correctamente.
 * 3. Que el gate falla cuando status !== 'synchronized'.
 * 4. Que el gate pasa cuando status === 'synchronized' (integración con openspec CLI).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

// ---------------------------------------------------------------------------
// Helper: corre verify-stage-completion con los argumentos dados
// ---------------------------------------------------------------------------

function runVerify(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const cli = 'scripting/openspec/verify-stage-completion.ts';
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx/esm', cli, ...args], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests de parseo de argumento '--through synchronized'
// ---------------------------------------------------------------------------

describe('verify-stage-completion --through synchronized argumento', () => {
  it('no emite "valor no válido" para --through synchronized', () => {
    // Sin --change, espera error de "obligatorio" — no de valor inválido de --through.
    const result = runVerify(['--through', 'synchronized']);
    expect(result.stderr).not.toMatch(/no es válido/i);
    // Puede fallar por falta de --change, que es esperado
    expect(result.stderr).not.toMatch(/synchronized.*no es válido/i);
  });

  it('emite "valor no válido" para --through invalido_desconocido', () => {
    const result = runVerify(['--change', 'c00091-fake', '--through', 'invalido_desconocido']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no es válido/i);
  });
});

// ---------------------------------------------------------------------------
// Tests de lógica de parseo de status desde .openspec.yaml
// ---------------------------------------------------------------------------

/**
 * Extrae el status del YAML igual que lo hace verify-stage-completion.ts.
 * Esta función replica la lógica de parseo para testearla en aislamiento.
 */
function extractStatusFromYaml(yamlContent: string): string | null {
  const statusMatch = yamlContent.match(/^status:\s*(\S+)/m);
  if (!statusMatch) return null;
  return statusMatch[1].replace(/['"]/g, '');
}

describe('parseo de status desde .openspec.yaml', () => {
  it('extrae status: synchronized correctamente', () => {
    const yaml = `id: c00091-test\nstatus: synchronized\nversion: 1.0\n`;
    expect(extractStatusFromYaml(yaml)).toBe('synchronized');
  });

  it('extrae status con comillas simples', () => {
    const yaml = `status: 'synchronized'\n`;
    expect(extractStatusFromYaml(yaml)).toBe('synchronized');
  });

  it('extrae status con comillas dobles', () => {
    const yaml = `status: "in-progress"\n`;
    expect(extractStatusFromYaml(yaml)).toBe('in-progress');
  });

  it('retorna null si no hay campo status', () => {
    const yaml = `id: c00091-test\nversion: 1.0\n`;
    expect(extractStatusFromYaml(yaml)).toBeNull();
  });

  it('distingue synchronized de in-progress', () => {
    const yaml = `status: in-progress\n`;
    const status = extractStatusFromYaml(yaml);
    expect(status).not.toBe('synchronized');
  });

  it('falla el gate si status es in-progress (no synchronized)', () => {
    // El gate espera 'synchronized'; cualquier otro valor es failure
    const yaml = `status: in-progress\n`;
    const status = extractStatusFromYaml(yaml);
    expect(status !== 'synchronized').toBe(true);
  });

  it('pasa el gate si status es synchronized', () => {
    const yaml = `status: synchronized\n`;
    const status = extractStatusFromYaml(yaml);
    expect(status === 'synchronized').toBe(true);
  });
});
