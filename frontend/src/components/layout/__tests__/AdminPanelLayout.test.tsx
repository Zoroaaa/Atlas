import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminPanelLayout } from '../AdminPanelLayout';

vi.mock('@/stores', () => ({
  useAuthStore: () => ({
    user: { username: 'admin', role: 'admin', roleDisplayName: '管理员' },
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
}));

vi.mock('@/hooks/useRouteEnterAnimation', () => ({
  useRouteEnterAnimation: () => ({ current: null }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin-panel" element={<AdminPanelLayout />}>
          <Route index element={<div>概览内容</div>} />
          <Route path="overview" element={<div>概览内容</div>} />
          <Route path="users" element={<div>用户内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('管理看板移动端菜单页', () => {
  it('「看板概览」指向独立内容路由', () => {
    renderAt('/admin-panel');

    expect(screen.getByRole('link', { name: /看板概览/ })).toHaveAttribute('href', '/admin-panel/overview');
    expect(screen.getByRole('link', { name: /用户管理/ })).toHaveAttribute('href', '/admin-panel/users');
  });

  it('点击「看板概览」进入内容页，返回按钮回到菜单页', () => {
    renderAt('/admin-panel');

    fireEvent.click(screen.getByRole('link', { name: /看板概览/ }));
    expect(screen.getByText('概览内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByRole('link', { name: /看板概览/ })).toBeInTheDocument();
  });

  it('直链进入概览子页时，返回落点为管理看板菜单页', () => {
    renderAt('/admin-panel/overview');

    expect(screen.getByText('概览内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    expect(screen.getByRole('link', { name: /看板概览/ })).toBeInTheDocument();
  });
});
