import { describe, expect, it } from 'vitest';
import { normalizePayload } from '@/services/r2-dashboard';

/** 旧版代码写入的快照：有 byNamespace 与大部分字段，但还没有 unparsed 段 */
const legacySnapshot = {
  r2: { objects: 198234, bytes: 182_000_000, unparsed: 3 },
  ledger: { ready: 162300, bytes: 150_000_000, missing: 210, failed: 35, pendingRecords: 4210 },
  business: { recordsWithCover: 90321, distinctCoverHashes: 85112 },
  diff: {
    unregistered: { count: 35934, bytes: 32_000_000 },
    ledgerMissing: { count: 210, repairable: 198, orphan: 12 },
    reclaimable: { days: 90, count: 9120, bytes: 15_000_000 },
  },
  byNamespace: [
    { namespace: 'jav', objects: 160000, bytes: 150_000_000, registered: 140000, unregistered: 20000 },
  ],
  ageBuckets: [{ namespace: 'jav', b0_30: 1, b31_90: 2, b91_180: 3, b180p: 4 }],
};

describe('normalizePayload 快照兼容', () => {
  it('旧快照缺 unparsed 段时补 0，其余字段保留', () => {
    const result = normalizePayload(legacySnapshot);

    expect(result).not.toBeNull();
    expect(result!.diff.unparsed).toEqual({ count: 0, bytes: 0 });
    expect(result!.diff.unregistered).toEqual({ count: 35934, bytes: 32_000_000 });
    expect(result!.r2.objects).toBe(198234);
    expect(result!.byNamespace[0]).toEqual({
      namespace: 'jav',
      objects: 160000,
      bytes: 150_000_000,
      registered: 140000,
      unregistered: 20000,
    });
  });

  it('缺整段 diff 时全部补 0，不抛错', () => {
    const result = normalizePayload({ byNamespace: [] });

    expect(result).not.toBeNull();
    expect(result!.diff).toEqual({
      unregistered: { count: 0, bytes: 0 },
      unparsed: { count: 0, bytes: 0 },
      ledgerMissing: { count: 0, repairable: 0, orphan: 0 },
      reclaimable: { count: 0, bytes: 0, days: 0 },
    });
    expect(result!.r2).toEqual({ objects: 0, bytes: 0, unparsed: 0 });
  });

  it('字段类型异常时按 0 处理，不产生 NaN', () => {
    const result = normalizePayload({
      byNamespace: [{ namespace: 'jav', objects: 'abc', registered: null }],
      diff: { unparsed: 'not-an-object' },
    });

    expect(result!.byNamespace[0].objects).toBe(0);
    expect(result!.byNamespace[0].registered).toBe(0);
    expect(result!.diff.unparsed).toEqual({ count: 0, bytes: 0 });
  });

  it('refuses 非本模块写入的格式', () => {
    expect(normalizePayload(null)).toBeNull();
    expect(normalizePayload('{}')).toBeNull();
    expect(normalizePayload({})).toBeNull();
    expect(normalizePayload({ payload: {} })).toBeNull();
    expect(normalizePayload([])).toBeNull();
  });

  it('未登记数按总数减已登记推导，不信任快照里的旧值', () => {
    const result = normalizePayload({
      byNamespace: [{ namespace: 'jav', objects: 100, registered: 30, unregistered: 999 }],
    });

    expect(result!.byNamespace[0].unregistered).toBe(70);
  });
});
