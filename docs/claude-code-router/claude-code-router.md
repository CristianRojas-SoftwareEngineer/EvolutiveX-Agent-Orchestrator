# Claude Code Router - Análisis de Implementación

> **Ubicación de instalación**: `C:\Users\Cristian\AppData\Roaming\npm\node_modules\@musistudio\claude-code-router`  
> **Versión**: 2.0.0  
> **Repositorio**: https://github.com/musistudio/claude-code-router

## Propósito

Claude Code Router (CCR) es una solución **producción-ready** que permite usar Claude Code (la interfaz CLI de Anthropic) con **cualquier modelo LLM** disponible a través de OpenRouter, DeepSeek, Gemini, Ollama, y otros proveedores, sin necesidad de una cuenta de Anthropic.

La clave del sistema es su **arquitectura de transformers** que realiza la traducción bidireccional entre:
- **API Messages de Anthropic** (formato que espera Claude Code)
- **API Chat Completions de OpenAI** (formato usado por OpenRouter y la mayoría de proveedores)

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Claude Code (CLI)                                  │
│                    Habla: API Anthropic (Messages)                         │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │ Anthropic Format (Requests/Responses)
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Claude Code Router (Proxy)                            │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              Sistema de Transformers (Cadena de Responsabilidad)    │   │
│   │                                                                     │   │
│   │   ┌────────────────┐    ┌────────────────┐    ┌────────────────┐   │   │
│   │   │ transformRequest│    │   Provider     │    │transformResponse│   │   │
│   │   │     In         │───>│   API Call     │───>│     Out        │   │   │
│   │   │                │    │                │    │                │   │   │
│   │   │ Anthropic ──>  │    │ OpenAI Format  │    │  OpenAI ──>    │   │   │
│   │   │ OpenAI Format  │    │                │    │ Anthropic      │   │   │
│   │   └────────────────┘    └────────────────┘    └────────────────┘   │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Transformers disponibles:                                                  │
│   • `OpenrouterTransformer`  - Enrutamiento y adaptación OpenRouter         │
│   • `DeepseekTransformer`    - Manejo de reasoning en DeepSeek                │
│   • `GeminiTransformer`      - Adaptación para Google Gemini                  │
│   • `OpenAITransformer`      - Base para cualquier API OpenAI-compatible      │
│   • `GroqTransformer`        - Optimizaciones para Groq                       │
│   • `TooluseTransformer`     - Manejo de tool calls                           │
│   • `EnhanceToolTransformer` - Mejora de parámetros de tools                  │
│   • `ReasoningTransformer`   - Manejo de campos de reasoning                  │
│   • `MaxTokenTransformer`    - Ajuste de límites de tokens                      │
│   • `CleancacheTransformer`  - Eliminación de cache_control                     │
│   • `SamplingTransformer`    - Manejo de temperatura, top_p, etc.             │
│                                                                              │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │ OpenAI Chat Completions Format
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OpenRouter / DeepSeek / Gemini / etc.                    │
│                    Habla: API OpenAI (Chat Completions)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Estructura del Proyecto (Monorepo)

```
@musistudio/claude-code-router/
├── packages/
│   ├── cli/              # Interfaz de línea de comandos (`ccr`)
│   ├── core/             # Lógica de transformación y enrutamiento
│   │   ├── src/
│   │   │   ├── transformer/   # ← Implementaciones de transformers
│   │   │   │   ├── index.ts
│   │   │   │   ├── anthropic.transformer.ts
│   │   │   │   ├── openrouter.transformer.ts
│   │   │   │   ├── openai.transformer.ts
│   │   │   │   ├── deepseek.transformer.ts
│   │   │   │   ├── gemini.transformer.ts
│   │   │   │   ├── groq.transformer.ts
│   │   │   │   ├── tooluse.transformer.ts
│   │   │   │   ├── enhancetool.transformer.ts
│   │   │   │   ├── reasoning.transformer.ts
│   │   │   │   ├── maxtoken.transformer.ts
│   │   │   │   ├── cleancache.transformer.ts
│   │   │   │   └── ...
│   │   │   ├── api/           # Endpoints HTTP
│   │   │   ├── services/      # Servicios de enrutamiento
│   │   │   ├── types/         # Tipos TypeScript
│   │   │   │   ├── transformer.ts
│   │   │   │   └── llm.ts
│   │   │   └── ...
│   │   └── package.json
│   ├── server/           # Servidor HTTP standalone
│   ├── shared/           # Utilidades compartidas
│   └── ui/               # Interfaz web de configuración
├── docs/                 # Documentación
└── blog/                 # Artículos y guías
```

