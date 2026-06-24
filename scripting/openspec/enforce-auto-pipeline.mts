#!/usr/bin/env tsx
/**
 * Hook Stop → backstop determinista del pipeline AUTO de orchestrate-specification-delta.
 * Red de seguridad que respalda el conductor loop del LLM: mientras un run AUTO está en
 * vuelo, bloquea el fin de turno hasta que `archive` complete o se alcance una parada
 * admisible. Espeja el patrón de `scripting/hooks/post-hook-event.ts` (stdin, try/catch,
 * nunca lanza).
 *
 * Contrato del hook Stop (Claude Code): para bloquear el fin de turno se emite
 * `{ "decision": "block", "reason": "..." }` en stdout con exit 0; sin `decision: block`
 * el stop procede. El payload de entrada incluye `stop_hook_active`.
 *
 * La decisión vive en la función pura `decideAutoPipeline` (sin efectos secundarios),
 * testeable con entradas planas. El envoltorio `main` lee el filesystem, llama a la
 * función y aplica los efectos (borrar centinela, escribir halt, persistir stuckCount).
 *
 * Sentinel de doble nivel: `phase` (dueño: orquestador) + `stage` (dueño: subagente activo)
 * + `lastProgressKey` (formato `"phase#stage"`, dueño: subagente activo). El loop-guard
 * compara la clave compuesta para detectar congelamiento en cualquiera de las dos dimensiones.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin } from 'node:process';

/** Umbral por defecto del loop-guard: tras N intentos sin avanzar de etapa, libera el turno. */
export const DEFAULT_LOOP_GUARD_THRESHOLD = 3;

/** Forma persistida del centinela `openspec/.workbench/auto-pipeline.json`. */
export interface AutoPipelineSentinel {
    change: string;
    mode: string;
    /** Fase activa (dueño: orquestador). Valores: explorer|planner|implementer|closer. */
    phase: string;
    /** Etapa activa dentro de la fase (dueño: subagente activo). */
    stage: number;
    /** Clave compuesta "phase#stage" escrita atómicamente con stage (dueño: subagente activo). */
    lastProgressKey: string;
    startedAt: string;
    stuckCount: number;
}

/** Payload relevante del evento Stop. */
export interface StopHookPayload {
    stop_hook_active?: boolean;
    cwd?: string;
}

/** Entrada pura de la decisión: estado del filesystem + flag del evento. */
export interface DecisionInput {
    /** Centinela AUTO parseado, o null si no existe (GUIDED / sesión normal). */
    sentinel: AutoPipelineSentinel | null;
    /** Existe `auto-pipeline.halt.json`. */
    haltPresent: boolean;
    /** El change del centinela ya reside bajo `openspec/changes/archive/`. */
    isArchived: boolean;
    /** `stop_hook_active` del payload (true si un Stop hook ya corrió en este ciclo). */
    stopHookActive: boolean;
    /** Umbral del loop-guard. */
    threshold: number;
}

/** Efecto que el envoltorio debe aplicar tras la decisión (la función pura no escribe). */
export type DecisionEffect = 'none' | 'deleteSentinel' | 'writeHalt' | 'persistSentinel';

/** Resultado de la decisión. `block` gobierna el stdout; `effect`/`nextSentinel` los aplica main. */
export interface Decision {
    block: boolean;
    reason?: string;
    effect: DecisionEffect;
    /** Estado del centinela a persistir cuando `effect === 'persistSentinel'`. */
    nextSentinel?: AutoPipelineSentinel;
}

function buildBlockReason(sentinel: AutoPipelineSentinel): string {
    return (
        `Pipeline specification-delta en modo AUTO en vuelo (change: ${sentinel.change}, ` +
        `fase: ${sentinel.phase}, etapa: ${sentinel.stage}). No termines el turno: resuelve ` +
        `la próxima fase/etapa con \`openspec status --change "${sentinel.change}" --json\` e ` +
        `invócala de inmediato en este mismo turno vía el tool Skill. El turno solo puede ` +
        `terminar cuando \`archive\` (10/10) complete o se alcance una parada admisible.`
    );
}

/**
 * Decisión puramente por filesystem. Matriz exhaustiva (orden de evaluación = design D3):
 *   (a) sin centinela AUTO            → allow
 *   (b) halt presente                 → allow (cesión legítima)
 *   (c) change archivado              → allow + borrar centinela
 *   (d) loop-guard (phase+stage cong) → stuckCount++; supera umbral → allow + halt diagnóstico
 *   (e) resto                         → block (nombrando la próxima fase) + persistir centinela
 */
