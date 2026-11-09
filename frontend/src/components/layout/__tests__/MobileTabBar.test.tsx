import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileTabBar } from '../MobileTabBar';

const mocks = vi.hoisted(() => ({ communityEnabled: true }));

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

vi.mock('@/contexts', () => ({
  useFeatureFlags: () => ({ communityEnabled: mocks.communityEnabled }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>
  );

describe('MobileTabBar', () => {
  beforeEach(() => {
    mocks.communityEnabled = true;
  });

  it('高亮完全由路由推导：个人中心', () => {
    renderAt('/dashboard/favorites');

    expect(screen.getByRole('link', { name: '个人中心' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '首页' })).not.toHaveAttribute('aria-current');
  });

  it('高亮完全由路由推导：我的', () => {
    renderAt('/me');

    expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '个人中心' })).not.toHaveAttribute('aria-current');
  });

  it('管理后台路由仍高亮「我的」', () => {
    renderAt('/admin-panel/users');

    expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('aria-current', 'page');
  });

  it('高亮完全由路由推导：社区与首页', () => {
    const { unmount } = renderAt('/community');
    expect(screen.getByRole('link', { name: '社区' })).toHaveAttribute('aria-current', 'page');
    unmount();

    renderAt('/main');
    expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute('aria-current', 'page');
  });

  it('社区关闭时不出现社区入口', () => {
    mocks.communityEnabled = false;
    renderAt('/main');

    expect(screen.queryByRole('link', { name: '社区' })).not.toBeInTheDocument();
  });
});
