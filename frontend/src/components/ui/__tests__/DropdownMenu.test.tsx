import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropdownMenu, userMenuItems } from '../DropdownMenu';

const items = [{ id: 'item-a', label: '菜单项 A' }];

const renderMenu = () =>
  render(<DropdownMenu trigger={<button>打开菜单</button>} items={items} triggerMode="click" />);

describe('DropdownMenu', () => {
  it('菜单锚定在触发器下方（使用 top-full），不会回落到触发器上方', () => {
    renderMenu();
    fireEvent.click(screen.getByText('打开菜单'));

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('top-full');
  });

  it('点击外部立即卸载菜单，不依赖延时卸载', () => {
    renderMenu();
    fireEvent.click(screen.getByText('打开菜单'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('再次点击触发器可关闭菜单', () => {
    renderMenu();
    const trigger = screen.getByText('打开菜单');

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('userMenuItems', () => {
  const t = ((key: string) => key) as never;
  const navigate = vi.fn();
  const logout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ids = (isAdmin: boolean) =>
    userMenuItems(t, navigate, logout, { isAdmin }).map((item) => item.id);

  it('桌面端下拉统一提供个人中心、社区、设置与退出登录', () => {
    const menuIds = ids(false);

    expect(menuIds).toEqual(expect.arrayContaining(['dashboard', 'community', 'settings', 'logout']));
  });

  it('设置项进入独立设置页，而不是个人中心子路由', () => {
    const settings = userMenuItems(t, navigate, logout, { isAdmin: false }).find((item) => item.id === 'settings');

    settings?.onClick?.();

    expect(navigate).toHaveBeenCalledWith('/settings');
  });

  it('不再包含收藏与搜索历史，并提供社区入口', () => {
    const menuIds = ids(false);

    expect(menuIds).not.toContain('favorites');
    expect(menuIds).not.toContain('history');
    expect(menuIds).toContain('community');
  });

  it('非管理员菜单中完全没有管理员看板入口', () => {
    expect(ids(false)).not.toContain('admin-panel');
  });

  it('管理员菜单中包含管理员看板入口', () => {
    expect(ids(true)).toContain('admin-panel');
  });
});