---

## Interfaz Transformer

La interfaz base define el contrato para todos los transformers:

```typescript
// packages/core/src/types/transformer.ts

export interface TransformerOptions {
  [key: string]: any;
}

export interface TransformerContext {
  [key: string]: any;
}

export type TransformerConstructor = {
  new (options?: TransformerOptions): Transformer;
  TransformerName?: string;
};

export interface Transformer {
  /**
   * Transformar request entrante de formato Anthropic a formato Provider
   * Se ejecuta ANTES de enviar al upstream
   */
  transformRequestIn?: (
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext,
  ) => Promise<Record<string, any>>;

  /**
   * Transformar response entrante del Provider
   * Se ejecuta DESPUÉS de recibir del upstream, ANTES de transformar a Anthropic
   */
  transformResponseIn?: (
    response: Response, 
    context?: TransformerContext
  ) => Promise<Response>;

  /**
   * Transformar request saliente a formato común
   * (Usado internamente para normalización)
   */
  transformRequestOut?: (
    request: any, 
    context: TransformerContext
  ) => Promise<UnifiedChatRequest>;

  /**
   * Transformar response saliente de formato Provider a formato Anthropic
   * Se ejecuta ANTES de enviar la respuesta a Claude Code
   * Esta es la transformación CRÍTICA para SSE streaming
   */
  transformResponseOut?: (
    response: Response, 
    context: TransformerContext
  ) => Promise<Response>;

  /**
   * Endpoint específico del provider
   * Ejemplo: "/v1/chat/completions"
   */
  endPoint?: string;

  /**
   * Nombre identificador del transformer
   */
  name?: string;

  /**
   * Función de autenticación opcional
   */
  auth?: (
    request: any, 
    provider: LLMProvider, 
    context: TransformerContext
  ) => Promise<any>;
  
  /**
   * Logger para debugging
   */
  logger?: any;
}
```

---

## Implementación Detallada: OpenrouterTransformer

Este es el transformer más relevante para tu caso de uso. Demuestra cómo manejar la traducción completa Anthropic ↔ OpenAI.

### 1. Transformación de Request (`transformRequestIn`)

```typescript
// packages/core/src/transformer/openrouter.transformer.ts

export class OpenrouterTransformer implements Transformer {
  static TransformerName = "openrouter";

  constructor(private readonly options?: TransformerOptions) {}

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    
    // CASO 1: Modelos NO Anthropic (ej. Llama, Qwen, GPT)
    // Eliminar características Anthropic-specific
    if (!request.model.includes("claude")) {
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((item: any) => {
            // Eliminar cache_control (Anthropic-specific)
            if (item.cache_control) {
              delete item.cache_control;
            }
            
            // Transformar imágenes de formato Anthropic a OpenAI
            if (item.type === "image_url") {
              if (!item.image_url.url.startsWith("http")) {
                item.image_url.url = `${item.image_url.url}`;
              }
              // Eliminar media_type (campo Anthropic)
              delete item.media_type;
            }
          });
        } else if (msg.cache_control) {
          delete msg.cache_control;
        }
      });
    } 
    
    // CASO 2: Modelos Anthropic vía OpenRouter (ej. "anthropic/claude-3.5-sonnet")
    // Mantener formato pero ajustar imágenes
    else {
      request.messages.forEach((msg) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((item: any) => {
            if (item.type === "image_url") {
              if (!item.image_url.url.startsWith("http")) {
                // Convertir base64 a data URL completo
                item.image_url.url = `data:${item.media_type};base64,${item.image_url.url}`;
              }
              delete item.media_type;
            }
          });
        }
      });
    }
    
    // Aplicar opciones adicionales del transformer
    Object.assign(request, this.options || {});
    return request;
  }
}
```

