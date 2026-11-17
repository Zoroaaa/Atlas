import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  api: {
    getStats: vi.fn(),
    getRecords: vi.fn(),
    getDetailJob: vi.fn(),
    getCoverStats: vi.fn(),
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

const stats = {
  totalRecords: 2,
  byType: [{ type: 'jav', count: 2 }],
  detailCompletionRate: 50,
  addedToday: 1,
  addedThisWeek: 1,
  addedThisMonth: 2,
  recordsOverTime: [{ date: '2026-11-17', count: 2 }],
  topTags: [],
  topSources: [],
  hiddenCount: 0,
};

const coverStats = {
  totalWithCover: 2,
  ready: 1,
  missing: 0,
  failed: 1,
  pending: 0,
  readyBytes: 1024,
  byType: [{ type: 'jav', total: 2, ready: 1, missing: 0, failed: 1, pending: 0 }],
  recentFailures: [],
  enabled: false,
  batchSize: 20,
  r2Ready: true,
  publicBase: 'https://img.atlas.wort.uk',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.getStats.mockResolvedValue(stats);
  mocks.api.getRecords.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  mocks.api.getDetailJob.mockResolvedValue({
    job: null,
    pending: 0,
    due: 0,
    scheduled: 0,
    enabled: true,
    stats: null,
    recentFailures: [],
  });
  mocks.api.getCoverStats.mockResolvedValue(coverStats);
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin-panel/data-storage/*" element={<DataStorageTab />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('数据存储页面拆分', () => {
  it('索引页渲染统计概览', async () => {
    renderAt('/admin-panel/data-storage');
    expect(await screen.findByRole('heading', { name: /Statistics|统计概览/ })).toBeInTheDocument();
    expect(mocks.api.getStats).toHaveBeenCalled();
  });

  it('/detail 渲染详情补全', async () => {
    renderAt('/admin-panel/data-storage/detail');
    expect(await screen.findByRole('heading', { name: /Detail Completion|详情补全/ })).toBeInTheDocument();
    expect(mocks.api.getDetailJob).toHaveBeenCalled();
  });

  it('/covers 渲染封面管理', async () => {
    renderAt('/admin-panel/data-storage/covers');
    expect(await screen.findByRole('heading', { name: /Cover Management|封面管理/ })).toBeInTheDocument();
    expect(mocks.api.getCoverStats).toHaveBeenCalled();
  });

  it('/records 渲染数据浏览', async () => {
    renderAt('/admin-panel/data-storage/records');
    expect(await screen.findByRole('heading', { name: /Browse Records|数据浏览/ })).toBeInTheDocument();
    expect(mocks.api.getRecords).toHaveBeenCalled();
  });
});
