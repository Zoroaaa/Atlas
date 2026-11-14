import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '../DashboardLayout';

vi.mock('@/stores', () => ({
  useAuthStore: () => ({
    user: { username: 'tester', role: 'user', roleDisplayName: '成员' },
    logout: vi.fn(),
  }),
  useThemeStore: () => ({
    resolvedTheme: 'light',
    toggleTheme: vi.fn(),
    sidebarCollapsed: false,
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock('@/contexts', () => ({
  useFeatureFlags: () => ({ communityEnabled: true }),
}));

vi.mock('@/hooks', () => ({
  useIsDesktop: () => false,
  useUnreadCount: () => ({ data: 0 }),
}));

vi.mock('@/hooks/useRouteEnterAnimation', () => ({
  useRouteEnterAnimation: () => ({ current: null }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<div>概览内容</div>} />
          <Route path="favorites" element={<div>收藏内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('个人中心移动端菜单页', () => {
  it('菜单页列出功能项，且不再出现系统设置入口', () => {
    renderAt('/dashboard');

    expect(screen.getByRole('link', { name: /我的收藏/ })).toHaveAttribute('href', '/dashboard/favorites');
    expect(screen.getByRole('link', { name: /概览/ })).toHaveAttribute('href', '/dashboard/overview');
    expect(screen.queryByText('系统设置')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /系统设置/ })).not.toBeInTheDocument();
  });

  it('点击菜单项进入内容页，返回按钮回到菜单页', () => {
    renderAt('/dashboard');

    fireEvent.click(screen.getByRole('link', { name: /我的收藏/ }));
    expect(screen.getByText('收藏内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByRole('link', { name: /我的收藏/ })).toBeInTheDocument();
  });

  it('直链进入子页时，返回落点为个人中心菜单页', () => {
    renderAt('/dashboard/favorites');

    expect(screen.getByText('收藏内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    expect(screen.getByRole('link', { name: /我的收藏/ })).toBeInTheDocument();
  });
});
