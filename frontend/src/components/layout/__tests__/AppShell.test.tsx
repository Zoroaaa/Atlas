import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from '@/i18n';
import { adminNavGroups } from '../workspaceNav';
import { AppShell } from '../AppShell';

const toggleSidebar = vi.fn();
const onSearchTabChange = vi.fn();

vi.mock('@/hooks', () => ({
  useLogout: () => vi.fn(),
  useIsDesktop: () => true,
  useFollows: () => ({ data: { unread: 3 } }),
  useUnreadCount: () => ({ data: 6 }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ user: { username: 'tester', role: 'admin' }, logout: vi.fn() }),
  useSourceStore: () => ({ activeTab: 'jav', setActiveTab: vi.fn() }),
  useThemeStore: () => ({ sidebarCollapsed: false, toggleSidebar }),
  useProxyStore: () => ({ isEnabled: false, status: 'idle', isLoading: false, toggleProxy: vi.fn(), initializeProxy: vi.fn() }),
}));

vi.mock('@/contexts', () => ({ useFeatureFlags: () => ({ communityEnabled: true }) }));
vi.mock('@/components/notifications/NotificationBell', () => ({ NotificationBell: () => <div data-testid="bell" /> }));
vi.mock('@/components/ui', () => ({
  LanguageSwitcher: () => <div data-testid="lang" />,
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (isOpen ? <div>{children}</div> : null),
  DropdownMenu: ({ trigger }: { trigger: React.ReactNode }) => <div>{trigger}</div>,
}));
vi.mock('@/components/layout/UserAccountMenu', () => ({ UserAccountMenu: () => <div data-testid="account" /> }));

const renderShell = (path = '/main') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell onSearchTabChange={onSearchTabChange}>
        <div>CONTENT</div>
      </AppShell>
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());

describe('AppShell 桌面工作区', () => {
  it('搜索工作区渲染分类、发现、我的与社区导航', () => {
    renderShell('/main');

    expect(screen.getByText('CONTENT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '动漫' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发现' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '社区' })).toBeInTheDocument();
  });

  it('点击分类走页面提供的切换回调', () => {
    renderShell('/main');

    fireEvent.click(screen.getByRole('button', { name: '动漫' }));
    expect(onSearchTabChange).toHaveBeenCalledWith('anime');
  });

  it('管理后台页面自动展开后台菜单并高亮当前项', () => {
    renderShell('/admin-panel/users');

    expect(screen.getByRole('link', { name: '用户管理' })).toBeInTheDocument();
  });

  // 回归守卫：桌面侧栏的管理菜单必须与 workspaceNav 单一数据源逐项一致。
  // 历史上这里另存过一份硬编码，新增菜单只改了 workspaceNav，桌面端就看不到入口。
  it('管理后台菜单项与 workspaceNav 定义逐项一致', () => {
    renderShell('/admin-panel/users');

    for (const group of adminNavGroups) {
      for (const item of group.items) {
        const link = screen.getByRole('link', { name: i18next.t(item.labelKey) });
        expect(link).toHaveAttribute('href', item.path);
      }
    }
  });

  it('管理后台菜单包含 R2 看板入口', () => {
    renderShell('/admin-panel/data-storage/r2');

    expect(screen.getByRole('link', { name: 'R2 管理看板' })).toHaveAttribute(
      'href',
      '/admin-panel/data-storage/r2'
    );
  });

  it('折叠按钮调用侧栏开关', () => {
    renderShell('/main');

    fireEvent.click(screen.getByRole('button', { name: '折叠侧栏' }));
    expect(toggleSidebar).toHaveBeenCalled();
  });
});