export function decideAutoPipeline(input: DecisionInput): Decision {
    const { sentinel, haltPresent, isArchived, stopHookActive, threshold } = input;

    // (a) Sin centinela AUTO: GUIDED o sesión normal — nunca interferimos.
    if (!sentinel) return { block: false, effect: 'none' };

    // (b) Halt presente: cesión legítima del turno (parada admisible / liberación previa).
    if (haltPresent) return { block: false, effect: 'none' };

    // (c) Change ya archivado: el pipeline terminó; permitir y limpiar el centinela huérfano.
    if (isArchived) return { block: false, effect: 'deleteSentinel' };

    // (d)+(e) Loop-guard y bloqueo. La clave compuesta "phase#stage" detecta congelamiento
    // en cualquiera de las dos dimensiones del sentinel. Solo se considera estancado si un
    // Stop ya corrió Y la clave no avanzó (stop_hook_active aislado no basta: es true en
    // todo Stop tras el primer block legítimo).
    const currentProgressKey = `${sentinel.phase}#${sentinel.stage}`;
    const stageStalled = stopHookActive && sentinel.lastProgressKey === currentProgressKey;
    const nextStuck = stageStalled ? sentinel.stuckCount + 1 : 0;

    if (nextStuck > threshold) {
        // Atasco real: liberar el turno con un halt diagnóstico para no enclavar la sesión.
        return { block: false, effect: 'writeHalt' };
    }

    // (e) Pipeline en vuelo: bloquear y persistir el contador / la clave observada.
    return {
        block: true,
        reason: buildBlockReason(sentinel),
        effect: 'persistSentinel',
        nextSentinel: {
            ...sentinel,
            stuckCount: nextStuck,
            lastProgressKey: currentProgressKey,
        },
    };
}

// ───────────────────────── Envoltorio (efectos de filesystem) ─────────────────────────

function getRepoRoot(): string {
    // <root>/scripting/openspec/enforce-auto-pipeline.mts → <root>
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, '..', '..');
}

function workbenchDir(root: string): string {
    return path.join(root, 'openspec', '.workbench');
}

function sentinelPath(root: string): string {
    return path.join(workbenchDir(root), 'auto-pipeline.json');
}

function haltPath(root: string): string {
    return path.join(workbenchDir(root), 'auto-pipeline.halt.json');
}

function readSentinel(root: string): AutoPipelineSentinel | null {
    try {
        const raw = fs.readFileSync(sentinelPath(root), 'utf8');
        const parsed = JSON.parse(raw) as AutoPipelineSentinel;
        if (
            !parsed ||
            typeof parsed.change !== 'string' ||
            parsed.mode !== 'auto' ||
            typeof parsed.phase !== 'string' ||
            typeof parsed.stage !== 'number'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/** Detecta si `change` reside bajo `openspec/changes/archive/` (incluido prefijo de fecha). */
function isChangeArchived(root: string, change: string): boolean {
    const archiveDir = path.join(root, 'openspec', 'changes', 'archive');
    try {
        if (fs.existsSync(path.join(archiveDir, change))) return true;
        const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
        // Nombres archivados con prefijo de fecha: `YYYY-MM-DD--<change>`.
        return entries.some((e) => e.isDirectory() && e.name.endsWith(`--${change}`));
    } catch {
        return false;
    }
}

export function applyEffect(root: string, decision: Decision): void {
    switch (decision.effect) {
        case 'deleteSentinel':
            try {
                fs.rmSync(sentinelPath(root), { force: true });
            } catch {
                /* idempotente */
            }
            return;
        case 'writeHalt': {
            const sentinel = decision.nextSentinel;
            try {
                fs.mkdirSync(workbenchDir(root), { recursive: true });
                fs.writeFileSync(
                    haltPath(root),
                    JSON.stringify(
                        {
                            reason: 'loop-guard',
                            releasedAt: new Date().toISOString(),
                            phase: sentinel?.phase,
                            stage: sentinel?.stage,
                        },
                        null,
                        2,
                    ),
                    'utf8',
                );
            } catch {
                /* nunca bloquear por error de escritura */
            }
            return;
        }
        case 'persistSentinel':
            if (decision.nextSentinel) {
                try {
                    fs.mkdirSync(workbenchDir(root), { recursive: true });
                    const tmp = sentinelPath(root) + '.tmp';
                    fs.writeFileSync(tmp, JSON.stringify(decision.nextSentinel, null, 2), 'utf8');
                    fs.renameSync(tmp, sentinelPath(root));
                } catch {
                    /* la falta de persistencia solo afecta al loop-guard, nunca lanza */
                }
            }
            return;
        case 'none':
        default:
            return;
    }
}

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
    try {
        const raw = await readStdin();
        const payload: StopHookPayload = raw.trim() ? JSON.parse(raw) : {};

        const root = getRepoRoot();
        const sentinel = readSentinel(root);

        const input: DecisionInput = {
            sentinel,
            haltPresent: fs.existsSync(haltPath(root)),
            isArchived: sentinel ? isChangeArchived(root, sentinel.change) : false,
            stopHookActive: payload.stop_hook_active === true,
            threshold: DEFAULT_LOOP_GUARD_THRESHOLD,
        };

        const decision = decideAutoPipeline(input);
        applyEffect(root, decision);

        if (decision.block && decision.reason) {
            process.stdout.write(JSON.stringify({ decision: 'block', reason: decision.reason }));
        }
    } catch {
        // Nunca bloquear el turno por un error del backstop; el stop procede.
    }
}

// Ejecutar solo como entrypoint del hook, no al importar desde el test.
const invokedDirectly = (() => {
    try {
        return (
            typeof process.argv[1] === 'string' &&
            path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
        );
    } catch {
        return false;
    }
})();

if (invokedDirectly) {
    main()
        .then(() => process.exit(0))
        .catch(() => process.exit(0));
}
