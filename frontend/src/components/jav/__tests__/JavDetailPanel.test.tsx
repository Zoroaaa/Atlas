import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/follow/FollowButton', () => ({
  FollowButton: ({ name }: { name: string }) => <button type="button">follow-{name}</button>,
}));

import { JavDetailPanel } from '../JavDetailPanel';
import type { JavDetail } from '@/types';

const detail: JavDetail = {
  code: 'ABP-123',
  title: '测试标题',
  cover: 'https://example.com/cover.jpg',
  releaseDate: '2024-01-01',
  duration: '120',
  director: '苺原',
  directorLinks: [{ kind: 'director', name: '苺原', path: '/director/o7' }],
  tags: ['巨乳', '單體作品'],
  tagLinks: [{ kind: 'tag', name: '巨乳', path: '/genre/2a' }],
  actresses: ['女優A', '女優B'],
  magnets: [],
  detailUrl: 'https://www.javbus.com/ABP-123',
};

describe('搜索详情卡片：标签与演员复用共享实现', () => {
  it('标签使用黄色下划线链接样式', () => {
    render(<JavDetailPanel detail={detail} status="success" onClose={vi.fn()} />);
    const tag = screen.getByTitle('巨乳');
    expect(tag.className).toContain('text-primary-600');
    expect(tag.className).toContain('underline');
    expect(tag.className).toContain('decoration-dotted');
  });

  it('演员红字红底 + 红下划线，旁边有关注按钮，点击调用女优卡片回调', () => {
    const onActressClick = vi.fn();
    render(
      <JavDetailPanel
        detail={detail}
        status="success"
        onClose={vi.fn()}
        onActressClick={onActressClick}
      />
    );

    const actor = screen.getByTitle('女優A');
    expect(actor.className).toContain('border-accent-500');
    expect(screen.getByText('follow-女優A')).toBeInTheDocument();

    fireEvent.click(actor);
    expect(onActressClick).toHaveBeenCalledWith('女優A');
  });
});
