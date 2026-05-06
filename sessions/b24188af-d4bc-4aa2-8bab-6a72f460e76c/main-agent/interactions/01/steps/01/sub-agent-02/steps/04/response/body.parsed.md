# Respuesta del Asistente

> **Interacción:** Interacción Principal — Step 4 de 4
> **Modelo:** inclusionai/ling-2.6-1t:free

## Respuesta

I've successfully found comprehensive documentation about Claude Code subagents. Here's a summary of the key information:

## Overview of Claude Code Subagents

Subagents are specialized AI assistants that handle specific types of tasks in isolated context windows, keeping your main conversation clean and focused.

## Built-in Subagents

1. **Explore** - Fast, read-only agent (Haiku model) for codebase exploration
2. **Plan** - Research agent for planning mode (read-only tools)
3. **General-purpose** - Capable agent for complex multi-step tasks
4. **Helper agents** - Statusline setup, Claude Code guide, etc.

## Creating Custom Subagents

### Methods:
- **Interactive**: Use `/agents` command in Claude Code
- **Manual**: Create Markdown files with YAML frontmatter
- **CLI**: Use `--agents` flag with JSON configuration
- **Programmatic**: Via Agent SDK

### Configuration Options:
- `name` and `description` (required)
- `tools` / `disallowedTools` - Tool access control
- `model` - Sonnet, Opus, Haiku, or inherit
- `permissionMode` - Default, acceptEdits, auto, etc.
- `memory` - User, project, or local persistence
- `maxTurns` - Turn limit
- `skills` - Preload specific skills
- `isolation` - Set to "worktree" for isolated repository copy

## Scope and Priority

When multiple subagents share the same name, priority is:
1. Managed settings (highest)
2. CLI flag (current session)
3. Project (`.claude/agents/`)
4. User (`~/.claude/agents/`)
5. Plugin agents (lowest)

## Subagents vs Agent Teams

- **Subagents**: Run within your session, return summaries to main context
- **Agent Teams**: Independent Claude Code sessions that communicate peer-to-peer

## SDK Support

The Claude Agent SDK (Python/TypeScript) also supports subagents through the `agents` parameter in `ClaudeAgentOptions`, using `AgentDefinition` to specify custom agents with their own prompts, tools, and configurations.

This allows for building sophisticated multi-agent workflows where specialized agents handle different aspects of complex tasks while maintaining context isolation.



_(stop_reason: end_turn)_
