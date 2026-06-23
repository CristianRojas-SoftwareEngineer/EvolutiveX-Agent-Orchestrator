import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClaudeHookEvent } from '../1-domain/types/hook.types.js';
import type { Logger } from '../1-domain/types/logger.types.js';

/** Serializa un valor string para frontmatter YAML: lo envuelve en comillas dobles y escapa las internas. */
function yamlStr(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Proyecta eventos TaskCreate/TaskUpdate en archivos .md bajo <baseDir>/tasks/. */
export class KanbanBoardProjector {
  private readonly tasksDir: string;
  private readonly archiveDir: string;

  constructor(
    private readonly baseDir: string,
    private readonly logger?: Logger,
  ) {
    this.tasksDir = join(baseDir, 'tasks');
    this.archiveDir = join(baseDir, 'tasks', 'archive');
  }

  async onTaskCreate(event: ClaudeHookEvent): Promise<void> {
    const id = (event.toolResponse?.['task'] as Record<string, unknown> | undefined)?.['id'];
    if (typeof id !== 'string' || !id) {
      this.logger?.warn(
        { toolName: event.toolName },
        '[Kanban] TaskCreate sin id en tool_response — ignorado',
      );
      return;
    }

    const subject =
      typeof event.toolInput?.['subject'] === 'string' ? event.toolInput['subject'] : '';
    const description =
      typeof event.toolInput?.['description'] === 'string' ? event.toolInput['description'] : '';
    const metadata = event.toolInput?.['metadata'] as Record<string, unknown> | undefined;
    const group = typeof metadata?.['group'] === 'string' ? metadata['group'] : '';

    const iso = new Date().toISOString();
    const frontmatter = [
      '---',
      `id: ${yamlStr(id)}`,
      `title: ${yamlStr(subject)}`,
      `description: ${yamlStr(description)}`,
      `lane: todo`,
      `group: ${yamlStr(group)}`,
      `created: ${yamlStr(iso)}`,
      `updated: ${yamlStr(iso)}`,
      '---',
      '',
    ].join('\n');

    await mkdir(this.tasksDir, { recursive: true });
    await writeFile(join(this.tasksDir, `${id}.md`), frontmatter, 'utf8');
  }

  async onTaskUpdate(event: ClaudeHookEvent): Promise<void> {
    const taskId =
      typeof event.toolInput?.['taskId'] === 'string' ? event.toolInput['taskId'] : undefined;
    const status =
      typeof event.toolInput?.['status'] === 'string' ? event.toolInput['status'] : undefined;

    if (!taskId || !status) return;
    if (status !== 'in_progress' && status !== 'completed') return;

    const filePath = join(this.tasksDir, `${taskId}.md`);
    let content: string;
    try {
      content = await readFile(filePath, 'utf8');
    } catch {
      this.logger?.warn({ taskId }, '[Kanban] TaskUpdate: archivo no encontrado — ignorado');
      return;
    }

    const lane = status === 'in_progress' ? 'doing' : 'done';
    const updated = content
      .replace(/^lane: .+$/m, `lane: ${lane}`)
      .replace(/^updated: .+$/m, `updated: ${yamlStr(new Date().toISOString())}`);

    if (status === 'completed') {
      await mkdir(this.archiveDir, { recursive: true });
      await writeFile(filePath, updated, 'utf8');
      await rename(filePath, join(this.archiveDir, `${taskId}.md`));
    } else {
      await writeFile(filePath, updated, 'utf8');
    }
  }
}
