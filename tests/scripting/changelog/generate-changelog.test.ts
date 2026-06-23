import { describe, it, expect } from 'vitest';
import {
  classifyCommitType,
  parseCommitLine,
  formatChangelog,
  type CommitSection,
} from '../../../scripting/changelog/generate-changelog.js';

describe('classifyCommitType', () => {
  it('feat -> added', () => {
    expect(classifyCommitType('feat: nuevo endpoint')).toBe('added');
  });

  it('feat con scope -> added', () => {
    expect(classifyCommitType('feat(api): add login route')).toBe('added');
    expect(classifyCommitType('feat(cli): support --verbose')).toBe('added');
  });

  it('fix -> fixed', () => {
    expect(classifyCommitType('fix: corrige null pointer')).toBe('fixed');
    expect(classifyCommitType('fix(ui): corrige renderizado')).toBe('fixed');
  });

  it('perf -> changed', () => {
    expect(classifyCommitType('perf: optimiza query')).toBe('changed');
  });

  it('refactor -> changed', () => {
    expect(classifyCommitType('refactor: mueve modulo')).toBe('changed');
  });

  it('docs -> documentation', () => {
    expect(classifyCommitType('docs: actualiza README')).toBe('documentation');
  });

  it('chore|test|build|ci|style -> null (descartado)', () => {
    expect(classifyCommitType('chore: bump deps')).toBe(null);
    expect(classifyCommitType('test: adds test')).toBe(null);
    expect(classifyCommitType('build: bundle')).toBe(null);
    expect(classifyCommitType('ci: add workflow')).toBe(null);
    expect(classifyCommitType('style: format')).toBe(null);
  });
});

describe('parseCommitLine', () => {
  it('parsea refs, subject y date', () => {
    const r = parseCommitLine('HEAD -> master|fix: corrige bug|2026-01-15');
    expect(r.refs).toBe('HEAD -> master');
    expect(r.subject).toBe('fix: corrige bug');
    expect(r.date).toBe('2026-01-15');
  });

  it('extrae tag de refs', () => {
    const r = parseCommitLine('tag: v1.0.0, HEAD -> master|feat: add feature|2026-01-01');
    expect(r.tag).toBe('v1.0.0');
  });

  it('tag null cuando refs no contiene tag', () => {
    const r = parseCommitLine('HEAD -> main|docs: update|2026-02-01');
    expect(r.tag).toBe(null);
  });

  it('subject con pipe se parsea correctamente (divide por primer y ultimo |)', () => {
    const r = parseCommitLine('|feat: add | in output|2026-03-01');
    expect(r.subject).toBe('feat: add | in output');
    expect(r.date).toBe('2026-03-01');
  });

  it('subject con multiples pipes se parsea correctamente', () => {
    const r = parseCommitLine('|feat: a | b | c|2026-03-01');
    expect(r.subject).toBe('feat: a | b | c');
    expect(r.date).toBe('2026-03-01');
  });

  it('refs vacias', () => {
    const r = parseCommitLine('|fix: sin refs|2026-04-01');
    expect(r.refs).toBe('');
    expect(r.subject).toBe('fix: sin refs');
  });
});

describe('formatChangelog', () => {
  it('genera encabezado y nota', () => {
    const out = formatChangelog([]);
    expect(out).toContain('# Changelog');
    expect(out).toContain('Do not edit by hand');
  });

  it('bloque unreleased', () => {
    const blocks = [{
      key: 'unreleased',
      tag: null as string | null,
      date: '',
      sections: new Map<CommitSection, string[]>([['added', ['nueva funcion']]]),
    }];
    const out = formatChangelog(blocks);
    expect(out).toContain('## [Unreleased]');
    expect(out).toContain('### Added');
    expect(out).toContain('- nueva funcion');
  });

  it('bloque con tag y fecha', () => {
    const blocks = [{
      key: 'v1.0.0',
      tag: 'v1.0.0' as string | null,
      date: '2026-01-01',
      sections: new Map<CommitSection, string[]>([['fixed', ['corrige bug']]]),
    }];
    const out = formatChangelog(blocks);
    expect(out).toContain('## [1.0.0] -- 2026-01-01');
    expect(out).toContain('### Fixed');
    expect(out).toContain('- corrige bug');
  });

  it('no emite seccion vacia', () => {
    const blocks = [{
      key: 'unreleased',
      tag: null as string | null,
      date: '',
      sections: new Map<CommitSection, string[]>([['added', []]]),
    }];
    const out = formatChangelog(blocks);
    expect(out).not.toContain('### Added');
  });

  it('multiples secciones en orden correcto', () => {
    const sections = new Map<CommitSection, string[]>([
      ['added', ['feat 1', 'feat 2']],
      ['fixed', ['fix 1']],
      ['changed', []],
      ['documentation', ['docs 1']],
    ]);
    const blocks = [{ key: 'unreleased', tag: null as string | null, date: '', sections }];
    const out = formatChangelog(blocks);
    const addedIdx = out.indexOf('### Added');
    const fixedIdx = out.indexOf('### Fixed');
    const docIdx = out.indexOf('### Documentation');
    expect(addedIdx).toBeLessThan(fixedIdx);
    expect(fixedIdx).toBeLessThan(docIdx);
  });
});
