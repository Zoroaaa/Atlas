import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  api: {
    getStats: vi.fn(),
    getScanState: vi.fn(),
    triggerScan: vi.fn(),
    getObjects: vi.fn(),
    previewReclaim: vi.fn(),
    reclaim: vi.fn(),
  },
}));

vi.mock('@/services/api', () => ({
  r2AdminApi: mocks.api,
}));

vi.mock('@/hooks/useNotification', () => ({
  useToast: () => mocks.toast,
}));

import { R2Page } from '../data-storage/R2Page';

const stats = {
  r2: { objects: 198234, bytes: 182_000_000, unparsed: 3 },
  ledger: { ready: 162300, bytes: 150_000_000 },
  business: { recordsWithCover: 90321, distinctCoverHashes: 85112 },
  diff: {
    unregistered: { count: 35934, bytes: 32_000_000 },
    unparsed: { count: 3, bytes: 5120 },
    ledgerMissing: { count: 210, repairable: 198, orphan: 12 },
    reclaimable: { days: 90, count: 9120, bytes: 15_000_000 },
  },
  byNamespace: [
    { namespace: 'jav', objects: 160000, bytes: 150_000_000, registered: 140000, unregistered: 20000 },
    { namespace: 'anime', objects: 38234, bytes: 32_000_000, registered: 22300, unregistered: 15934 },
  ],
  ageBuckets: [],
  scan: {
    status: 'completed' as const,
    scanId: 'abc',
    pagesDone: 200,
    objectsSeen: 198234,
    skippedKeys: 3,
    startedAt: 1_760_000_000_000,
    completedAt: 1_760_000_600_000,
    nextScanAt: 1_760_086_600_000,
    trigger: 'cron',
    mode: 'full' as const,
    lastError: null,
    baselineAt: 1_760_000_000_000,
  },
  reclaim: { enabled: true, days: 90 },
  snapshotAt: 1_760_000_600_000,
  stale: false,
  generatedAt: 1_760_000_700_000,
};

const objectsPage = {
  items: [
    {
      objectKey: `covers/v1/orig/jav/aa/${'a'.repeat(64)}`,
      urlHash: 'a'.repeat(64),
      namespace: 'jav',
      byteSize: 2048,
      uploadedAt: 1_759_000_000_000,
      firstSeenAt: 1_760_000_000_000,
      lastSeenAt: 1_760_000_000_000,
      reclaimedAt: null,
      registered: true,
      ledgerStatus: 'ready',
    },
    {
      objectKey: 'covers/v1/orig/jav/bb/legacy-key',
      urlHash: null,
      namespace: 'jav',
      byteSize: 1024,
      uploadedAt: 1_759_000_000_000,
      firstSeenAt: 1_760_000_000_000,
      lastSeenAt: 1_760_000_000_000,
      reclaimedAt: null,
      registered: false,
      ledgerStatus: null,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  pageLimitHit: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.getStats.mockResolvedValue(stats);
  mocks.api.getObjects.mockResolvedValue(objectsPage);
  mocks.api.getScanState.mockResolvedValue({ status: 'completed' });
  mocks.api.previewReclaim.mockResolvedValue({
    scope: 'unparsed',
    days: 90,
    namespace: null,
    candidates: 9120,
    bytes: 15_000_000,
    oldestUploadedAt: 1_700_000_000_000,
    hasMore: true,
  });
});

describe('R2 管理看板', () => {
  it('并列展示三口径数字与四类差额', async () => {
    render(<R2Page />);

    // 198,234 同时出现在统计卡与扫描卡的「本轮对象数」，按出现次数断言更稳
    expect((await screen.findAllByText('198,234')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('162,300')).toBeInTheDocument();
    expect(screen.getByText('90,321')).toBeInTheDocument();
    expect(screen.getByText('35,934')).toBeInTheDocument();
    expect(screen.getByText('9,120')).toBeInTheDocument();
    expect(mocks.api.getStats).toHaveBeenCalled();
  });

  it('对象列表标出已登记与未解析两种状态', async () => {
    render(<R2Page />);

    expect(await screen.findByText(/legacy-key/)).toBeInTheDocument();
    expect(screen.getByText('未解析')).toBeInTheDocument();
    expect(screen.getAllByText('已登记').length).toBeGreaterThan(0);
    expect(mocks.api.getObjects).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50, status: 'live', registered: 'all' })
    );
  });

  it('默认范围是未解析 key，预览后才允许清理', async () => {
    render(<R2Page />);

    const previewButton = await screen.findByRole('button', { name: '预览' });
    const executeButton = screen.getByRole('button', { name: '清理' });
    expect(executeButton).toBeDisabled();

    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(mocks.api.previewReclaim).toHaveBeenCalledWith({
        scope: 'unparsed',
        days: 90,
        namespace: undefined,
      });
    });
    expect(await screen.findByText(/将删除 9,120 个对象/)).toBeInTheDocument();
    await waitFor(() => expect(executeButton).toBeEnabled());
  });

  // 回归守卫：快照 payload 是历史代码写进数据库的，升级后新字段必然缺失。
  // 之前直接读 diff.unparsed.count，旧快照让整页抛 TypeError。
  it('快照是旧格式、缺少 unparsed 段时不崩溃', async () => {
    const legacyDiff = { ...stats.diff } as Record<string, unknown>;
    delete legacyDiff.unparsed;
    mocks.api.getStats.mockResolvedValue({ ...stats, diff: legacyDiff });

    render(<R2Page />);

    expect((await screen.findAllByText('198,234')).length).toBeGreaterThanOrEqual(1);
    // 统计卡与回收范围按钮都叫「超期未登记」，这里只关心渲染没有抛错
    expect(screen.getAllByText('超期未登记').length).toBeGreaterThanOrEqual(1);
  });

  it('没有统计快照时提示数字不可用', async () => {
    mocks.api.getStats.mockResolvedValue({
      ...stats,
      scan: { ...stats.scan, status: 'idle', completedAt: null, startedAt: null },
      snapshotAt: 0,
      stale: true,
    });
    render(<R2Page />);

    expect(await screen.findByText(/还没有统计快照/)).toBeInTheDocument();
  });
});