### 2. Transformación de Response SSE (`transformResponseOut`)

Esta es la implementación más compleja. Maneja la traducción en tiempo real de streams SSE de OpenAI a formato Anthropic.

```typescript
async transformResponseOut(response: Response): Promise<Response> {
  // Solo procesar streams
  if (!response.headers.get("Content-Type")?.includes("stream")) {
    return response;
  }

  if (!response.body) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Estado del stream
  let hasTextContent = false;
  let reasoningContent = "";
  let isReasoningComplete = false;
  let hasToolCall = false;
  let buffer = ""; // Buffer para datos incompletos

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();

      // Procesar línea individual del stream
      const processLine = (
        line: string,
        context: {
          controller: ReadableStreamDefaultController;
          encoder: TextEncoder;
          hasTextContent: () => boolean;
          setHasTextContent: (val: boolean) => void;
          reasoningContent: () => string;
          appendReasoningContent: (content: string) => void;
          isReasoningComplete: () => boolean;
          setReasoningComplete: (val: boolean) => void;
        }
      ) => {
        // Solo procesar líneas de datos SSE
        if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
          const jsonStr = line.slice(6);
          
          try {
            const data = JSON.parse(jsonStr);

            // 1. MAPEAR finish_reason
            if (data.usage) {
              // Mapear de OpenAI: "stop" | "tool_calls" | "length" | "content_filter"
              // A Anthropic: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use"
              data.choices[0].finish_reason = hasToolCall
                ? "tool_calls"
                : "stop";
            }

            // 2. MANEJAR ERRORES
            if (data.choices?.[0]?.finish_reason === "error") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    error: data.choices?.[0].error,
                  })}\n\n`
                )
              );
            }

            // 3. TRANSFORMAR REASONING (DeepSeek-style)
            // OpenAI: delta.reasoning (string)
            // Anthropic: delta.thinking (object con content y signature)
            if (data.choices?.[0]?.delta?.reasoning) {
              context.appendReasoningContent(
                data.choices[0].delta.reasoning
              );
              
              const thinkingChunk = {
                ...data,
                choices: [
                  {
                    ...data.choices?.[0],
                    delta: {
                      ...data.choices[0].delta,
                      thinking: {
                        content: data.choices[0].delta.reasoning,
                      },
                    },
                  },
                ],
              };
              
              // Limpiar campo reasoning (OpenAI)
              if (thinkingChunk.choices?.[0]?.delta) {
                delete thinkingChunk.choices[0].delta.reasoning;
              }
              
              const thinkingLine = `data: ${JSON.stringify(
                thinkingChunk
              )}\n\n`;
              controller.enqueue(encoder.encode(thinkingLine));
              return;
            }

            // 4. FINALIZAR REASONING (cuando aparece contenido después de reasoning)
            if (
              data.choices?.[0]?.delta?.content &&
              context.reasoningContent() &&
              !context.isReasoningComplete()
            ) {
              context.setReasoningComplete(true);
              const signature = Date.now().toString();

              const thinkingChunk = {
                ...data,
                choices: [
                  {
                    ...data.choices?.[0],
                    delta: {
                      ...data.choices[0].delta,
                      content: null,
                      thinking: {
                        content: context.reasoningContent(),
                        signature: signature,
                      },
                    },
                  },
                ],
              };
              
              if (thinkingChunk.choices?.[0]?.delta) {
                delete thinkingChunk.choices[0].delta.reasoning;
              }
              
              const thinkingLine = `data: ${JSON.stringify(
                thinkingChunk
              )}\n\n`;
              controller.enqueue(encoder.encode(thinkingLine));
            }

            // 5. TRANSFORMAR TOOL CALLS
            // OpenAI: tool_calls[] con function.name, arguments (string JSON)
            // Anthropic: content blocks tipo tool_use con id, name, input
            if (data.choices?.[0]?.delta?.tool_calls?.length) {
              // Generar IDs consistentes si no existen
              if (
                !Number.isNaN(
                  parseInt(data.choices?.[0]?.delta?.tool_calls[0].id, 10)
                )
              ) {
                data.choices?.[0]?.delta?.tool_calls.forEach((tool: any) => {
                  tool.id = `call_${uuidv4()}`;
                });
              }
            }

            // Marcar que hemos visto tool_calls
            if (
              data.choices?.[0]?.delta?.tool_calls?.length &&
              !hasToolCall
            ) {
              hasToolCall = true;
            }

            // 6. AJUSTAR ÍNDICES DE TOOL CALLS
            // Cuando hay texto seguido de tool_calls, ajustar índices
            if (
              data.choices?.[0]?.delta?.tool_calls?.length &&
              context.hasTextContent()
            ) {
              if (typeof data.choices[0].index === "number") {
                data.choices[0].index += 1;
              } else {
                data.choices[0].index = 1;
              }
            }

            // Emitir línea transformada
            const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(modifiedLine));
            
          } catch (e) {
            // Si falla el parsing, pasar línea original
            controller.enqueue(encoder.encode(line + "\n"));
          }
          
        } else {
          // Pasar líneas no-data ([DONE], etc.)
          controller.enqueue(encoder.encode(line + "\n"));
        }
      };

      // Loop principal de lectura del stream
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Procesar buffer restante
            if (buffer.trim()) {
              processBuffer(buffer, controller, encoder);
            }
            break;
          }

          if (!value || value.length === 0) {
            continue;
          }

          // Decodificar chunk
          let chunk;
          try {
            chunk = decoder.decode(value, { stream: true });
          } catch (decodeError) {
            console.warn("Failed to decode chunk", decodeError);
            continue;
          }

          if (chunk.length === 0) {
            continue;
          }

          buffer += chunk;

          // Límite de seguridad para buffer (1MB)
          if (buffer.length > 1000000) {
            console.warn(
              "Buffer size exceeds limit, processing partial data"
            );
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim()) {
                try {
                  processLine(line, {...context});
                } catch (error) {
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
            continue;
          }

          // Procesar líneas completas del buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Última línea puede estar incompleta

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              processLine(line, {
                controller,
                encoder,
                hasTextContent: () => hasTextContent,
                setHasTextContent: (val) => (hasTextContent = val),
                reasoningContent: () => reasoningContent,
                appendReasoningContent: (content) =>
                  (reasoningContent += content),
                isReasoningComplete: () => isReasonasoningComplete,
                setReasoningComplete: (val) =>
                  (isReasoningComplete = val),
              });
            } catch (error) {
              console.error("Error processing line:", line, error);
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        }
      } catch (error) {
        console.error("Stream error:", error);
        controller.error(error);
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {
          console.error("Error releasing reader lock:", e);
        }
        controller.close();
      }
    },
  });

  // Retornar nueva Response con stream transformado
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## Mapeo de Formatos Detallado

