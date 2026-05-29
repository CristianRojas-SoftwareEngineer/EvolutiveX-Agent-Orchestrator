import type { AgentContext } from '../types/audit.types.js';
import type { ClaudeHookEvent } from '../types/hook.types.js';
import type { IWorkflow } from '../interfaces/gateway/IWorkflow.js';
import type { IStep } from '../interfaces/gateway/IStep.js';
import type { IToolUse } from '../interfaces/gateway/IToolUse.js';
import type { IWorkflowResult } from '../interfaces/gateway/IWorkflowResult.js';

export interface WireSubagentEntry {
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  confirmed?: boolean;
  triggeringToolUseId?: string;
}

export interface IWorkflowRepository {
  // ── Métodos wire (C1/C2/C3) ──────────────────────────────────────────────

  /**
   * Registra un subagente abierto a partir de las cabeceras de agente wire.
   * Indexa la entrada por `agentCtx.agentId` si está presente.
   */
  openSubagentFromWire(sessionId: string, agentCtx: AgentContext): WireSubagentEntry;

  /**
   * Devuelve la entrada registrada para un agentId, o `undefined` si no existe.
   */
  getWorkflowByAgentId(agentId: string): WireSubagentEntry | undefined;

  /**
   * Confirma un subagente a partir de un evento hook `SubagentStart`.
   * Maneja la carrera hook-antes-wire creando un placeholder si la entrada aún no existe.
   */
  confirmSubagentFromHook(agentId: string, toolUseId?: string): void;

  // ── Métodos de lifecycle (G2) ─────────────────────────────────────────────

  /** Abre el workflow principal de la sesión; idempotente si ya existe. */
  openWorkflow(sessionId: string, agentCtx: AgentContext): IWorkflow;

  /** Abre un sub-workflow enlazado a un workflow padre y a un tool_use. */
  openSubagentWorkflow(
    sessionId: string,
    agentCtx: AgentContext,
    parentWorkflowId: string,
    parentToolUseId: string,
  ): IWorkflow;

  /** Recupera un workflow por su id. */
  getWorkflow(workflowId: string): IWorkflow | undefined;

  /** Adjunta un step al workflow. */
  registerStep(workflowId: string, step: IStep): void;

  /** Marca un step como cerrado (establece `closedAt`). */
  closeStep(workflowId: string, stepId: string): void;

  /** Registra un tool_use en el step correspondiente del workflow. */
  registerToolUse(workflowId: string, toolUse: IToolUse): void;

  /** Evalúa si el workflow puede cerrarse según §15.4. Sin efectos secundarios. */
  readyToClose(workflowId: string, hook: ClaudeHookEvent): boolean;

  /** Cierra el workflow invocando `buildWorkflowResult`; idempotente si ya está cerrado. */
  close(workflowId: string, hook: ClaudeHookEvent): IWorkflowResult;

  /**
   * Fija `languageModelId` con el primer modelo observado (idempotente).
   * No-op si el workflowId no existe.
   */
  setWorkflowModel(workflowId: string, modelId: string): void;
}
