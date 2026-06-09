/** Estado de resolución de una invocación de herramienta. */
export type ToolUseStatus = 'pending' | 'running' | 'completed' | 'rejected' | 'error';

/** Canal canónico que completa el resultado del tool_use. */
export type ToolCompletionAuthority = 'continuation' | 'hook';