### Requests: Anthropic → OpenAI

| Campo Anthropic | Campo OpenAI | Transformación |
|-----------------|--------------|----------------|
| `model` | `model` | Directo. Ej: `"claude-3-5-sonnet"` → `"anthropic/claude-3.5-sonnet"` |
| `messages[].role` | `messages[].role` | Directo: `user`/`assistant`/`system` |
| `messages[].content` (string) | `messages[].content` (string) | Directo |
| `messages[].content` (array de blocks) | `messages[].content` (string) | **Flatten**: Concatenar textos, extraer tool_calls |
| `content_blocks.text` | `content` | Extraer string |
| `content_blocks.tool_use` | `tool_calls` | Transformar a formato OpenAI |
| `content_blocks.tool_result` | `tool` role message | Transformar a mensaje con `role: "tool"` |
| `tools[].name` | `tools[].function.name` | Anidar bajo `function` |
| `tools[].input_schema` | `tools[].function.parameters` | Renombrar campo |
| `tool_choice` | `tool_choice` | Directo |
| `max_tokens` | `max_tokens` | Directo |
| `temperature` | `temperature` | Directo |
| `top_p` | `top_p` | Directo |
| `system` (string) | `messages[0]` con `role: "system"` | Convertir a mensaje |
| `metadata.user_id` | `user` | Renombrar campo |
| `cache_control` | — | **Eliminar** (Anthropic-specific) |
| `media_type` (en imágenes) | — | **Eliminar** |

