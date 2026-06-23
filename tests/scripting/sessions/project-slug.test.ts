import { describe, it, expect } from 'vitest';
import {
  posixToWindows,
  projectPathToSlug,
} from '../../../scripting/shared/claude-paths.js';

describe('project-slug', () => {
  it('win32: convierte path POSIX /c/Users/... a Windows', () => {
    if (process.platform !== 'win32') return;
    expect(posixToWindows('/c/Users/Cristian/foo')).toBe('C:\\Users\\Cristian\\foo');
  });

  it('posix: posixToWindows retorna la ruta sin cambios', () => {
    if (process.platform === 'win32') return;
    expect(posixToWindows('/home/user/foo')).toBe('/home/user/foo');
  });

  it('win32: codifica ruta Windows al slug de Claude Code', () => {
    if (process.platform !== 'win32') return;
    const slug = projectPathToSlug('C:\\Users\\Cristian\\Desktop\\Proyectos\\Smart Code Proxy');
    expect(slug).toBe('C--Users-Cristian-Desktop-Proyectos-Smart-Code-Proxy');
  });

  it('posix: codifica ruta posix al slug de Claude Code', () => {
    if (process.platform === 'win32') return;
    expect(projectPathToSlug('/home/user/foo')).toBe('-home-user-foo');
  });

  it('win32: normaliza drive en minúsculas', () => {
    if (process.platform !== 'win32') return;
    expect(projectPathToSlug('c:/Users/Test')).toBe('C--Users-Test');
  });

  it('posix: cada barra se convierte en guión (algoritmo canónico)', () => {
    if (process.platform === 'win32') return;
    expect(projectPathToSlug('/Users/Test')).toBe('-Users-Test');
    expect(projectPathToSlug('/home/user')).toBe('-home-user');
  });
});
