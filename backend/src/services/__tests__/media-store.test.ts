import { describe, expect, it } from 'vitest';
import { coverTombstoneKey, readBodyWithLimit } from '@/services/media-store';

describe('media-store 读取上限', () => {
  it('Content-Length 超限时直接拒绝', async () => {
    const resp = new Response('x'.repeat(100), { headers: { 'content-length': '100' } });
    await expect(readBodyWithLimit(resp, 10)).resolves.toBeNull();
  });

  it('边读边计数，超限立即取消', async () => {
    const resp = new Response('x'.repeat(100));
    await expect(readBodyWithLimit(resp, 10)).resolves.toBeNull();
  });

  it('未超限时完整返回字节', async () => {
    const resp = new Response('hello');
    const data = await readBodyWithLimit(resp, 10);
    expect(data).not.toBeNull();
    expect(new TextDecoder().decode(data!)).toBe('hello');
  });
});

describe('media-store 失败墓碑 key', () => {
  it('与封面对象使用同一 hash，仅前缀不同', () => {
    const hash = 'ab'.repeat(32);
    expect(coverTombstoneKey(hash)).toBe(`covers/v1/miss/ab/${hash}`);
  });
});
