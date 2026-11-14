import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProxyImage } from '../ImagePreview';

describe('ProxyImage 放大查看', () => {
  it('点击封面打开大图，Esc 关闭', () => {
    render(<ProxyImage src="/cover.jpg" alt="测试封面" />);
    fireEvent.click(screen.getByRole('button', { name: /测试封面/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('键盘 Enter / 空格可打开大图，点击关闭按钮关闭', () => {
    render(<ProxyImage src="/cover.jpg" alt="键盘封面" />);
    const cover = screen.getByRole('button', { name: /键盘封面/ });

    fireEvent.keyDown(cover, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(cover, { key: ' ' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('图片加载失败后不再打开空白大图层', () => {
    render(<ProxyImage src="/broken.jpg" alt="坏图封面" />);
    const image = screen.getByAltText('坏图封面');
    fireEvent.error(image);

    expect(screen.queryByRole('button', { name: /坏图封面/ })).not.toBeInTheDocument();
    fireEvent.click(image);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('缓存命中、错过 load 事件时封面仍然可见', () => {
    const completeSpy = vi
      .spyOn(HTMLImageElement.prototype, 'complete', 'get')
      .mockReturnValue(true);
    const widthSpy = vi
      .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
      .mockReturnValue(800);

    render(<ProxyImage src="/cached.jpg" alt="缓存封面" />);

    expect(screen.getByAltText('缓存封面')).toHaveStyle({ opacity: '1' });

    completeSpy.mockRestore();
    widthSpy.mockRestore();
  });

  it('zoomable=false 时不开启放大', () => {
    render(<ProxyImage src="/cover.jpg" alt="不可放大" zoomable={false} />);
    fireEvent.click(screen.getByAltText('不可放大'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
