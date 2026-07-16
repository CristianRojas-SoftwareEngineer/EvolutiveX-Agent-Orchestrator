# Proveedores del routing de Smart Code Proxy

Este directorio contiene la configuración de proveedores LLM compatibles con la API Anthropic para Claude Code.

## Workflow para agregar un nuevo proveedor

### 1. Estructura del directorio

```bash
mkdir -p routing/providers/<nombre-prov>/models/<modelo-slug>
```

### 2. Crear `config.json` (obligatorio)

```json
{
  "AUTH_METHOD": "bearer" | "api_key" | "oauth",
  "ANTHROPIC_BASE_URL": "https://api.ejemplo.com",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "models/<modelo>",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "models/<modelo>",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "models/<modelo>",
  "ANTHROPIC_DEFAULT_FABLE_MODEL": "models/<modelo>",
  "CLAUDE_CODE_SUBAGENT_MODEL": "models/<modelo>"
}
```

**Métodos de autenticación:**
- `bearer` — Header `Authorization: Bearer <token>` (ej. OpenRouter, AgentRouter)
- `api_key` — Header `X-Api-Key: <key>` (ej. Anthropic directo)
- `oauth` — Sin credenciales en settings.json (suscripción PRO/Max)

### 3. Crear `secrets.json` (opcional según método)

```json
{
  "ANTHROPIC_AUTH_TOKEN": "sk-xxx",  // Para bearer
  "ANTHROPIC_API_KEY": "sk-xxx"      // Para api_key
}
```

### 4. Crear modelos (opcional)

`routing/providers/<proveedor>/models/<slug>/metadata.json`:

```json
{
  "modelId": "<modelo-real>",
  "displayName": "Nombre visible en statusline"
}
```

### 5. Verificar la configuración

```bash
npx tsx scripting/provider/configure-provider.ts <nombre-prov> --dry-run
npx tsx scripting/provider/configure-provider.ts --show-current
```

## Proveedores existentes

| Proveedor | Endpoint | Auth | Descripción |
|-----------|----------|------|-------------|
| `anthropic` | `https://api.anthropic.com` | api_key / oauth | API oficial de Anthropic |
| `agentrouter` | `https://agentrouter.org` | bearer | Gateway multi-provider que enruta a Claude |
| `openrouter` | `https://openrouter.ai/api` | bearer | Gateway con múltiples modelos |
| `minimax` | `https://api.minimax.io/anthropic` | bearer | API compatible con cuota integrada |
| `ollama` | `http://localhost:11434` | bearer | LLM local |
| `xiaomi` | `https://token-plan-sgp.xiaomimimo.com/anthropic` | bearer | Xiaomi MiniMax |
| `opencode` | `https://opencode.ai/zen/v1/messages` | bearer | OpenCode Zen |

## Nota sobre Gemini

El directorio `routing/providers/gemini/` es **exclusivo para TTS** (texto a voz), no para LLM. Se usa como proveedor de texto para la síntesis de voz en los hooks de notificaciones, no como proveedor de inferencia para Claude Code. No requiere `config.json` porque su configuración está hardcodeada en `GeminiTtsTextProvider`.