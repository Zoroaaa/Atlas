import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MobileMenuPage, MobileSectionHeader } from '../MobileSectionPage';

const groups = [
  {
    id: 'main',
    items: [
      { id: 'browse', label: '发现', to: '/community/browse' },
      { id: 'my-posts', label: '我的帖子', to: '/community/my-shares' },
    ],
  },
];

describe('MobileMenuPage', () => {
  it('菜单项点击后进入对应子页', () => {
    render(
      <MemoryRouter initialEntries={['/community']}>
        <Routes>
          <Route path="/community" element={<MobileMenuPage title="社区" groups={groups} />} />
          <Route path="/community/browse" element={<div>发现内容页</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: /发现/ }));

    expect(screen.getByText('发现内容页')).toBeInTheDocument();
  });

  it('内容页返回按钮回到对应菜单页（直链进入也有落点）', () => {
    render(
      <MemoryRouter initialEntries={['/community/browse']}>
        <Routes>
          <Route path="/community" element={<div>社区菜单页</div>} />
          <Route
            path="/community/browse"
            element={
              <>
                <MobileSectionHeader title="发现" backTo="/community" />
                <div>发现内容页</div>
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    expect(screen.getByText('社区菜单页')).toBeInTheDocument();
  });
});
