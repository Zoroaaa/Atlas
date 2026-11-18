import { describe, expect, it } from 'vitest';
import { resolveBatchQuota, resolveLockTtl } from '@/services/cover-backfill';

describe('cover-backfill 批次配额', () => {
  it('给重试固定预留 20%', () => {
    expect(resolveBatchQuota(20)).toEqual({ pendingLimit: 16, retryReserve: 4 });
    expect(resolveBatchQuota(100)).toEqual({ pendingLimit: 80, retryReserve: 20 });
    expect(resolveBatchQuota(5)).toEqual({ pendingLimit: 4, retryReserve: 1 });
  });

  it('批次为 1 时不再拆分，避免 pending 被挤成 0', () => {
    expect(resolveBatchQuota(1)).toEqual({ pendingLimit: 1, retryReserve: 0 });
  });
});

describe('cover-backfill 锁租约', () => {
  it('按批次最坏耗时推算并限制上下界', () => {
    expect(resolveLockTtl(1)).toBe(55_000);
    expect(resolveLockTtl(20)).toBe(240_000);
    expect(resolveLockTtl(100)).toBe(1_200_000);
    expect(resolveLockTtl(1000)).toBe(1_200_000);
  });
});
