import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SourceBoard } from '../SourceBoard';
import type { SourceCatalogItem } from '@/types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  sourceApi: {
    getSourceStats: vi.fn(),
    getMajorCategories: vi.fn(),
    getCategories: vi.fn(),
    getSourceCatalog: vi.fn(),
    getSourceById: vi.fn(),
    getSourceStatusHistory: vi.fn(),
    checkSourceStatus: vi.fn(),
    updateUserSourceConfig: vi.fn(),
    batchUpdateUserSourceConfigs: vi.fn(),
  },
}));

const sourceApiMock = mocks.sourceApi;

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/services/api', () => ({
  sourceApi: mocks.sourceApi,
}));

const item: SourceCatalogItem = {
  id: 'javbus',
  categoryId: 'database',
  categoryName: '番号资料站',
  categoryIcon: '📚',
  categoryColor: '#3b82f6',
  majorCategoryId: 'jav_sources',
  majorCategoryName: 'JAV搜索',
  name: 'JavBus',
  subtitle: '番号磁力一体站',
  description: '详细的番号信息与磁力链接',
  icon: '🎬',
  urlTemplate: 'https://www.javbus.com/search/{keyword}',
  homepageUrl: 'https://www.javbus.com',
  siteType: 'search',
  searchable: true,
  usageCount: 12,
  isSystem: true,
  enabled: true,
  userConfig: null,
};

const stats = {
  totalSources: 117,
  searchableSources: 86,
  enabledSources: 74,
  availableSources: 3,
  totalCategories: 15,
  totalMajorCategories: 5,
  topUsedSources: [],
  sourcesByCategory: [],
  sourcesBySiteType: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sourceApiMock.getSourceStats.mockResolvedValue({ success: true, data: stats });
  sourceApiMock.getMajorCategories.mockResolvedValue({
    success: true,
    data: [{ id: 'jav_sources', name: 'JAV搜索' }],
  });
  sourceApiMock.getCategories.mockResolvedValue({ success: true, data: [] });
  sourceApiMock.getSourceCatalog.mockResolvedValue({
    success: true,
    data: { items: [item], total: 1, page: 1, pageSize: 24, hasMore: false },
  });
  sourceApiMock.getSourceById.mockResolvedValue({
    success: true,
    data: {
      source: item,
      categoryPath: [
        { id: 'jav_sources', name: 'JAV搜索', type: 'major' },
        { id: 'database', name: '番号资料站', type: 'category' },
      ],
      enabled: true,
      userConfig: null,
      status: null,
    },
  });
  sourceApiMock.getSourceStatusHistory.mockResolvedValue({
    success: true,
    data: {
      source: item,
      history: [],
      summary: {
        totalChecks: 0,
        availableCount: 0,
        unavailableCount: 0,
        availabilityRate: 0,
        avgResponseTime: 0,
        lastChecked: null,
      },
    },
  });
  sourceApiMock.checkSourceStatus.mockResolvedValue({
    success: true,
    data: { status: 'available', available: true, responseTime: 210, error: null },
  });
  sourceApiMock.updateUserSourceConfig.mockResolvedValue({ success: true, data: null });
  sourceApiMock.batchUpdateUserSourceConfigs.mockResolvedValue({
    success: true,
    data: { updatedCount: 1 },
  });
});

describe('SourceBoard', () => {
  it('渲染统计、分类分组与曝光口径文案', async () => {
    render(<SourceBoard />);

    expect(await screen.findByText('JavBus')).toBeInTheDocument();
    expect(screen.getByText('117')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getAllByText('74').length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('JAV搜索').length).toBeGreaterThan(0);
    expect(screen.getByText('番号资料站')).toBeInTheDocument();
    expect(screen.getByText('曝光 12 次')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回搜索' })).toBeInTheDocument();
  });

  it('打开详情抽屉展示 URL 模板、主页与 24h 可用性', async () => {
    render(<SourceBoard />);

    fireEvent.click(await screen.findByRole('button', { name: /JavBus/ }));

    expect(await screen.findByText('源详情')).toBeInTheDocument();
    expect(await screen.findByText('https://www.javbus.com/search/{keyword}')).toBeInTheDocument();
    expect(screen.getByText('https://www.javbus.com')).toBeInTheDocument();
    expect(screen.getByText('24h 可用性')).toBeInTheDocument();
    expect(screen.getAllByText('暂无检测记录').length).toBeGreaterThanOrEqual(2);
  });

  it('切换“我的源”范围时展示对应空态', async () => {
    sourceApiMock.getSourceCatalog.mockImplementation((params: { scope?: string }) =>
      Promise.resolve({
        success: true,
        data:
          params.scope === 'mine'
            ? { items: [], total: 0, page: 1, pageSize: 24, hasMore: false }
            : { items: [item], total: 1, page: 1, pageSize: 24, hasMore: false },
      })
    );

    render(<SourceBoard />);
    await screen.findByText('JavBus');

    fireEvent.change(screen.getByLabelText('范围'), { target: { value: 'mine' } });

    expect(await screen.findByText('你还没有创建自定义源，可前往管理页添加')).toBeInTheDocument();
  });

  it('行内启停调用用户配置接口', async () => {
    render(<SourceBoard />);

    fireEvent.click(await screen.findByLabelText('禁用'));

    await waitFor(() => {
      expect(sourceApiMock.updateUserSourceConfig).toHaveBeenCalledWith('javbus', {
        isEnabled: false,
      });
    });
  });

  it('行内健康检查展示检测结果', async () => {
    render(<SourceBoard />);

    fireEvent.click(await screen.findByLabelText('健康检查'));

    expect(await screen.findByText(/可用 · 210ms/)).toBeInTheDocument();
    expect(sourceApiMock.checkSourceStatus).toHaveBeenCalledWith('javbus');
  });

  it('勾选后可批量禁用', async () => {
    render(<SourceBoard />);

    fireEvent.click(await screen.findByLabelText('选择 JavBus'));
    expect(screen.getByText('已选 1 个')).toBeInTheDocument();

    fireEvent.click(screen.getByText('禁用选中'));

    await waitFor(() => {
      expect(sourceApiMock.batchUpdateUserSourceConfigs).toHaveBeenCalledWith({
        configs: [{ sourceId: 'javbus', isEnabled: false }],
      });
    });
  });

  it('详情抽屉可保存自定义名称与备注', async () => {
    render(<SourceBoard />);

    fireEvent.click(await screen.findByRole('button', { name: /JavBus/ }));
    await screen.findByText('源详情');

    fireEvent.change(screen.getByLabelText('自定义名称'), { target: { value: '我的 JavBus' } });
    fireEvent.change(screen.getByLabelText('我的备注'), { target: { value: '常用站' } });
    fireEvent.click(screen.getByText('保存自定义信息'));

    await waitFor(() => {
      expect(sourceApiMock.updateUserSourceConfig).toHaveBeenCalledWith('javbus', {
        customName: '我的 JavBus',
        customSubtitle: undefined,
        notes: '常用站',
      });
    });
    expect(await screen.findByText('已保存')).toBeInTheDocument();
  });
});
