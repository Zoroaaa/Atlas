import { describe, expect, it } from 'vitest';
import { COVER_ORIG_PREFIX, coverObjectRef, parseCoverObjectKey } from '@/services/media-key';

const HASH = 'a'.repeat(64);

describe('parseCoverObjectKey 反解', () => {
  it('能从正常 key 反解 namespace 与 hash', () => {
    const key = `${COVER_ORIG_PREFIX}jav/aa/${HASH}`;
    expect(parseCoverObjectKey(key)).toEqual({ namespace: 'jav', urlHash: HASH });
  });

  it('与 coverObjectRef 生成的 key 可互相转换', async () => {
    const ref = await coverObjectRef('https://lain.bgm.tv/pic/cover/l/ab/cd/1.jpg');
    expect(ref).not.toBeNull();
    expect(parseCoverObjectKey(ref!.objectKey)).toEqual({
      namespace: 'anime',
      urlHash: ref!.hash,
    });
  });

  it('分片目录与 hash 前两位不一致时拒绝', () => {
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/bb/${HASH}`)).toBeNull();
  });

  it('段数不对时拒绝', () => {
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/${HASH}`)).toBeNull();
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/aa/bb/${HASH}`)).toBeNull();
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/aa/${HASH}/extra`)).toBeNull();
  });

  it('hash 不是 64 位小写 hex 时拒绝', () => {
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/zz/zz`)).toBeNull();
    // 大写 hex 不在生成规则内，页面参数改一遍就会算出不同 key，不能当同一对象
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/AA/${'A'.repeat(64)}`)).toBeNull();
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}jav/aa/${'a'.repeat(63)}`)).toBeNull();
  });

  it('不在 orig 前缀下一律拒绝（墓碑不能算封面对象）', () => {
    expect(parseCoverObjectKey(`covers/v1/miss/aa/${HASH}`)).toBeNull();
    expect(parseCoverObjectKey(`other/path/jav/aa/${HASH}`)).toBeNull();
    expect(parseCoverObjectKey('')).toBeNull();
  });

  it('空 namespace 拒绝', () => {
    expect(parseCoverObjectKey(`${COVER_ORIG_PREFIX}/aa/${HASH}`)).toBeNull();
  });
});