### Responses: OpenAI → Anthropic (SSE Events)

| Evento OpenAI | Evento Anthropic | Transformación |
|---------------|------------------|----------------|
| `chunk.choices[0].delta.content` | `content_block_delta` con `text_delta` | Envolver en estructura Anthropic |
| `chunk.choices[0].delta.tool_calls[]` | `content_block_start` con `tool_use` | Crear content block |
| `chunk.choices[0].delta.tool_calls[].function.name` | `content_block.name` | Mapear a tool_use |
| `chunk.choices[0].delta.tool_calls[].function.arguments` | `content_block.input` | Parsear JSON string → object |
| `chunk.choices[0].delta.tool_calls[].id` | `content_block.id` | Preservar o generar UUID |
| `chunk.choices[0].finish_reason: "stop"` | `message_delta.stop_reason: "end_turn"` | Mapear valor |
| `chunk.choices[0].finish_reason: "tool_calls"` | `message_delta.stop_reason: "tool_use"` | Mapear valor |
| `chunk.choices[0].delta.reasoning` | `content_block_delta.thinking` | Transformar a thinking block |
| `chunk.usage.prompt_tokens` | `usage.input_tokens` | Renombrar campo |
| `chunk.usage.completion_tokens` | `usage.output_tokens` | Renombrar campo |

---

## Sistema de Enrutamiento

CCR permite configurar múltiples providers y reglas de enrutamiento:

### Configuración de Ejemplo

```json
{
  "APIKEY": "optional-secret-for-security",
  "HOST": "127.0.0.1",
  "LOG": true,
  "API_TIMEOUT_MS": 600000,
  
  "Providers": [
    {
      "name": "openrouter-oss",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "$OPENROUTER_API_KEY",
      "models": [
        "meta-llama/llama-3.3-70b-instruct",
        "qwen/qwen-2.5-72b-instruct",
        "deepseek/deepseek-chat",
        "mistralai/mistral-large"
      ],
      "transformer": {
        "use": ["openrouter"]
      }
    },
    {
      "name": "deepseek-direct",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "transformer": {
        "use": ["deepseek"],
        "deepseek-chat": {
          "use": ["tooluse"]
        }
      }
    }
  ],
  
  "Router": {
    "default": "openrouter-oss,meta-llama/llama-3.3-70b-instruct",
    "background": "openrouter-oss,qwen/qwen-2.5-72b-instruct",
    "think": "deepseek-direct,deepseek-reasoner",
    "longContext": "openrouter-oss,google/gemini-2.5-pro-preview",
    "longContextThreshold": 60000
  }
}
```

### Selección Dinámica de Modelos

Dentro de Claude Code, puedes cambiar modelos en tiempo real:

```
/model openrouter-oss,meta-llama/llama-3.3-70b-instruct
```

---

## Integración con Smart Code Proxy

### Opción 1: Usar CCR como Upstream (Recomendado)

La forma más simple de combinar observabilidad con traducción:

```
Claude Code ──> Smart Code Proxy ──> CCR ──> OpenRouter
                (Auditoría)       (Traducción)
```

**Configuración de Smart Code Proxy** (`.env`):
```bash
UPSTREAM_ORIGIN=http://127.0.0.1:3456
PORT=8787
```

**Iniciar servicios**:
```bash
# 1. Iniciar CCR en puerto 3456
ccr start

# 2. Iniciar Smart Code Proxy en puerto 8787
npm run dev

# 3. Usar Claude Code apuntando al proxy
ANTHROPIC_BASE_URL=http://localhost:8787 claude
```

