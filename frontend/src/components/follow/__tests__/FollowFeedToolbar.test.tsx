import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FollowFeedToolbar } from '../FollowFeedToolbar';
import type { FollowItem } from '@/types';

const makeFollow = (overrides: Partial<FollowItem>): FollowItem => ({
  key: 'abc123',
  entityType: 'actress',
  entityKey: 'abc123',
  name: '女优A',
  createdAt: 0,
  notifyInApp: true,
  lastCheckedAt: 0,
  checkFailing: false,
  unread: 0,
  ...overrides,
});

const follows = [
  makeFollow({}),
  makeFollow({
    key: 'director:director/o7',
    entityType: 'director',
    entityKey: 'director/o7',
    name: '苺原',
  }),
  makeFollow({
    key: 'tag:genre/2a',
    entityType: 'tag',
    entityKey: 'genre/2a',
    name: '巨乳',
  }),
];

const renderToolbar = (props: Partial<React.ComponentProps<typeof FollowFeedToolbar>> = {}) => {
  const handlers = {
    onFilterKeyChange: vi.fn(),
    onKeywordChange: vi.fn(),
    onSearch: vi.fn(),
    onClearSearch: vi.fn(),
  };
  render(
    <FollowFeedToolbar
      follows={follows}
      filterKey=""
      keyword=""
      activeKeyword=""
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('FollowFeedToolbar', () => {
  it('按女优/导演/标签分组展示可选关注对象', () => {
    renderToolbar();
    const select = screen.getByRole('combobox');
    const groups = Array.from(select.querySelectorAll('optgroup')).map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['女优', '导演', '标签']);
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toContain('巨乳');
  });

  it('选择关注对象时回传 watch key', () => {
    const handlers = renderToolbar();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tag:genre/2a' } });
    expect(handlers.onFilterKeyChange).toHaveBeenCalledWith('tag:genre/2a');
  });

  it('提交关键词触发搜索，空关键词不提交空串以外的处理', () => {
    const handlers = renderToolbar({ keyword: ' 巨乳 ' });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(handlers.onSearch).toHaveBeenCalledTimes(1);
  });

  it('窄宽度下限制自身宽度并允许换行，避免筛选条越界', () => {
    renderToolbar();
    const select = screen.getByRole('combobox');
    const root = select.parentElement as HTMLElement;
    expect(root.className).toContain('min-w-0');
    expect(root.className).toContain('max-w-full');
    expect(root.className).toContain('sm:flex-wrap');
    expect(select.className).toContain('w-full');
    expect(select.className).toContain('sm:max-w-[240px]');
    expect(select.className).toContain('sm:shrink-0');
  });

  it('已有搜索关键词时展示返回动态入口', () => {
    const handlers = renderToolbar({ keyword: '巨乳', activeKeyword: '巨乳' });
    fireEvent.click(screen.getByRole('button', { name: '返回动态' }));
    expect(handlers.onClearSearch).toHaveBeenCalledTimes(1);
  });
});
