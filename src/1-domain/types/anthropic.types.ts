/**
 * Roles válidos en la conversación con Anthropic.
 */
export type AnthropicRole = 'user' | 'assistant';

/**
 * Tipos de bloques de contenido soportados por Anthropic.
 */
export type AnthropicBlockType =
  | 'text'
  | 'image'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'redacted_thinking';

/**
 * Representa un bloque de contenido individual en un mensaje.
 */
export interface AnthropicContentBlock {
  type: AnthropicBlockType;
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: unknown; // El input de herramienta es dinámico
  tool_use_id?: string;
  is_error?: boolean;
  thinking?: string;
  signature?: string;
}

/**
 * Representa un mensaje individual en una petición Anthropic.
 */
export interface AnthropicMessage {
  role: AnthropicRole;
  content: string | AnthropicContentBlock[];
}

/**
 * Cuerpo de una petición estándar a /v1/messages.
 */
export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens: number;
  metadata?: {
    user_id?: string;
    [key: string]: unknown;
  };
  stop_sequences?: string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: unknown[];
  tool_choice?: unknown;
}

/**
 * Métricas de uso de tokens devueltas por Anthropic.
 */
export interface AnthropicUsage {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  output_tokens: number;
  service_tier?: string;
  inference_geo?: string;
}

/**
 * Respuesta estándar completa (no-SSE) de la API de Anthropic.
 */
export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

/**
 * Definiciones de eventos para Server-Sent Events (SSE).
 */

export interface AnthropicSseMessageStart {
  type: 'message_start';
  message: AnthropicResponse;
}

export interface AnthropicSseContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block: AnthropicContentBlock;
}

export interface AnthropicSseContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'signature_delta' | 'thinking_delta' | 'input_json_delta';
    text?: string;
    signature?: string;
    thinking?: string;
    partial_json?: string;
  };
}

export interface AnthropicSseContentBlockStop {
  type: 'content_block_stop';
  index: number;
}

export interface AnthropicSseMessageDelta {
  type: 'message_delta';
  delta: {
    stop_reason: string | null;
    stop_sequence: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

export interface AnthropicSseMessageStop {
  type: 'message_stop';
}

export interface AnthropicSsePing {
  type: 'ping';
}

/**
 * Unión de todos los tipos de eventos SSE de Anthropic.
 */
export type AnthropicSseEvent =
  | AnthropicSseMessageStart
  | AnthropicSseContentBlockStart
  | AnthropicSseContentBlockDelta
  | AnthropicSseContentBlockStop
  | AnthropicSseMessageDelta
  | AnthropicSseMessageStop
  | AnthropicSsePing;