**Ventajas**:
- ✅ No duplicar código de traducción
- ✅ CCR ya resuelve todos los edge cases
- ✅ Auditoría completa en Smart Code Proxy
- ✅ Puedes cambiar modelos en tiempo real

### Opción 2: Portar Lógica a Smart Code Proxy

> **Nota:** Esta sección es una **propuesta no implementada** (futuro). Los archivos y rutas mencionados (`src/2-services/protocol-translator/`, `src/2-services/upstream-router.service.ts`) no existen actualmente en el código fuente. Se documenta como referencia de diseño para una posible implementación futura.

Si necesitas un sistema unificado, puedes adaptar el código de CCR:

**Nuevos archivos a crear en Smart Code Proxy**:
```
src/
├── 2-services/
│   ├── protocol-translator/
│   │   ├── transformers/
│   │   │   ├── base.transformer.ts      # Interfaz Transformer
│   │   │   ├── openrouter.transformer.ts # Adaptación OpenRouter
│   │   │   └── index.ts
│   │   └── transformer-registry.ts
│   └── upstream-router.service.ts
```

**Adaptación de `OpenrouterTransformer`**:
El código puede reutilizarse casi directamente, solo necesitas:
1. Reemplazar `UnifiedChatRequest` con el tipo de request de tu dominio
2. Adaptar el manejo de streams a la API de Node.js (vs Web Streams)
3. Integrar con tu sistema de logging existente

---

## Lecciones Clave para Implementación

### 1. Buffering de Tool Calls Parciales

OpenAI envía tool_calls como JSON parcial en múltiples deltas:

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\""}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"name\""}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":": \""}}]}}]}
```

CCR acumula estos chunks hasta que el JSON está completo, luego emite el `content_block_start` de Anthropic.

### 2. Manejo de Reasoning (DeepSeek-style)

Algunos modelos (DeepSeek) envían razonamiento separado del contenido:
- **Fase 1**: Solo `delta.reasoning` (sin content)
- **Fase 2**: `delta.content` aparece

CCR detecta esta transición y:
1. Envía reasoning como `thinking` block
2. Marca con signature cuando reasoning está completo
3. Luego procede con content normal

### 3. Eliminación Condicional de Cache

El `cache_control` de Anthropic causa errores en providers que no lo entienden. CCR:
- Lo elimina para modelos no-Anthropic
- Lo preserva para modelos Anthropic vía OpenRouter

### 4. Endpoint Uniforme

CCR usa siempre `/v1/chat/completions` para todos los providers OpenAI-compatible, independientemente del provider real.

---

## Referencias

| Recurso | Ubicación |
|---------|-----------|
| CCR Instalado | `C:\Users\Cristian\AppData\Roaming\npm\node_modules\@musistudio\claude-code-router` |
| Transformers Core | `packages/core/src/transformer/` |
| Interfaz Transformer | `packages/core/src/types/transformer.ts` |
| OpenRouter Transformer | `packages/core/src/transformer/openrouter.transformer.ts` |
| DeepSeek Transformer | `packages/core/src/transformer/deepseek.transformer.ts` |
| Documentación | https://musistudio.github.io/claude-code-router/ |
| Repositorio | https://github.com/musistudio/claude-code-router |

---

## Resumen Ejecutivo

Claude Code Router demuestra que la traducción bidireccional Anthropic ↔ OpenAI es **factible y producción-ready**. Los puntos clave son:

1. **Arquitectura de Transformers**: Sistema extensible que permite encadenar transformaciones
2. **Stream Transformation**: La transformación SSE en tiempo real es la parte más compleja pero resuelta
3. **Buffering Inteligente**: Tool calls parciales y reasoning requieren acumulación de estado
4. **Eliminación de Features No Soportadas**: Cache control, media_type deben eliminarse para modelos no-Anthropic
5. **Configuración Declarativa**: JSON config permite enrutar a múltiples providers/modelos

Para usar modelos open source económicos con Claude Code y mantener observabilidad completa, la **Opción 1** (CCR como upstream de Smart Code Proxy) es la solución más pragmática y mantenible.
