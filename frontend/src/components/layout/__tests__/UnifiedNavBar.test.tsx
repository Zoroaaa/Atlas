import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { UnifiedNavBar } from '../UnifiedNavBar';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  logout: vi.fn(),
  toggleTheme: vi.fn(),
  toggleProxy: vi.fn(),
  initializeProxy: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ logout: mocks.logout }),
  useThemeStore: () => ({ resolvedTheme: 'light', toggleTheme: mocks.toggleTheme }),
  useProxyStore: () => ({
    isEnabled: false,
    status: 'idle',
    isLoading: false,
    toggleProxy: mocks.toggleProxy,
    initializeProxy: mocks.initializeProxy,
  }),
}));

vi.mock('@/components/ui', () => ({
  DropdownMenu: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
  userMenuItems: () => [],
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
  LanguageSwitcher: () => null,
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

const onTabChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UnifiedNavBar 移动端入口', () => {
  it('移动端页头保留 5 个搜索分类入口，窄屏次要入口收进“更多”抽屉', () => {
    render(
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={onTabChange}
        isAuthenticated
        user={{ username: 'tester' }}
        isAdmin={false}
      />
    );

    const mobileTabStrip = screen.getByRole('navigation', { name: '搜索分类' });
    expect(within(mobileTabStrip).getAllByRole('button')).toHaveLength(5);

    // 桌面端 tablist 保持 5 个 tab，源站入口独立于 tablist
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getAllByRole('tab')).toHaveLength(5);
    const sourceEntry = screen.getByRole('button', { name: /源站/ });
    expect(tablist).not.toContainElement(sourceEntry);

    // 移动端“更多”按钮打开抽屉
    fireEvent.click(screen.getByLabelText('更多'));

    const dialog = screen.getByRole('dialog', { name: '更多' });
    expect(within(dialog).getByText('源站收录')).toBeInTheDocument();
    expect(within(dialog).getByText('帮助中心')).toBeInTheDocument();
    expect(within(dialog).getByText('GitHub')).toBeInTheDocument();
    // <sm 顶栏只保留「更多」+ 用户菜单，通知/主题/下载/语言收进抽屉
    expect(within(dialog).getByText('主题切换')).toBeInTheDocument();
    expect(within(dialog).getByText('通知')).toBeInTheDocument();
    expect(within(dialog).getByText('下载 App')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('源站收录'));
    expect(onTabChange).toHaveBeenCalledWith('sources');
    expect(screen.queryByRole('dialog', { name: '更多' })).not.toBeInTheDocument();
  });

  it('顶部主题按钮直接切换主题', () => {
    render(
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={onTabChange}
        isAuthenticated
        user={{ username: 'tester' }}
        isAdmin={false}
      />
    );

    fireEvent.click(screen.getByLabelText('切换主题'));

    expect(mocks.toggleTheme).toHaveBeenCalled();
  });

  it('顶部下载入口指向客户端 Release 页', () => {
    render(
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={onTabChange}
        isAuthenticated
        user={{ username: 'tester' }}
        isAdmin={false}
      />
    );

    const link = screen.getByLabelText('下载 App');
    expect(link).toHaveAttribute('href', 'https://github.com/Zoroaaa/Atlas/releases');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('顶栏图标按钮尺寸统一，避免间距视觉不一致', () => {
    render(
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={onTabChange}
        isAuthenticated
        user={{ username: 'tester' }}
        isAdmin={false}
      />
    );

    const iconButtons = [
      screen.getByLabelText('切换主题'),
      screen.getByLabelText('下载 App'),
      screen.getByLabelText('更多'),
    ];
    for (const element of iconButtons) {
      expect(element.className).toContain('h-10');
      expect(element.className).toContain('w-10');
    }
  });
});
