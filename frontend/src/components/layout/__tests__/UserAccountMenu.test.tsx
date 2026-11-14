import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UserAccountMenu } from '../UserAccountMenu';

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ logout: vi.fn() }),
}));

const renderAt = (isAdmin: boolean) =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <UserAccountMenu
              isAuthenticated
              user={{ username: 'tester' }}
              isAdmin={isAdmin}
            />
          }
        />
        <Route path="/settings" element={<div>设置页</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('桌面端头像下拉', () => {
  it('直接提供个人中心、社区、设置与退出登录', () => {
    renderAt(false);
    fireEvent.click(screen.getByText('tester'));

    expect(screen.getByText('个人中心')).toBeInTheDocument();
    expect(screen.getByText('社区')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('退出登录')).toBeInTheDocument();
  });

  it('管理员可见管理看板，普通用户不可见', () => {
    const { unmount } = renderAt(true);
    fireEvent.click(screen.getByText('tester'));
    expect(screen.getByText('管理看板')).toBeInTheDocument();
    unmount();

    renderAt(false);
    fireEvent.click(screen.getByText('tester'));
    expect(screen.queryByText('管理看板')).not.toBeInTheDocument();
  });

  it('设置入口进入独立设置页', () => {
    renderAt(false);
    fireEvent.click(screen.getByText('tester'));
    fireEvent.click(screen.getByText('设置'));

    expect(screen.getByText('设置页')).toBeInTheDocument();
  });
});
