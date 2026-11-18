import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../sql';

describe('escapeLikePattern', () => {
  it('转义 % 与 _，避免改变 LIKE 匹配范围', () => {
    expect(escapeLikePattern('100%_done')).toBe('100\\%\\_done');
  });

  it('先转义反斜杠，避免二次转义', () => {
    expect(escapeLikePattern('a\\b%c')).toBe('a\\\\b\\%c');
  });

  it('普通文本保持不变', () => {
    expect(escapeLikePattern('ABC-123')).toBe('ABC-123');
  });
});
