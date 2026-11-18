import { describe, expect, it } from 'vitest';
import { normalizeTitle } from '../title-grouping';

describe('normalizeTitle 编码标记', () => {
  it('移除 av1 编码标记', () => {
    expect(normalizeTitle('测试作品 av1 1080p')).toBe('测试作品');
  });

  it('保留普通单词 av，不把它当编码标记', () => {
    expect(normalizeTitle('AV 作品 1080p')).toBe('av 作品');
  });
});
