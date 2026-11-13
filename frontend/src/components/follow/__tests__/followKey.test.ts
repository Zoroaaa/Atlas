import { describe, it, expect } from 'vitest';
import { buildWatchKey } from '../followKey';

describe('buildWatchKey', () => {
  it('女优直接使用 slug', () => {
    expect(buildWatchKey('actress', 'abc123')).toBe('abc123');
    expect(buildWatchKey('actress', '  abc123  ')).toBe('abc123');
    expect(buildWatchKey('actress')).toBeUndefined();
  });

  it('导演等实体使用 <类型>:<路径去掉开头斜杠>', () => {
    expect(buildWatchKey('director', undefined, '/director/o7')).toBe('director:director/o7');
    expect(buildWatchKey('studio', undefined, '/studio/abc')).toBe('studio:studio/abc');
    expect(buildWatchKey('label', undefined, '/uncensored/label/xyz')).toBe('label:uncensored/label/xyz');
    expect(buildWatchKey('series', undefined, '/series/s1')).toBe('series:series/s1');
    expect(buildWatchKey('tag', undefined, '/genre/2a')).toBe('tag:genre/2a');
  });

  it('实体缺少路径时不可关注', () => {
    expect(buildWatchKey('tag', undefined, undefined)).toBeUndefined();
    expect(buildWatchKey('director', 'ignore-me', '  ')).toBeUndefined();
  });
});
