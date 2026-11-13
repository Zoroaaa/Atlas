import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DataRecord, DataRecordDetail } from '@/types';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  api: {
    getStats: vi.fn(),
    getTrends: vi.fn(),
    getRecords: vi.fn(),
    getRecord: vi.fn(),
    updateRecordStatus: vi.fn(),
    deleteRecord: vi.fn(),
    cleanup: vi.fn(),
    syncGenreDictionary: vi.fn(),
    getDetailJob: vi.fn(),
    startDetailJob: vi.fn(),
    stopDetailJob: vi.fn(),
    pauseDetailJob: vi.fn(),
    resumeDetailJob: vi.fn(),
    resetRecordDetailRetry: vi.fn(),
    fetchRecordDetail: vi.fn(),
  },
}));

vi.mock('@/services/api', () => ({
  dataStorageApi: mocks.api,
}));

vi.mock('@/stores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores')>();
  return {
    ...actual,
    useAuthStore: () => ({ user: { role: 'super_admin' } }),
  };
});

vi.mock('@/hooks/useNotification', () => ({
  useToast: () => mocks.toast,
}));

import { DataStorageTab } from '../DataStorageTab';

const record: DataRecord = {
  id: 'rec-1',
  recordType: 'jav',
  dedupKey: 'jav:MIMK-020',
  title: 'MIMK-020 测试标题',
  code: 'MIMK-020',
  tags: ['巨乳'],
  contentData: '{}',
  detailCompleted: false,
  detailStatus: 'partial',
  detailMissing: ['magnets'],
  detailAttempts: 3,
  detailTransientFailures: 2,
  detailNextRetryAt: 0,
  detailRetryExhausted: true,
  detailLastError: '磁力接口暂时不可用',
  detailFetchedAt: Date.now(),
  status: 'active',
  sourceCount: 1,
  firstSeenAt: Date.now(),
  lastUpdatedAt: Date.now(),
};

const detail: DataRecordDetail = {
  ...record,
  sources: [],
};

const stats = {
  totalRecords: 1,
  byType: [{ type: 'jav', count: 1 }],
  detailCompletionRate: 0,
  addedToday: 0,
  addedThisWeek: 0,
  addedThisMonth: 0,
  recordsOverTime: [],
  topTags: [],
  topSources: [],
  hiddenCount: 0,
  javDetail: {
    total: 1,
    complete: 0,
    partial: 1,
    absent: 0,
    error: 0,
    pending: 0,
    missing: { director: 0, maker: 0, publisher: 0, magnets: 1 },
  },
};

const jobView = {
  job: null,
  pending: 1,
  due: 1,
  scheduled: 0,
  enabled: true,
  stats: stats.javDetail,
  recentFailures: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.getStats.mockResolvedValue(stats);
  mocks.api.getRecords.mockResolvedValue({
    items: [record],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  mocks.api.getRecord.mockResolvedValue(detail);
  mocks.api.getDetailJob.mockResolvedValue(jobView);
  mocks.api.resetRecordDetailRetry.mockResolvedValue(undefined);
  mocks.api.fetchRecordDetail.mockResolvedValue({ ok: true, error: null });
});

async function openRecordsView() {
  render(<DataStorageTab />);
  // 测试语言可能被语言 store 覆盖为英文，按中英文双写匹配
  const recordsTab = await screen.findByRole('button', { name: /Browse|数据浏览/ });
  fireEvent.click(recordsTab);
  await screen.findByText(record.title);
}

describe('DataStorageTab 单条补全与重试筛选', () => {
  it('缺磁力与「不再重试」可叠加，并按组合条件请求列表', async () => {
    await openRecordsView();

    fireEvent.click(screen.getByRole('button', { name: /^(Magnets|磁力)$/ }));
    // 下拉顺序：完整度、是否还会重试、状态
    const [, retrySelect] = screen.getAllByRole('combobox');
    fireEvent.change(retrySelect, { target: { value: 'no' } });

    await waitFor(() => {
      const matched = mocks.api.getRecords.mock.calls.some(
        ([params]) => params?.missing === 'magnets' && params?.retry === 'no'
      );
      expect(matched).toBe(true);
    });
  });

  it('详情卡片可重置源站缺失次数，并同步刷新详情与列表', async () => {
    await openRecordsView();
    fireEvent.click(await screen.findByText(record.title));

    const resetBtn = await screen.findByRole('button', {
      name: /Reset source-missing attempts|重置源站缺失次数/,
    });
    const getRecordCallsBefore = mocks.api.getRecord.mock.calls.length;

    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(mocks.api.resetRecordDetailRetry).toHaveBeenCalledWith(record.id);
    });
    await waitFor(() => {
      expect(mocks.api.getRecord.mock.calls.length).toBeGreaterThan(getRecordCallsBefore);
    });
  });

  it('详情卡片可对单条立即补详情', async () => {
    await openRecordsView();
    fireEvent.click(await screen.findByText(record.title));

    const fetchBtn = await screen.findByRole('button', {
      name: /Fetch detail for this record|单条数据补详情/,
    });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(mocks.api.fetchRecordDetail).toHaveBeenCalledWith(record.id);
    });
    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalled();
    });
  });
});
