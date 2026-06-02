import { describe, it, expect } from 'vitest';
import { posixToWindows, projectPathToSlug } from '../../../scripting/session-manager/shared/project-slug.js';

describe('project-slug', () => {
  it('convierte path POSIX /c/Users/... a Windows', () => {
    expect(posixToWindows('/c/Users/Cristian/foo')).toBe('C:\\Users\\Cristian\\foo');
  });

  it('codifica ruta Windows al slug de Claude Code', () => {
    const slug = projectPathToSlug('C:\\Users\\Cristian\\Desktop\\Proyectos\\Smart Code Proxy');
    expect(slug).toBe('C--Users-Cristian-Desktop-Proyectos-Smart-Code-Proxy');
  });

  it('normaliza drive en minúsculas', () => {
    expect(projectPathToSlug('c:/Users/Test')).toBe('C--Users-Test');
  });
});
