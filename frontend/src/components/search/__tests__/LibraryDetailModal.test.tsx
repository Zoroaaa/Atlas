import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/follow/FollowButton', () => ({
  FollowButton: ({ name }: { name: string }) => <button type="button">follow-{name}</button>,
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    libraryApi: {
      ...actual.libraryApi,
      getRecord: vi.fn().mockResolvedValue({
        found: true,
        record: {
          id: 'r1',
          recordType: 'jav',
          title: '测试标题',
          code: 'ABP-123',
          cover: '/cover.jpg',
          actors: ['女優A'],
          tags: ['巨乳'],
          detailCompleted: true,
          contentData: {
            actresses: ['女優A'],
            detailUrl: 'https://www.javbus.com/ABP-123',
            tagLinks: [{ kind: 'tag', name: '巨乳', path: '/genre/2a' }],
          },
          sources: [],
          firstSeenAt: 0,
          lastUpdatedAt: 0,
        },
      }),
    },
  };
});

import { LibraryDetailModal } from '../LibraryDetailModal';

describe('历史/收藏详情卡片：与搜索详情共用标签与演员实现', () => {
  it('标签为黄色下划线链接，演员可点击且旁有关注按钮', async () => {
    const onActressClick = vi.fn();
    render(
      <LibraryDetailModal
        target={{ type: 'jav', code: 'ABP-123' }}
        onClose={vi.fn()}
        onActressClick={onActressClick}
      />
    );

    expect(await screen.findByText('测试标题')).toBeInTheDocument();

    const tag = screen.getByTitle('巨乳');
    expect(tag.className).toContain('text-primary-600');
    expect(tag.className).toContain('underline');
    expect(tag.className).toContain('decoration-dotted');

    const actor = screen.getByTitle('女優A');
    expect(actor.className).toContain('border-accent-500');
    expect(screen.getByText('follow-女優A')).toBeInTheDocument();

    fireEvent.click(actor);
    expect(onActressClick).toHaveBeenCalledWith('女優A');
  });
});
