import { describe, expect, it } from 'vitest';
import { generateErrorFingerprint } from '../fingerprint';

describe('generateErrorFingerprint', () => {
  it('同一错误稳定生成同一指纹', () => {
    const first = generateErrorFingerprint('TypeError', 'boom', 'at a\nat b', '/api/x');
    const second = generateErrorFingerprint('TypeError', 'boom', 'at a\nat b', '/api/x');
    expect(first).toBe(second);
    expect(first).toMatch(/^fp_[a-z0-9]+$/);
  });

  it('错误类型、消息或位置不同则指纹不同', () => {
    const base = generateErrorFingerprint('TypeError', 'boom', 'at a', '/api/x');
    expect(generateErrorFingerprint('RangeError', 'boom', 'at a', '/api/x')).not.toBe(base);
    expect(generateErrorFingerprint('TypeError', 'bang', 'at a', '/api/x')).not.toBe(base);
    expect(generateErrorFingerprint('TypeError', 'boom', 'at a', '/api/y')).not.toBe(base);
  });

  it('只取堆栈前 5 行，尾部差异不影响聚合', () => {
    const head = ['at a', 'at b', 'at c', 'at d', 'at e'];
    const first = generateErrorFingerprint('Error', 'x', [...head, 'at f'].join('\n'), '/');
    const second = generateErrorFingerprint('Error', 'x', [...head, 'at g'].join('\n'), '/');
    expect(first).toBe(second);
  });
});
